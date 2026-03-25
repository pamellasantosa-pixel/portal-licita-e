import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import {
  extractScoreSearchTerm,
  sanitizeOrgNameForPncpSearch
} from "./src/lib/esaScoring.js";

const PNCP_BASE_URL = "https://pncp.gov.br/app/editais";
const INPUT_FILE = path.resolve(process.cwd(), "qa_links_input.json");
const MAX_ATTEMPTS = 5;

const DEFAULT_CASES = [
  {
    id: "case-aracaju-quilombola",
    edital: "Aracaju Quilombola",
    organizationName: "Prefeitura Municipal de Aracaju/SE",
    reason: "termo:quilombola",
    expectedTerms: ["quilombola", "componente quilombola", "povos e comunidades tradicionais", "pct"]
  },
  {
    id: "case-incra-federal",
    edital: "INCRA Federal",
    organizationName: "INCRA",
    reason: "federal_incra_funai",
    evaluation: { matchedTopTerms: ["federal_incra_funai", "quilombola_ou_indigena"] },
    expectedTerms: ["quilombola", "indigena", "clpi", "oit 169", "convencao 169"]
  },
  {
    id: "case-santarem-pct",
    edital: "Santarem PCT",
    organizationName: "Municipio de Santarem/PA",
    reason: "termo:quilombola",
    expectedTerms: ["pct", "povos e comunidades tradicionais", "quilombola", "indigena"]
  }
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function loadCases() {
  if (!fs.existsSync(INPUT_FILE)) {
    return DEFAULT_CASES;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (error) {
    console.warn(`[WARN] Falha ao ler qa_links_input.json: ${error.message}`);
  }

  return DEFAULT_CASES;
}

function buildCombinedUrl(organizationName, queryTerm) {
  const cleanOrg = sanitizeOrgNameForPncpSearch(organizationName);
  const rawTerm = String(queryTerm || "")
    .replace(/^"|"$/g, "")
    .trim();
  const words = rawTerm.split(/\s+/).filter(Boolean);
  const formattedTerm = words.length === 1 ? `"${rawTerm}"` : rawTerm;
  const combined = [cleanOrg, formattedTerm].filter(Boolean).join(" ").trim();
  if (!combined) return `${PNCP_BASE_URL}?pagina=1`;
  return `${PNCP_BASE_URL}?q=${encodeURIComponent(combined)}`;
}

function buildTermOnlyUrl(queryTerm) {
  const rawTerm = String(queryTerm || "")
    .replace(/^"|"$/g, "")
    .trim();
  const words = rawTerm.split(/\s+/).filter(Boolean);
  const formattedTerm = words.length === 1 ? `"${rawTerm}"` : rawTerm;
  if (!formattedTerm) return `${PNCP_BASE_URL}?pagina=1`;
  return `${PNCP_BASE_URL}?q=${encodeURIComponent(formattedTerm)}`;
}

function buildTermAndCityUrl(queryTerm, organizationName) {
  const cleanOrg = sanitizeOrgNameForPncpSearch(organizationName);
  const ignore = new Set([
    "prefeitura",
    "municipal",
    "municipio",
    "fundo",
    "secretaria",
    "estado",
    "federal",
    "nacional",
    "instituto",
    "colonizacao",
    "de",
    "do",
    "da",
    "dos",
    "das"
  ]);

  const orgTokens = String(cleanOrg || "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !ignore.has(normalizeText(part)));

  const orgToken = orgTokens.at(-1) || orgTokens[0] || "";

  const rawTerm = String(queryTerm || "")
    .replace(/^"|"$/g, "")
    .trim();
  const words = rawTerm.split(/\s+/).filter(Boolean);
  const formattedTerm = words.length === 1 ? `"${rawTerm}"` : rawTerm;

  const query = [formattedTerm, orgToken].filter(Boolean).join(" ").trim();
  if (!query) return `${PNCP_BASE_URL}?pagina=1`;
  return `${PNCP_BASE_URL}?q=${encodeURIComponent(query)}`;
}

function normalizeCandidateTerm(candidate, organizationName) {
  const org = sanitizeOrgNameForPncpSearch(organizationName);
  const normalizedOrg = normalizeText(org);
  let value = String(candidate || "")
    .replace(/^"|"$/g, "")
    .trim();
  if (!value) return "";

  const normalizedValue = normalizeText(value);
  if (normalizedOrg && normalizedValue.startsWith(normalizedOrg)) {
    value = value.slice(org.length).trim();
  }

  return value;
}

function buildCandidateTerms(testCase) {
  const fromScore = extractScoreSearchTerm(testCase.reason, testCase.evaluation || {});
  const baseTerm = normalizeCandidateTerm(
    fromScore || (Array.isArray(testCase.expectedTerms) ? testCase.expectedTerms[0] : "") || "quilombola",
    testCase.organizationName
  );

  const candidates = [
    baseTerm,
    `${baseTerm} edital`,
    `${baseTerm} povos e comunidades tradicionais`,
    `${baseTerm} pct`,
    `${baseTerm} componente`,
    `fundacao cultural ${baseTerm}`.trim(),
    `consulta previa ${baseTerm}`.trim(),
    `convencao 169 ${baseTerm}`.trim()
  ];

  return Array.from(
    new Set(
      candidates
        .map((item) => normalizeCandidateTerm(item, testCase.organizationName))
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, MAX_ATTEMPTS + 2);
}

async function collectResultSnippets(page) {
  const snippets = await page
    .locator("article, .card, li, .resultado-item, h2, h3, a")
    .allTextContents()
    .catch(() => []);

  const cleaned = snippets
    .map((text) => String(text || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 30);

  return cleaned;
}

function scoreRelevance(snippets, expectedTerms) {
  if (!snippets.length) return 0;
  const normalizedSnippets = snippets.map(normalizeText).join(" \n ");
  let hits = 0;

  for (const term of expectedTerms || []) {
    if (!term) continue;
    if (normalizedSnippets.includes(normalizeText(term))) {
      hits += 1;
    }
  }

  return hits;
}

function getDominantKeywords(candidateTerm, expectedTerms = []) {
  const candidateTokens = String(candidateTerm || "")
    .split(/\s+/)
    .map((part) => normalizeText(part))
    .filter((part) => part.length >= 4);

  const expectedTokens = expectedTerms
    .flatMap((term) => String(term || "").split(/\s+/))
    .map((part) => normalizeText(part))
    .filter((part) => part.length >= 4);

  return Array.from(new Set([...candidateTokens, ...expectedTokens]));
}

async function validateUrl(page, testCase, candidateTerm, options = {}) {
  const url = options.termOnly
    ? buildTermOnlyUrl(candidateTerm)
    : options.termAndCity
      ? buildTermAndCityUrl(candidateTerm, testCase.organizationName)
      : buildCombinedUrl(testCase.organizationName, candidateTerm);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page
    .waitForSelector("body", { timeout: 10000 })
    .catch(() => null);
  await page
    .waitForSelector("article, .card, li, .resultado-item, h2, h3, a", { timeout: 10000 })
    .catch(() => null);

  const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
  if (bodyText.includes("nenhum resultado")) {
    return {
      ok: false,
      reason: "Nenhum resultado encontrado",
      url,
      snippets: []
    };
  }

  const snippets = await collectResultSnippets(page);
  const relevanceHits = scoreRelevance(snippets, testCase.expectedTerms || []);
  const normalizedSnippets = normalizeText(snippets.join(" \n "));
  const dominantKeywords = getDominantKeywords(candidateTerm, testCase.expectedTerms || []);
  const keywordHit = dominantKeywords.some((keyword) => normalizedSnippets.includes(keyword));
  const isRelevant = relevanceHits > 0 || keywordHit;

  if (!isRelevant) {
    return {
      ok: false,
      reason: "Primeiros resultados sem relacao com nicho ESA",
      url,
      snippets
    };
  }

  return {
    ok: true,
    reason: `Relevancia encontrada (${relevanceHits} hit(s))`,
    url,
    snippets
  };
}

async function runCase(page, testCase) {
  const candidates = buildCandidateTerms(testCase);
  const attempts = [];

  for (const candidate of candidates) {
    const result = await validateUrl(page, testCase, candidate, { termOnly: false });
    attempts.push({ candidate, ...result });
    if (result.ok) {
      return {
        status: "VALIDADO",
        selectedUrl: result.url,
        selectedTerm: candidate,
        attempts
      };
    }
  }

  const normalizedOrg = normalizeText(testCase.organizationName || "");
  const hasAracajuQuilombola =
    normalizedOrg.includes("aracaju") &&
    candidates.some((candidate) => normalizeText(candidate).includes("quilombola"));

  if (hasAracajuQuilombola) {
    const specialTerm = "quilombola";
    const special = await validateUrl(page, testCase, specialTerm, { termAndCity: true });
    attempts.push({ candidate: `${specialTerm} [termo_cidade]`, ...special });
    if (special.ok) {
      return {
        status: "VALIDADO",
        selectedUrl: special.url,
        selectedTerm: `${specialTerm} [termo_cidade]`,
        attempts
      };
    }
  }

  // Fallback universal: se nao validou por orgao+termo, tenta termo+cidade e depois termo puro.
  for (const candidate of candidates) {
    const termAndCityResult = await validateUrl(page, testCase, candidate, { termAndCity: true });
    attempts.push({ candidate: `${candidate} [termo_cidade]`, ...termAndCityResult });
    if (termAndCityResult.ok) {
      return {
        status: "VALIDADO",
        selectedUrl: termAndCityResult.url,
        selectedTerm: `${candidate} [termo_cidade]`,
        attempts
      };
    }

    const termOnlyResult = await validateUrl(page, testCase, candidate, { termOnly: true });
    attempts.push({ candidate: `${candidate} [termo_only]`, ...termOnlyResult });
    if (termOnlyResult.ok) {
      return {
        status: "VALIDADO",
        selectedUrl: termOnlyResult.url,
        selectedTerm: `${candidate} [termo_only]`,
        attempts
      };
    }
  }

  return {
    status: "FALHA",
    selectedUrl: attempts.at(-1)?.url || "",
    selectedTerm: attempts.at(-1)?.candidate || "",
    attempts
  };
}

function printReport(results) {
  console.log("\n================ RELATORIO QA PNCP ================");

  for (const result of results) {
    const icon = result.status === "VALIDADO" ? "[OK]" : "[FALHA]";
    console.log(`${icon} ${result.edital}`);
    console.log(`  Status: ${result.status}`);
    console.log(`  Termo final: ${result.selectedTerm || "-"}`);
    console.log(`  URL final: ${result.selectedUrl || "-"}`);

    for (const attempt of result.attempts) {
      const mark = attempt.ok ? "OK" : "FALHA";
      console.log(`    - ${mark} | termo='${attempt.candidate}' | motivo='${attempt.reason}'`);
    }
  }

  const validated = results.filter((item) => item.status === "VALIDADO");
  const failed = results.filter((item) => item.status === "FALHA");

  console.log("\n---------------- RESUMO FINAL ----------------");
  console.log(`Validados: ${validated.length}`);
  console.log(`Falhas: ${failed.length}`);
  console.log("Editais 100% validados:");
  if (validated.length === 0) {
    console.log("  - Nenhum");
  } else {
    for (const item of validated) {
      console.log(`  - ${item.edital} -> ${item.selectedUrl}`);
    }
  }
}

async function main() {
  const cases = loadCases();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  const results = [];
  try {
    for (const testCase of cases) {
      const result = await runCase(page, testCase);
      results.push({
        edital: testCase.edital || testCase.id || "edital-sem-nome",
        ...result
      });
    }
  } finally {
    await browser.close();
  }

  printReport(results);

  if (results.some((item) => item.status === "FALHA")) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Erro na execucao do QA PNCP:", error?.message || error);
  process.exit(1);
});
