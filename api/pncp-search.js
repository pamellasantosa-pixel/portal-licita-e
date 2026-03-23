import { createClient } from "@supabase/supabase-js";
import {
  CNAES,
  EXCLUSION_TERMS,
  KEYWORDS,
  MAX_TICKET,
  MIN_TICKET,
  NICHES,
  PRIORITY_TERRITORIES,
  PROJECT_TERMS,
  REQUIRED_TERMS,
  TARGET_ORGS
} from "./_shared/filters.js";

const PNCP_SEARCH_URL = "https://pncp.gov.br/api/search";
const PNCP_BASE_URL = "https://pncp.gov.br";
const PRIORITY_CNAES = ["7490-1/99", "7320-3/00", "7119-7/99"];

const ESA_PRIORITY_RULES = [
  ["clpi", "consulta livre previa e informada", "consulta previa", "consulta livre"],
  ["quilombola", "componente quilombola"],
  ["indigena", "indigena", "componente indigena"],
  ["diagnostico socioambiental"],
  ["convencao 169 oit", "convencao 169", "oit 169"],
  ["mediacao de conflitos", "mediacao de conflitos territoriais", "mediacao"]
];

const NEGATIVE_HIDE_TERMS = [
  "pavimentacao",
  "pavimentacao",
  "brinquedos",
  "obras de engenharia"
];

function isEmailLike(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.toLowerCase().startsWith("mailto:")) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(text);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function extractOrgaoCnpj(item = {}, sourcePath = "") {
  const candidates = [
    item.orgaoEntidade?.cnpj,
    item.orgaoEntidade?.cnpjOrgaoEntidade,
    item.unidadeOrgao?.codigoUnidade,
    item.cnpj,
    item.cnpjOrgao,
    item.cnpj_origem,
    sourcePath.match(/^\/compras\/(\d{14})\//)?.[1]
  ];

  for (const candidate of candidates) {
    const cleaned = onlyDigits(candidate);
    if (cleaned.length === 14) return cleaned;
  }

  return null;
}

function hasAnyKeyword(text, words) {
  const normalized = normalizeText(text);
  return words.some((word) => normalized.includes(word.toLowerCase()));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function uniqTerms(values = []) {
  const set = new Set();
  for (const raw of values) {
    if (!raw) continue;
    const term = String(raw).trim();
    if (!term) continue;
    set.add(term);
  }
  return Array.from(set);
}

function parseNumericValue(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value).replace(/[^\d,.-]/g, "").replace(".", "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractTicketValue(rawItem = {}) {
  const candidates = [
    rawItem.valor_global,
    rawItem.valorEstimado,
    rawItem.valor_total_estimado,
    rawItem.valorTotalEstimado,
    rawItem.valorTotal,
    rawItem.preco_estimado,
    rawItem.precoGlobal
  ];
  for (const candidate of candidates) {
    const num = parseNumericValue(candidate);
    if (num != null) return num;
  }
  return null;
}

function splitTerms(value) {
  if (!value) return [];
  return String(value)
    .split(/[;,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function loadDynamicProfile(supabase, requestKeywords) {
  const [filtersResult, cnaesResult] = await Promise.all([
    supabase.from("bid_filters").select("keyword,target_audience").eq("is_active", true),
    supabase.from("company_cnae").select("cnae_code").eq("is_active", true)
  ]);

  const filterRows = filtersResult.error ? [] : filtersResult.data || [];
  const cnaeRows = cnaesResult.error ? [] : cnaesResult.data || [];

  const dbKeywords = filterRows.map((row) => row.keyword).filter(Boolean);
  const dbNiches = filterRows.flatMap((row) => splitTerms(row.target_audience));
  const dbCnaes = cnaeRows.map((row) => row.cnae_code).filter(Boolean);

  const keywords = uniqTerms([...(requestKeywords || []), ...dbKeywords, ...KEYWORDS]);
  const niches = uniqTerms([...dbNiches, ...NICHES]);
  const projects = uniqTerms([...PROJECT_TERMS]);
  const cnaes = uniqTerms([...dbCnaes, ...CNAES]);
  const targetOrgs = uniqTerms([...TARGET_ORGS]);
  const required = uniqTerms([...REQUIRED_TERMS]);
  const exclusions = uniqTerms([...EXCLUSION_TERMS]);
  const territories = uniqTerms([...PRIORITY_TERRITORIES]);

  return { keywords, niches, projects, cnaes, targetOrgs, required, exclusions, territories };
}

function normalizePncpItem(item) {
  const title = item.title || item.objetoCompra || item.objeto || item.titulo || "Sem titulo";
  const description =
    item.description ||
    item.descricao ||
    item.objetoCompra ||
    item.objeto ||
    item.resumo ||
    null;
  const organizationName = item.orgao_nome || item.orgaoEntidade?.razaoSocial || item.unidadeOrgao?.nomeUnidade || "Orgao nao informado";
  const sourcePath = item.item_url || item.linkSistemaOrigem || item.linkProcessoEletronico || item.url || "";
  const orgaoCnpj = extractOrgaoCnpj(item, sourcePath);

  // O payload do /api/search costuma trazer `item_url` no formato `/compras/<cnpj>/<ano>/<seq>`.
  // No app do PNCP, o deep-link mais consistente é via `/app/contratacoes/<cnpj>/<ano>/<seq>`.
  const normalizedPath =
    sourcePath && sourcePath.startsWith("/compras/")
      ? `/app/contratacoes${sourcePath.replace(/^\/compras/, "")}`
      : sourcePath;

  const sourceUrlRaw = normalizedPath.startsWith("http") ? normalizedPath : `${PNCP_BASE_URL}${normalizedPath}`;
  const sourceUrl = isEmailLike(sourceUrlRaw)
    ? `${PNCP_BASE_URL}/app/editais?q=${orgaoCnpj || ""}&pagina=1`
    : sourceUrlRaw;
  const publishedDate = item.data_publicacao_pncp || item.dataPublicacaoPncp || item.dataPublicacao || item.createdAt || new Date().toISOString();
  const closingDate = item.data_fim_vigencia || item.dataEncerramentoProposta || null;
  const pncpControl = item.numero_controle_pncp || item.numeroControlePNCP;
  const sequence = item.numero_sequencial || item.sequencialCompra;

  return {
    title,
    description,
    organization_name: organizationName,
    orgao_cnpj: orgaoCnpj,
    source_url: sourceUrl,
    pncp_id: String(pncpControl || sequence || Math.random()),
    modality: item.modalidade_licitacao_nome || item.modalidadeNome || item.modalidade || null,
    cnae_principal: item.cnae_principal || item.cnaePrincipal || item.codigoCnae || null,
    published_date: publishedDate,
    closing_date: closingDate,
    status: "em_analise",
    source: "PNCP"
  };
}

function normalizePayload(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.itens)) return payload.itens;
  if (Array.isArray(payload?.resultado)) return payload.resultado;
  return [];
}

function scoreBid(text, profile, ticketValue = null) {
  const lowered = normalizeText(text);
  const hasAcquisition = lowered.includes("aquisicao");
  const hasPhysicalItems = ["brinquedos", "materiais", "veiculos", "itens fisicos"].some((term) => lowered.includes(term));
  const hasNegativeBlocker = NEGATIVE_HIDE_TERMS.some((term) => lowered.includes(normalizeText(term)));

  if (hasNegativeBlocker || (hasAcquisition && hasPhysicalItems)) {
    return {
      total: 0,
      keywordHits: 0,
      nicheHits: 0,
      projectHits: 0,
      requiredHits: 0,
      exclusionHits: 0,
      territoryHits: 0,
      cnaeHits: 0,
      orgHits: 0,
      ticketKnown: false,
      ticketInRange: false,
      strongMatch: false,
      shouldHide: true
    };
  }

  const keywordHits = profile.keywords.filter((keyword) => lowered.includes(normalizeText(keyword))).length;
  const nicheHits = profile.niches.filter((term) => lowered.includes(normalizeText(term))).length;
  const projectHits = profile.projects.filter((term) => lowered.includes(normalizeText(term))).length;
  const orgHits = profile.targetOrgs.filter((org) => lowered.includes(normalizeText(org))).length;
  const cnaeHits = profile.cnaes.filter((cnae) => lowered.includes(normalizeText(cnae))).length;
  const requiredHits = profile.required.filter((term) => lowered.includes(normalizeText(term))).length;
  const exclusionHits = profile.exclusions.filter((term) => lowered.includes(normalizeText(term))).length;
  const territoryHits = profile.territories.filter((term) => lowered.includes(normalizeText(term))).length;

  const ticketKnown = ticketValue != null;
  const ticketInRange = ticketKnown ? ticketValue >= MIN_TICKET && ticketValue <= MAX_TICKET : true;
  const ticketScore = !ticketKnown ? 0 : ticketInRange ? 3 : -2;
  const priorityHits = ESA_PRIORITY_RULES.filter((group) => group.some((term) => lowered.includes(normalizeText(term)))).length;
  const priorityScore = priorityHits * 10;
  const cnaePriorityHits = PRIORITY_CNAES.filter((code) => lowered.includes(code)).length;
  const cnaePriorityBonus = cnaePriorityHits * 5;
  const forceTop = lowered.includes("quilombola") || lowered.includes("clpi");

  // Score com pesos por aderencia ao perfil da Expressao Socioambiental.
  const total =
    priorityScore +
    cnaePriorityBonus +
    keywordHits * 4 +
    nicheHits * 3 +
    projectHits * 2 +
    requiredHits * 5 +
    cnaeHits * 2 +
    territoryHits * 2 +
    orgHits * 2 +
    ticketScore -
    exclusionHits * 3;

  return {
    total: forceTop ? Math.max(total, 10) : total,
    keywordHits,
    nicheHits,
    projectHits,
    requiredHits,
    exclusionHits,
    territoryHits,
    cnaeHits,
    orgHits,
    ticketKnown,
    ticketInRange,
    strongMatch: forceTop || priorityHits > 0 || keywordHits > 0 || nicheHits > 0 || projectHits > 0 || cnaeHits > 0 || requiredHits > 0,
    shouldHide: false
  };
}

function dedupeByPncpId(items) {
  const map = new Map();
  for (const item of items) {
    const key = item?.bid?.pncp_id;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

async function fetchPncpByKeyword(keyword) {
  const statuses = ["recebendo_proposta", "1", "2", "3", "4", "5"];

  try {
    const responses = await Promise.all(
      statuses.map(async (status) => {
        const query = new URLSearchParams({
          tipos_documento: "edital",
          status,
          q: keyword,
          pagina: "1",
          tamanhoPagina: "50"
        });
        const url = `${PNCP_SEARCH_URL}?${query.toString()}`;
        const response = await fetch(url);
        if (!response.ok) return [];
        const payload = await response.json();
        return normalizePayload(payload);
      })
    );

    return { keyword, items: responses.flat() };
  } catch {
    return {
      keyword,
      items: [],
      warning: `PNCP indisponivel para keyword ${keyword}`
    };
  }
}

async function fetchRecentPncpPages(totalPages = 2) {
  const pages = [];

  for (let page = 1; page <= totalPages; page += 1) {
    pages.push(page);
  }

  const responses = await Promise.all(
    pages.map(async (page) => {
      const query = new URLSearchParams({
        tipos_documento: "edital",
        status: "recebendo_proposta",
        pagina: String(page),
        tamanhoPagina: "50"
      });
      const url = `${PNCP_SEARCH_URL}?${query.toString()}`;

      try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const payload = await response.json();
        return normalizePayload(payload);
      } catch {
        return [];
      }
    })
  );

  return responses.flat();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const requestKeywords = req.body?.keywords?.length ? req.body.keywords : KEYWORDS;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const profile = await loadDynamicProfile(supabase, requestKeywords);
    const searchTerms = profile.keywords.slice(0, 40);

    console.log(`[PNCP-SEARCH] Iniciando busca com ${searchTerms.length} termos de perfil.`);
    console.log(`[PNCP-SEARCH] Perfil ativo:`, {
      keywords: profile.keywords.length,
      niches: profile.niches.length,
      projects: profile.projects.length,
      cnaes: profile.cnaes.length
    });

    const allResults = await Promise.all(searchTerms.map((keyword) => fetchPncpByKeyword(keyword)));
    const warnings = allResults.filter((result) => result.warning).map((result) => result.warning);
    let rawItems = allResults.flatMap((result) => result.items);

    console.log(`[PNCP-SEARCH] Itens brutos de busca por keyword: ${rawItems.length}`);
    console.log(`[PNCP-SEARCH] Warnings: ${warnings.join(" | ")}`);

    // Fallback quando API por termo retorna vazia/instavel: busca paginas recentes e filtra localmente.
    if (rawItems.length < 5) {
      console.log(`[PNCP-SEARCH] Poucos itens (${rawItems.length}), acionando fallback fetchRecentPncpPages...`);
      const recentItems = await fetchRecentPncpPages(3);
      console.log(`[PNCP-SEARCH] Itens recentes obtidos: ${recentItems.length}`);
      rawItems = [...rawItems, ...recentItems];
    }

    console.log(`[PNCP-SEARCH] Total de raw items após fallback: ${rawItems.length}`);

    const flattened = rawItems.map((raw) => ({ bid: normalizePncpItem(raw), raw }));
    const deduped = dedupeByPncpId(flattened);

    console.log(`[PNCP-SEARCH] Após normalizar e deduplicar: ${deduped.length} itens`);

    // Log de alguns itens para debug
    if (deduped.length > 0) {
      console.log(`[PNCP-SEARCH] Amostra de itens:`, deduped.slice(0, 2).map((row) => ({ title: row.bid.title, org: row.bid.organization_name })));
    }

    const scoredItems = deduped
      .map((row) => {
        const bid = row.bid;
        const raw = row.raw;
        const ticketValue = extractTicketValue(raw);
        const text = `${bid.title} ${bid.description || ""} ${bid.organization_name || ""} ${bid.modality || ""} ${bid.pncp_id || ""} ${bid.cnae_principal || ""}`;
        const relevance = scoreBid(text, profile, ticketValue);
        return { bid, relevance, ticketValue };
      })
      .filter((row) => !row.relevance.shouldHide)
      .sort((a, b) => b.relevance.total - a.relevance.total);

    const highMatches = scoredItems.filter((row) => row.relevance.strongMatch && row.relevance.total >= 8);
    const mediumMatches = scoredItems.filter((row) => row.relevance.strongMatch && row.relevance.total >= 3);
    const broadMatches = scoredItems.filter((row) => row.relevance.total > 0);

    const selectedRows = highMatches.length
      ? highMatches
      : mediumMatches.length
        ? mediumMatches
        : broadMatches.length
          ? broadMatches
          : scoredItems.slice(0, 40);

    const selected = selectedRows.map((row) => row.bid).slice(0, 50);

    console.log(`[PNCP-SEARCH] Selecao final: ${selected.length} itens (high=${highMatches.length}, medium=${mediumMatches.length}, broad=${broadMatches.length})`);

    if (selected.length === 0) {
      return res.status(200).json({
        inserted: 0,
        warnings,
        message: "Nenhum edital encontrado na PNCP"
      });
    }

    const { error } = await supabase.from("bids").upsert(selected, { onConflict: "pncp_id" });
    if (error) {
      throw new Error(error.message);
    }

    console.log(`[PNCP-SEARCH] Sucesso: inseridos ${selected.length} editais`);
    return res.status(200).json({ inserted: selected.length, warnings });
  } catch (error) {
    console.error(`[PNCP-SEARCH] Erro:`, error);
    return res.status(500).json({ error: error.message || "Erro ao consultar PNCP" });
  }
}
