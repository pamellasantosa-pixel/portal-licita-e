const PNCP_SEARCH_URL = "https://pncp.gov.br/api/search";

const GOLDEN_TERMS = [
  "Estudo de Componente Quilombola",
  "Plano de Manejo",
  "Diagnostico Socioterritorial",
  "Consulta Previa OIT 169"
];

const PRIORITY_SCORING = [
  { label: "CLPI", terms: ["clpi", "consulta previa", "consulta livre", "oit 169", "convencao 169"], weight: 10 },
  { label: "Quilombola", terms: ["quilombola", "componente quilombola"], weight: 10 },
  { label: "Indigena", terms: ["indigena", "indigena", "componente indigena"], weight: 10 },
  { label: "Diagnostico Socioambiental", terms: ["diagnostico socioambiental", "diagnostico socioterritorial"], weight: 10 },
  { label: "Convencao 169 OIT", terms: ["convencao 169", "oit 169"], weight: 10 },
  { label: "Mediacao de Conflitos", terms: ["mediacao de conflitos", "mediacao"], weight: 10 }
];

const NEGATIVE_TERMS = ["pavimentacao", "brinquedos", "obras de engenharia"];
const PRIORITY_CNAES = ["7490-1/99", "7320-3/00", "7119-7/99"];

const SOURCE_CONFIG = {
  licitacoes_e: {
    name: "Licitacoes-e (BB)",
    template:
      process.env.LICITACOES_E_SEARCH_TEMPLATE ||
      "https://www.licitacoes-e.com.br/aop/consulta-licitacoes?texto={query}"
  },
  compras_gov: {
    name: "Compras.gov.br",
    template:
      process.env.COMPRAS_GOV_SEARCH_TEMPLATE ||
      "https://www.gov.br/compras/pt-br/acesso-a-informacao/consulta-licitacoes?termo={query}"
  },
  portal_compras_publicas: {
    name: "Portal de Compras Publicas",
    template:
      process.env.PORTAL_COMPRAS_PUBLICAS_SEARCH_TEMPLATE ||
      "https://www.portaldecompraspublicas.com.br/processos?tt={query}"
  }
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function scoreESA(text) {
  const lowered = normalizeText(text);
  const hasAcquisition = lowered.includes("aquisicao");
  const hasPhysicalItems = ["brinquedos", "materiais", "veiculos", "itens fisicos"].some((term) => lowered.includes(term));

  if (NEGATIVE_TERMS.some((term) => lowered.includes(normalizeText(term))) || (hasAcquisition && hasPhysicalItems)) {
    return {
      score: 0,
      hidden: true,
      matched: [],
      negatives: NEGATIVE_TERMS.filter((term) => lowered.includes(normalizeText(term)))
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

  score += PRIORITY_CNAES.filter((code) => lowered.includes(code)).length * 5;

  if (lowered.includes("quilombola") || lowered.includes("clpi")) {
    score = 10;
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

  for (const keyword of keywords) {
    const jobs = statuses.map(async (status) => {
      const params = new URLSearchParams({
        tipos_documento: "edital",
        status,
        q: keyword,
        pagina: "1",
        tamanhoPagina: "20"
      });

      const response = await fetch(`${PNCP_SEARCH_URL}?${params.toString()}`);
      if (!response.ok) return [];
      const payload = await response.json().catch(() => null);
      return normalizePncpItems(payload);
    });

    const result = await Promise.all(jobs);
    all.push(...result.flat());
  }

  return all.map((item) => ({
    source: "PNCP",
    title: item.title || item.objetoCompra || item.objeto || "Sem titulo",
    description: item.description || item.descricao || item.objetoCompra || item.objeto || "",
    organization:
      item.orgao_nome || item.orgaoEntidade?.razaoSocial || item.unidadeOrgao?.nomeUnidade || "Orgao nao informado",
    orgao_cnpj: String(item.orgaoEntidade?.cnpj || item.cnpj || "").replace(/\D/g, "") || null,
    published_date: item.data_publicacao_pncp || item.dataPublicacao || null,
    url: item.item_url ? `https://pncp.gov.br/app/contratacoes${String(item.item_url).replace(/^\/compras/, "")}` : "https://pncp.gov.br/app/editais"
  }));
}

async function scrapeSourceByKeywords(sourceName, template, keywords) {
  const rows = [];

  for (const keyword of keywords) {
    const url = template.replace("{query}", encodeURIComponent(keyword));
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Licita-E/1.0 (busca de oportunidades ESA)"
      }
    }).catch(() => null);

    if (!response || !response.ok) continue;
    const html = await response.text();
    const anchors = extractAnchors(html, url);

    for (const anchor of anchors) {
      rows.push({
        source: sourceName,
        title: anchor.text,
        description: keyword,
        organization: "Nao informado",
        published_date: null,
        url: anchor.href
      });
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
    const esa = scoreESA(text);
    if (esa.hidden) continue;

    const keywordHits = keywords.filter((term) => normalizeText(text).includes(normalizeText(term))).length;

    consolidated.push({
      ...row,
      orgao_cnpj: String(row.orgao_cnpj || "").replace(/\D/g, "") || null,
      esa_score: esa.score + keywordHits * 2,
      matched_signals: esa.matched,
      keyword_hits: keywordHits
    });
  }

  return consolidated.sort((a, b) => b.esa_score - a.esa_score);
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

  const keywords = Array.isArray(req.body?.keywords) && req.body.keywords.length > 0 ? req.body.keywords : GOLDEN_TERMS;
  const warnings = [];

  try {
    const pncpRows = await fetchPncpByKeywords(keywords).catch((err) => {
      warnings.push(`PNCP indisponivel: ${err.message || "erro"}`);
      return [];
    });

    const [licitacoesRows, comprasGovRows, portalRows] = await Promise.all([
      scrapeSourceByKeywords(SOURCE_CONFIG.licitacoes_e.name, SOURCE_CONFIG.licitacoes_e.template, keywords).catch(() => {
        warnings.push("Licitacoes-e indisponivel para scraping/API no momento");
        return [];
      }),
      scrapeSourceByKeywords(SOURCE_CONFIG.compras_gov.name, SOURCE_CONFIG.compras_gov.template, keywords).catch(() => {
        warnings.push("Compras.gov.br indisponivel para scraping/API no momento");
        return [];
      }),
      scrapeSourceByKeywords(
        SOURCE_CONFIG.portal_compras_publicas.name,
        SOURCE_CONFIG.portal_compras_publicas.template,
        keywords
      ).catch(() => {
        warnings.push("Portal de Compras Publicas indisponivel para scraping/API no momento");
        return [];
      })
    ]);

    const consolidated = consolidateRows([...pncpRows, ...licitacoesRows, ...comprasGovRows, ...portalRows], keywords);

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      count: consolidated.length,
      warnings,
      data: consolidated
    });
  } catch (error) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(500).json({ error: error.message || "Falha na busca multi-fonte ESA" });
  }
}
