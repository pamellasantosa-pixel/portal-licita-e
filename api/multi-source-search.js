import { fetchComprasGovOpenBidsByKeywords } from "../server/_shared/compras-api-service.js";
import { validateDocumentLink } from "../server/_shared/link-validation.js";

const PNCP_SEARCH_URL = "https://pncp.gov.br/api/search";

const FEDERAL_PRIORITY_ORGS = ["INCRA", "FUNAI", "IBAMA", "ICMBio", "MMA"];

const FEDERAL_CRITICAL_TERMS = [
  "Estudo de Componente Quilombola",
  "Diagnostico Socioambiental",
  "Relatorio de Impacto a Comunidade",
  "Consulta OIT 169"
];

const PRIORITY_SCORING = [
  { label: "CLPI", terms: ["clpi", "consulta previa", "consulta livre", "oit 169", "convencao 169"], weight: 10 },
  { label: "Quilombola", terms: ["quilombola", "componente quilombola"], weight: 10 },
  { label: "Indigena", terms: ["indigena", "indigena", "componente indigena"], weight: 10 },
  { label: "Diagnostico Socioambiental", terms: ["diagnostico socioambiental", "diagnostico socioterritorial"], weight: 10 },
  { label: "Convencao 169 OIT", terms: ["convencao 169", "oit 169"], weight: 10 },
  { label: "Mediacao de Conflitos", terms: ["mediacao de conflitos", "mediacao"], weight: 10 }
];

const NEGATIVE_TERMS = [
  "aquisicao de materiais",
  "pavimentacao",
  "obras de pavimentacao",
  "brinquedo",
  "brinquedos",
  "alimenticio",
  "alimenticios",
  "generos alimenticios"
];
const PRIORITY_CNAES = ["7490-1/99", "7320-3/00", "7119-7/99"];
const COMPRAS_GOV_TIMEOUT_MS = 10000;

const SOURCE_CONFIG = {
  compras_gov: {
    name: "Compras.gov.br Federal",
    apiBase: process.env.COMPRAS_GOV_API_BASE_URL || "https://api.compras.gov.br/licitacoes/v1/licitacoes",
    template:
      process.env.COMPRAS_GOV_SEARCH_TEMPLATE ||
      "https://www.gov.br/compras/pt-br/acesso-a-informacao/consulta-licitacoes?termo={query}"
  }
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isPriorityFederalOrg(orgName) {
  const normalized = normalizeText(orgName);
  return FEDERAL_PRIORITY_ORGS.some((org) => normalized.includes(normalizeText(org)));
}

function hasFederalAutoTop(text, orgName) {
  const normalizedText = normalizeText(text);
  const normalizedOrg = normalizeText(orgName);
  const isIncraOrFunai = normalizedOrg.includes("incra") || normalizedOrg.includes("funai");
  if (!isIncraOrFunai) return false;
  return normalizedText.includes("quilombola") || normalizedText.includes("indigena");
}

function scoreESA(text, context = {}) {
  const lowered = normalizeText(text);
  if (NEGATIVE_TERMS.some((term) => lowered.includes(normalizeText(term)))) {
    return {
      score: 0,
      hidden: true,
      matched: [],
      negatives: NEGATIVE_TERMS.filter((term) => lowered.includes(normalizeText(term)))
    };
  }

  if (hasFederalAutoTop(text, context.organization || "")) {
    return {
      score: 10,
      hidden: false,
      matched: ["federal_incra_funai", "quilombola_ou_indigena"],
      negatives: []
    };
  }

  let score = 0;
  const matched = [];

  for (const rule of PRIORITY_SCORING) {
    if (rule.terms.some((term) => lowered.includes(normalizeText(term)))) {
      score += rule.weight;
      matched.push(rule.label);
    }
  }

  if (
    lowered.includes("clpi") ||
    lowered.includes("consulta previa") ||
    lowered.includes("quilombola") ||
    lowered.includes("indigena") ||
    lowered.includes("diagnostico socioambiental") ||
    lowered.includes("convencao 169")
  ) {
    score = 10;
  } else {
    score = Math.min(9, score + PRIORITY_CNAES.filter((code) => lowered.includes(code)).length * 5);
  }

  return {
    score,
    hidden: false,
    matched,
    negatives: []
  };
}

function normalizePncpItems(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.itens)) return payload.itens;
  if (Array.isArray(payload?.resultado)) return payload.resultado;
  return [];
}

function buildPncpSearchUrl(orgaoCnpj, organizationName) {
  const cleaned = String(orgaoCnpj || "").replace(/\D/g, "");
  if (cleaned.length === 14) {
    return `https://pncp.gov.br/app/editais?q=${cleaned}`;
  }
  const term = String(organizationName || "").trim();
  if (term) {
    return `https://pncp.gov.br/app/editais?q=${encodeURIComponent(term)}`;
  }
  return "https://pncp.gov.br/app/editais?pagina=1";
}

function normalizeYear(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 4 ? digits : "";
}

function normalizeSequential(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const asNumber = Number(digits);
  if (!Number.isFinite(asNumber)) return digits;
  return String(asNumber);
}

function parseDirectIdentifiers(item = {}, sourcePath = "") {
  const pathMatch = String(sourcePath || "").match(/^\/compras\/(\d{14})\/(\d{4})\/(\d+)/i);
  if (pathMatch) {
    return {
      cnpj: pathMatch[1],
      ano: normalizeYear(pathMatch[2]),
      sequencial: normalizeSequential(pathMatch[3])
    };
  }

  const control = String(item.numero_controle_pncp || item.numeroControlePNCP || "");
  const slashPattern = control.match(/^(\d{14})-(\d+)-(\d+)\/(\d{4})$/);
  if (slashPattern) {
    return {
      cnpj: slashPattern[1],
      ano: normalizeYear(slashPattern[4]),
      sequencial: normalizeSequential(slashPattern[3])
    };
  }

  return {
    cnpj: "",
    ano: normalizeYear(item.anoCompra || item.ano || item.anoCompraPncp),
    sequencial: normalizeSequential(item.numero_sequencial || item.sequencialCompra || item.numero)
  };
}

function buildPncpDirectEditalUrl(cnpj, ano, sequencial) {
  const safeCnpj = String(cnpj || "").replace(/\D/g, "");
  const safeAno = normalizeYear(ano);
  const safeSeq = normalizeSequential(sequencial);
  if (safeCnpj.length === 14 && safeAno && safeSeq) {
    return `https://pncp.gov.br/app/editais/${safeCnpj}/${safeAno}/${safeSeq}`;
  }
  return "";
}

function makeAbsoluteUrl(baseUrl, url) {
  if (!url) return baseUrl;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) {
    try {
      const origin = new URL(baseUrl).origin;
      return `${origin}${url}`;
    } catch {
      return url;
    }
  }
  return url;
}

function extractAnchors(html, pageUrl) {
  const anchors = [];
  const regex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match = regex.exec(html);

  while (match) {
    const href = makeAbsoluteUrl(pageUrl, match[1]);
    const text = String(match[2] || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const lowerHref = String(href || "").toLowerCase();
    const isEmailLink = lowerHref.startsWith("mailto:") || /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(String(href || ""));

    if (
      text.length > 20 &&
      !text.toLowerCase().includes("entrar") &&
      !text.toLowerCase().includes("login") &&
      !isEmailLink
    ) {
      anchors.push({ href, text });
    }

    match = regex.exec(html);
  }

  return anchors.slice(0, 80);
}

async function fetchPncpByKeywords(keywords) {
  const statuses = ["recebendo_proposta", "1", "2", "3", "4", "5"];
  const all = [];
  const errors = [];

  for (const keyword of keywords) {
    const jobs = statuses.map(async (status) => {
      const params = new URLSearchParams({
        tipos_documento: "edital",
        status,
        q: keyword,
        pagina: "1",
        tamanhoPagina: "20"
      });

      try {
        const response = await fetch(`${PNCP_SEARCH_URL}?${params.toString()}`, {
          headers: { "User-Agent": "Licita-E/1.0 (PNCP multi-source)" }
        });
        if (!response.ok) {
          errors.push(`pncp_http_${response.status}:${keyword}:${status}`);
          return [];
        }
        const payload = await response.json().catch(() => null);
        return normalizePncpItems(payload);
      } catch (error) {
        errors.push(`pncp_network:${keyword}:${status}:${String(error?.message || error)}`);
        return [];
      }
    });

    const result = await Promise.all(jobs);
    all.push(...result.flat());
  }

  if (all.length === 0 && errors.length > 0) {
    throw new Error(errors.slice(0, 3).join(" | "));
  }

  return all.map((item) => ({
    ...(function () {
      const organizationName =
        item.orgao_nome || item.orgaoEntidade?.razaoSocial || item.unidadeOrgao?.nomeUnidade || "Orgao nao informado";
      const sourcePath = item.item_url || item.linkSistemaOrigem || item.url || "";
      const directIds = parseDirectIdentifiers(item, sourcePath);
      const cleanedCnpj = String(directIds.cnpj || item.orgaoEntidade?.cnpj || item.cnpj || "").replace(/\D/g, "");
      const validCnpj = cleanedCnpj.length === 14 ? cleanedCnpj : null;
      const fallbackUrl = buildPncpSearchUrl(validCnpj, organizationName);
      const deepLink = buildPncpDirectEditalUrl(validCnpj, directIds.ano, directIds.sequencial) || fallbackUrl;
      return {
        organizationName,
        validCnpj,
        resolvedUrl: deepLink,
        ano: directIds.ano || null,
        sequencial: directIds.sequencial || null
      };
    })(),
    source: "PNCP",
    source_system: "PNCP",
    source_priority: 2,
    title: item.title || item.objetoCompra || item.objeto || "Sem titulo",
    description: item.description || item.descricao || item.objetoCompra || item.objeto || "",
    organization: organizationName,
    orgao_cnpj: validCnpj,
    edital_ano: ano,
    edital_sequencial: sequencial,
    published_date: item.data_publicacao_pncp || item.dataPublicacao || null,
    url: resolvedUrl
  })).map(({ organizationName, validCnpj, resolvedUrl, ano, sequencial, ...rest }) => rest);
}

function normalizeApiItems(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.resultado)) return payload.resultado;
  if (Array.isArray(payload)) return payload;
  return [];
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = COMPRAS_GOV_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseComprasGovApiRows(payload, orgName, term) {
  const items = normalizeApiItems(payload);
  return items.map((item) => {
    const title = firstNonEmpty([
      item.title,
      item.titulo,
      item.objeto,
      item.objetoCompra,
      item.descricao,
      `Licitacao ${orgName}`
    ]);

    const detailUrl = firstNonEmpty([
      item.url,
      item.link,
      item.href,
      item.details_url,
      item.linkDetalhe,
      item.edital_url,
      item.linkEdital
    ]);

    const organization = firstNonEmpty([
      item.organization,
      item.orgao,
      item.orgao_nome,
      item.uasg_nome,
      orgName
    ]);

    return {
      source: SOURCE_CONFIG.compras_gov.name,
      title,
      description: firstNonEmpty([item.description, item.descricao, item.resumo, term]),
      organization,
      orgao_cnpj: String(item.orgao_cnpj || item.cnpj || "").replace(/\D/g, "") || null,
      published_date: item.published_date || item.dataPublicacao || item.data_publicacao || null,
      url: detailUrl || SOURCE_CONFIG.compras_gov.template.replace("{query}", encodeURIComponent(`${orgName} ${term}`))
    };
  });
}

async function fetchComprasGovFederalViaApi(orgName, term) {
  if (!SOURCE_CONFIG.compras_gov.apiBase) return [];

  const params = new URLSearchParams({
    orgao: orgName,
    termo: term,
    pagina: "1",
    tamanhoPagina: "20"
  });

  const url = `${SOURCE_CONFIG.compras_gov.apiBase}?${params.toString()}`;
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent": "Licita-E/1.0 (busca federal ESA)"
      }
    },
    COMPRAS_GOV_TIMEOUT_MS
  ).catch(() => null);

  if (!response || !response.ok) return [];
  const payload = await response.json().catch(() => null);
  return parseComprasGovApiRows(payload, orgName, term);
}

async function scrapeSourceByKeywords(sourceName, template, keywords, fallbackOrganization = "") {
  const rows = [];

  for (const keyword of keywords) {
    const url = template.replace("{query}", encodeURIComponent(keyword));
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": "Licita-E/1.0 (busca de oportunidades ESA)"
        }
      },
      COMPRAS_GOV_TIMEOUT_MS
    ).catch(() => null);

    if (!response || !response.ok) continue;
    const html = await response.text();
    const anchors = extractAnchors(html, url);

    for (const anchor of anchors) {
      rows.push({
        source: sourceName,
        title: anchor.text,
        description: keyword,
        organization: fallbackOrganization || "Nao informado",
        published_date: null,
        url: anchor.href
      });
    }
  }

  return rows;
}

async function fetchComprasGovFederal(terms, warnings) {
  const rows = [];

  for (const orgName of FEDERAL_PRIORITY_ORGS) {
    for (const term of terms) {
      const apiRows = await fetchComprasGovFederalViaApi(orgName, term).catch(() => []);
      if (apiRows.length > 0) {
        rows.push(...apiRows);
        continue;
      }

      const scrapedRows = await scrapeSourceByKeywords(
        SOURCE_CONFIG.compras_gov.name,
        SOURCE_CONFIG.compras_gov.template,
        [`${orgName} ${term}`],
        orgName
      ).catch(() => []);

      if (scrapedRows.length === 0) {
        warnings.push(`Sem retorno no Compras.gov.br para ${orgName} com termo: ${term}`);
      }

      rows.push(...scrapedRows);
    }
  }

  return rows;
}

function consolidateRows(rows, keywords) {
  const seen = new Set();
  const consolidated = [];

  for (const row of rows) {
    const identity = `${row.source}|${row.url}|${row.title}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    const text = `${row.title} ${row.description || ""} ${row.organization || ""}`;
    const esa = scoreESA(text, { organization: row.organization || "" });
    if (esa.hidden) continue;

    const keywordHits = keywords.filter((term) => normalizeText(text).includes(normalizeText(term))).length;

    consolidated.push({
      ...row,
      source_system: row.source_system || (String(row.source || "").toLowerCase().includes("compras.gov") ? "COMPRAS_GOV" : "PNCP"),
      source_priority: Number(row.source_priority || (String(row.source || "").toLowerCase().includes("compras.gov") ? 1 : 2)),
      orgao_cnpj: String(row.orgao_cnpj || "").replace(/\D/g, "") || null,
      esa_score: Math.min(10, esa.score + keywordHits * 2),
      matched_signals: esa.matched,
      keyword_hits: keywordHits
    });
  }

  return consolidated.sort((a, b) => {
    const priorityDiff = (a.source_priority || 99) - (b.source_priority || 99);
    if (priorityDiff !== 0) return priorityDiff;
    return b.esa_score - a.esa_score;
  });
}

async function attachLinkValidation(rows) {
  const checked = await Promise.all(
    rows.map(async (row) => {
      const result = await validateDocumentLink(row.url, { timeoutMs: 8000 });
      return {
        ...row,
        is_link_valid: result.isValid,
        link_http_status: result.statusCode || null,
        link_validation_error: result.error || null
      };
    })
  );

  return checked;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const keywords =
    Array.isArray(req.body?.keywords) && req.body.keywords.length > 0 ? req.body.keywords : FEDERAL_CRITICAL_TERMS;
  const warnings = [];

  try {
    const pncpRows = await fetchPncpByKeywords(keywords).catch((err) => {
      warnings.push(`PNCP indisponivel: ${err.message || "erro"}`);
      return [];
    });

    const comprasGovRows = await fetchComprasGovOpenBidsByKeywords(keywords, { pageSize: 40 }).catch(() => {
      warnings.push("Compras.gov.br indisponivel para API oficial no momento");
      return [];
    });

    const comprasMapped = comprasGovRows.map((row) => ({
      source: row.source,
      source_system: row.source_system || "COMPRAS_GOV",
      source_priority: 1,
      title: row.title,
      description: row.description,
      organization: row.organization,
      orgao_cnpj: row.orgao_cnpj,
      published_date: row.published_date,
      url: row.url
    }));

    const consolidated = consolidateRows([...comprasMapped, ...pncpRows], keywords);
    const validated = await attachLinkValidation(consolidated);

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      count: validated.length,
      warnings,
      data: validated
    });
  } catch (error) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(500).json({ error: error.message || "Falha na busca multi-fonte ESA" });
  }
}
