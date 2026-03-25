import { extractScoreSearchTerm, sanitizeOrgNameForPncpSearch } from "./src/lib/esaScoring.js";

const PNCP_EDITAIS_BASE_URL = "https://pncp.gov.br/app/editais";

function buildCombinedPncpUrl(organizationName, reason, evaluation = {}) {
  const orgTerm = sanitizeOrgNameForPncpSearch(organizationName);
  const scoreTerm = extractScoreSearchTerm(reason, evaluation);
  const combined = [orgTerm, scoreTerm].filter(Boolean).join(" ").trim();
  if (!combined) return `${PNCP_EDITAIS_BASE_URL}?pagina=1`;
  return `${PNCP_EDITAIS_BASE_URL}?q=${encodeURIComponent(combined)}`;
}

async function checkCase(testCase) {
  const url = buildCombinedPncpUrl(testCase.organizationName, testCase.reason, testCase.evaluation);

  const shouldContainSpace = Boolean(testCase.organizationName) && Boolean(extractScoreSearchTerm(testCase.reason, testCase.evaluation));
  if (shouldContainSpace && !url.includes("%20")) {
    throw new Error(`URL sem %20 para caso ${testCase.name}: ${url}`);
  }

  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": "Licita-E/1.0 (check_links)"
    }
  });

  if (!response.ok) {
    throw new Error(`Falha HTTP (${response.status}) no caso ${testCase.name}: ${url}`);
  }

  const html = await response.text();
  if (/Nenhum resultado encontrado/i.test(html)) {
    throw new Error(`PNCP retornou 'Nenhum resultado encontrado' no caso ${testCase.name}: ${url}`);
  }

  return url;
}

async function main() {
  const testCases = [
    {
      name: "Aracaju quilombola",
      organizationName: "Prefeitura Municipal de Aracaju/SE",
      reason: "termo:quilombola",
      evaluation: { matchedTopTerms: ["quilombola"] }
    },
    {
      name: "INCRA federal",
      organizationName: "INCRA",
      reason: "federal_incra_funai",
      evaluation: { matchedTopTerms: ["federal_incra_funai", "quilombola_ou_indigena"] }
    },
    {
      name: "Consulta previa",
      organizationName: "Municipio de Santarem/PA",
      reason: "termo:consulta previa",
      evaluation: { matchedTopTerms: ["consulta previa"] }
    }
  ];

  const failures = [];
  for (const testCase of testCases) {
    try {
      const url = await checkCase(testCase);
      console.log(`[OK] ${testCase.name}: ${url}`);
    } catch (error) {
      failures.push(String(error?.message || error));
      console.error(`[FAIL] ${testCase.name}: ${error?.message || error}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} validacao(oes) falharam.`);
    process.exit(1);
  }

  console.log("\nTodas as validacoes de links PNCP passaram.");
}

main().catch((error) => {
  console.error("Erro inesperado no check_links:", error?.message || error);
  process.exit(1);
});
