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
import { fetchComprasGovOpenBidsByKeywords } from "./_shared/compras-api-service.js";
import { validateDocumentLink } from "./_shared/link-validation.js";

const PNCP_SEARCH_URL = "https://pncp.gov.br/api/search";
const PNCP_BASE_URL = "https://pncp.gov.br";
const PRIORITY_CNAES = ["7490-1/99", "7320-3/00", "7119-7/99"];
const RECEIVING_PROPOSALS_STATUSES = ["recebendo_proposta", "recebendo propostas", "recebendo proposta", "1"];

const ESA_PRIORITY_RULES = [
  ["clpi", "consulta livre previa e informada", "consulta previa", "consulta livre"],
  ["quilombola", "componente quilombola"],
  ["indigena", "indigena", "componente indigena"],
  ["diagnostico socioambiental"],
  ["convencao 169 oit", "convencao 169", "oit 169"],
  ["mediacao de conflitos", "mediacao de conflitos territoriais", "mediacao"]
];

const NEGATIVE_HIDE_TERMS = ["aquisicao de materiais", "obras de pavimentacao", "brinquedos", "generos alimenticios"];

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
  const safeCnpj = onlyDigits(cnpj);
  const safeAno = normalizeYear(ano);
  const safeSeq = normalizeSequential(sequencial);
  if (safeCnpj.length === 14 && safeAno && safeSeq) {
    return `${PNCP_BASE_URL}/app/editais/${safeCnpj}/${safeAno}/${safeSeq}`;
  }
  return "";
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

function normalizeSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripCommonOrgNoise(value) {
  return normalizeSpaces(
    String(value || "")
      .replace(/\bPREFEITURA MUNICIPAL DE\b/gi, "")
      .replace(/\bFUNDO MUNICIPAL DE\b/gi, "")
      .replace(/\bSECRETARIA(?: MUNICIPAL| ESTADUAL)? DE\b/gi, "")
      .replace(/\bDEPARTAMENTO(?: MUNICIPAL| ESTADUAL)? DE\b/gi, "")
      .replace(/\bSEPLAN\b/gi, "")
      .replace(/\bUCP\b/gi, "")
      .replace(/[()\[\]{}]/g, " ")
  );
}

function extractMunicipioOrgao(value) {
  const cleaned = stripCommonOrgNoise(value);
  if (!cleaned) return "";

  const slashChunks = cleaned
    .split(/[\/|]+/)
    .map((chunk) => normalizeSpaces(chunk))
    .filter(Boolean);

  if (slashChunks.length >= 2) {
    const lastChunk = slashChunks[slashChunks.length - 1];
    if (lastChunk.length > 2) return lastChunk;
  }

  const match = cleaned.match(/\b([A-Z]{2})\s*[\/-]\s*([A-Z][A-Z\s]+)$/i);
  if (match) {
    return normalizeSpaces(match[2]);
  }

  const stripped = normalizeSpaces(
    cleaned
      .replace(/\bMUNICIPIO D[EOA]\b/gi, "")
      .replace(/\bESTADO D[EOA]\b/gi, "")
      .replace(/\bGOVERNO D[EOA] ESTADO D[EOA]\b/gi, "")
      .replace(/\bPREFEITURA D[EOA]\b/gi, "")
  );

  if (/^[A-Z]{2}$/i.test(stripped)) return stripped.toUpperCase();
  if (stripped) return stripped;

  return cleaned;
}

function normalizePncpStatus(item = {}) {
  const rawStatus =
    item.status ||
    item.status_nome ||
    item.situacaoCompra ||
    item.situacao ||
    item.situacao_nome ||
    item.statusCompra ||
    "";

  return normalizeText(rawStatus).replace(/[_-]+/g, " ").trim();
}

function isFutureDate(value) {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() > Date.now();
}

function isReceivingProposals(item = {}) {
  const status = normalizePncpStatus(item);

  if (item.cancelado === true) return false;

  if (status && RECEIVING_PROPOSALS_STATUSES.includes(status)) {
    return true;
  }

  const situacaoNome = normalizeText(item.situacao_nome || "");
  if (situacaoNome.includes("divulgada no pncp")) {
    return isFutureDate(item.data_fim_vigencia || item.dataEncerramentoProposta);
  }

  return false;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsExactKeyword(haystack, keyword) {
  const normalizedHaystack = normalizeText(haystack);
  const normalizedKeyword = normalizeText(keyword).trim();

  if (!normalizedKeyword) return false;

  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(normalizedKeyword)}([^a-z0-9]|$)`, "i");
  return pattern.test(normalizedHaystack);
}

function hasExactKeywordInMainFields(item = {}, keywords = []) {
  if (!Array.isArray(keywords) || keywords.length === 0) return true;

  const title = item.title || item.titulo || "";
  const mainObject = item.objetoCompra || item.objeto || item.description || item.descricao || "";

  return keywords.some((keyword) => containsExactKeyword(title, keyword) || containsExactKeyword(mainObject, keyword));
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

function buildPncpSearchFallbackUrl(orgaoCnpj, organizationName) {
  if (orgaoCnpj && String(orgaoCnpj).length === 14) {
    return `${PNCP_BASE_URL}/app/editais?q=${orgaoCnpj}&pagina=1`;
  }
  const orgTerm = String(organizationName || "").trim();
  if (orgTerm) {
    return `${PNCP_BASE_URL}/app/editais?q=${encodeURIComponent(orgTerm)}&pagina=1`;
  }
  return `${PNCP_BASE_URL}/app/editais?pagina=1`;
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
  const organizationNameRaw = item.orgao_nome || item.orgaoEntidade?.razaoSocial || item.unidadeOrgao?.nomeUnidade || "Orgao nao informado";
  const organizationName = stripCommonOrgNoise(organizationNameRaw) || "Orgao nao informado";
  const municipioOrgao = extractMunicipioOrgao(organizationName);
  const sourcePath = item.item_url || item.linkSistemaOrigem || item.linkProcessoEletronico || item.url || "";
  const orgaoCnpj = extractOrgaoCnpj(item, sourcePath);
  const directIds = parseDirectIdentifiers(item, sourcePath);
  const directCnpj = directIds.cnpj || orgaoCnpj || "";
  const directUrl = buildPncpDirectEditalUrl(directCnpj, directIds.ano, directIds.sequencial);

  // O payload do /api/search costuma trazer `item_url` no formato `/compras/<cnpj>/<ano>/<seq>`.
  // No app do PNCP, o deep-link mais consistente é via `/app/contratacoes/<cnpj>/<ano>/<seq>`.
  const normalizedPath =
    sourcePath && sourcePath.startsWith("/compras/")
      ? `/app/contratacoes${sourcePath.replace(/^\/compras/, "")}`
      : sourcePath;

  const sourceUrlRaw = normalizedPath
    ? normalizedPath.startsWith("http")
      ? normalizedPath
      : `${PNCP_BASE_URL}${normalizedPath}`
    : "";
  const sourceUrl = directUrl || (!sourceUrlRaw || isEmailLike(sourceUrlRaw)
    ? buildPncpSearchFallbackUrl(orgaoCnpj, organizationName)
    : sourceUrlRaw);
  const publishedDate = item.data_publicacao_pncp || item.dataPublicacaoPncp || item.dataPublicacao || item.createdAt || new Date().toISOString();
  const closingDate = item.data_fim_vigencia || item.dataEncerramentoProposta || null;
  const pncpControl = item.numero_controle_pncp || item.numeroControlePNCP;
  const sequence = item.numero_sequencial || item.sequencialCompra;

  return {
    title,
    description,
    organization_name: organizationName,
    orgao_nome: organizationName,
    municipio_orgao: municipioOrgao,
    orgao_cnpj: orgaoCnpj,
    edital_ano: directIds.ano || null,
    edital_sequencial: directIds.sequencial || null,
    source_url: sourceUrl,
    pncp_id: String(pncpControl || sequence || Math.random()),
    modality: item.modalidade_licitacao_nome || item.modalidadeNome || item.modalidade || null,
    cnae_principal: item.cnae_principal || item.cnaePrincipal || item.codigoCnae || null,
    published_date: publishedDate,
    closing_date: closingDate,
    source_system: "PNCP",
    source_priority: 2,
    status: "recebendo_propostas",
    source: "PNCP"
  };
}

function normalizeComprasRow(row = {}) {
  const title = String(row.title || "Sem titulo").trim();
  const description = String(row.description || "").trim();
  const organizationRaw = String(row.organization || "Orgao nao informado").trim();
  const organization = stripCommonOrgNoise(organizationRaw) || organizationRaw || "Orgao nao informado";
  const cnpj = onlyDigits(row.orgao_cnpj || "");
  const ano = normalizeYear(row.ano || row.edital_ano || "");
  const sequencial = normalizeSequential(row.sequencial || row.edital_sequencial || "");
  const municipioOrgao = extractMunicipioOrgao(organization);
  const sourceUrl = String(buildPncpDirectEditalUrl(cnpj, ano, sequencial) || row.url || buildPncpSearchFallbackUrl(cnpj, organization)).trim();
  const baseId = onlyDigits(cnpj) || normalizeText(`${title}-${organization}`).replace(/[^a-z0-9]+/g, "-").slice(0, 60);

  return {
    title,
    description,
    organization_name: organization,
    orgao_nome: organization,
    municipio_orgao: municipioOrgao,
    orgao_cnpj: cnpj.length === 14 ? cnpj : null,
    edital_ano: ano || null,
    edital_sequencial: sequencial || null,
    source_url: sourceUrl,
    pncp_id: `compras-${baseId || Math.random().toString(36).slice(2, 10)}`,
    modality: null,
    cnae_principal: null,
    published_date: row.published_date || new Date().toISOString(),
    closing_date: row.closing_date || null,
    source_system: "COMPRAS_GOV",
    source_priority: 1,
    status: "recebendo_propostas",
    source: "Compras.gov.br"
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
  const hasNegativeBlocker = NEGATIVE_HIDE_TERMS.some((term) => lowered.includes(normalizeText(term)));

  if (hasNegativeBlocker) {
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
  const forceTop =
    lowered.includes("clpi") ||
    lowered.includes("consulta previa") ||
    lowered.includes("quilombola") ||
    lowered.includes("indigena") ||
    lowered.includes("diagnostico socioambiental") ||
    lowered.includes("convencao 169");

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

  const cappedTotal = forceTop ? 10 : Math.min(9, total);

  return {
    total: cappedTotal,
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
  try {
    const query = new URLSearchParams({
      tipos_documento: "edital",
      status: "recebendo_proposta",
      q: keyword,
      pagina: "1",
      tamanhoPagina: "50"
    });
    const url = `${PNCP_SEARCH_URL}?${query.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
      return { keyword, items: [] };
    }
    const payload = await response.json();
    return { keyword, items: normalizePayload(payload) };
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

async function clearBidsTableForFullSync(supabase) {
  const { error } = await supabase.from("bids").delete().not("id", "is", null);
  if (error) {
    throw new Error(`Falha ao limpar tabela bids antes da sincronizacao: ${error.message}`);
  }
}

async function upsertBids(supabase, rows) {
  const { error } = await supabase.from("bids").upsert(rows, { onConflict: "pncp_id" });
  if (error) {
    throw new Error(error.message);
  }
}

async function applyPreflightValidation(rows) {
  const checks = await Promise.all(
    rows.map(async (row) => {
      const result = await validateDocumentLink(row.source_url, { timeoutMs: 9000 });
      return { row, result };
    })
  );

  const validRows = [];
  const invalidRows = [];

  for (const check of checks) {
    if (check.result.isValid) {
      validRows.push({
        ...check.row,
        is_link_valid: true,
        link_http_status: check.result.statusCode || null,
        link_validation_error: null,
        link_checked_at: new Date().toISOString(),
        link_edital: check.row.source_url
      });
      continue;
    }

    invalidRows.push({
      title: check.row.title,
      source_url: check.row.source_url,
      statusCode: check.result.statusCode || 0,
      error: check.result.error || "invalid_link"
    });
  }

  return { validRows, invalidRows };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const requestKeywords = req.body?.keywords?.length ? req.body.keywords : KEYWORDS;
  const fullSync = Boolean(req.body?.fullSync);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const profile = await loadDynamicProfile(supabase, requestKeywords);
    const searchTerms = profile.keywords.slice(0, 40);

    if (fullSync) {
      console.log("[PNCP-SEARCH] fullSync=true: limpando tabela bids antes da sincronizacao...");
      await clearBidsTableForFullSync(supabase);
    }

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

    const statusValidated = rawItems.filter((item) => isReceivingProposals(item));
    const keywordValidated = statusValidated.filter((item) => hasExactKeywordInMainFields(item, requestKeywords));

    console.log(`[PNCP-SEARCH] Apos validacao de status: ${statusValidated.length}`);
    console.log(`[PNCP-SEARCH] Apos filtro de keyword exata: ${keywordValidated.length}`);

    rawItems = keywordValidated;

    console.log(`[PNCP-SEARCH] Total de raw items após fallback: ${rawItems.length}`);

    const flattened = rawItems.map((raw) => ({ bid: normalizePncpItem(raw), raw }));
    const deduped = dedupeByPncpId(flattened);

    const comprasRowsRaw = await fetchComprasGovOpenBidsByKeywords(searchTerms, { pageSize: 30 });
    const comprasRows = comprasRowsRaw.map((row) => normalizeComprasRow(row));

    console.log(`[PNCP-SEARCH] Após normalizar e deduplicar: ${deduped.length} itens`);

    // Log de alguns itens para debug
    if (deduped.length > 0) {
      console.log(`[PNCP-SEARCH] Amostra de itens:`, deduped.slice(0, 2).map((row) => ({ title: row.bid.title, org: row.bid.organization_name })));
    }

    const scoredPncpItems = deduped
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

    const scoredComprasItems = comprasRows
      .map((bid) => {
        const text = `${bid.title} ${bid.description || ""} ${bid.organization_name || ""}`;
        const relevance = scoreBid(text, profile, null);
        return { bid, relevance };
      })
      .filter((row) => !row.relevance.shouldHide);

    const scoredItems = [...scoredComprasItems, ...scoredPncpItems].sort((a, b) => {
      const priorityDiff = (a.bid.source_priority || 99) - (b.bid.source_priority || 99);
      if (priorityDiff !== 0) return priorityDiff;
      return b.relevance.total - a.relevance.total;
    });

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

    const selected = selectedRows.map((row) => row.bid).slice(0, 60);

    console.log(`[PNCP-SEARCH] Selecao final: ${selected.length} itens (high=${highMatches.length}, medium=${mediumMatches.length}, broad=${broadMatches.length})`);

    if (selected.length === 0) {
      return res.status(200).json({
        inserted: 0,
        warnings,
        message: "Nenhum edital encontrado na PNCP"
      });
    }

    const preflight = await applyPreflightValidation(selected);
    const preflightWarnings = preflight.invalidRows.slice(0, 20).map((item) => {
      return `Link descartado (${item.statusCode}): ${item.title}`;
    });

    if (preflight.validRows.length === 0) {
      return res.status(200).json({
        inserted: 0,
        warnings: [...warnings, ...preflightWarnings],
        message: "Nenhum edital passou no pre-flight de documento"
      });
    }

    await upsertBids(supabase, preflight.validRows);

    console.log(`[PNCP-SEARCH] Sucesso: inseridos ${preflight.validRows.length} editais`);
    return res.status(200).json({
      inserted: preflight.validRows.length,
      warnings: [...warnings, ...preflightWarnings],
      validated: preflight.validRows.map((item) => ({
        pncp_id: item.pncp_id,
        title: item.title,
        organization_name: item.organization_name,
        municipio_orgao: item.municipio_orgao || null,
        orgao_cnpj: item.orgao_cnpj || null,
        edital_ano: item.edital_ano || null,
        edital_sequencial: item.edital_sequencial || null,
        status: item.status,
        source_url: item.source_url,
        source_system: item.source_system || "PNCP",
        is_link_valid: true
      }))
    });
  } catch (error) {
    console.error(`[PNCP-SEARCH] Erro:`, error);
    return res.status(500).json({ error: error.message || "Erro ao consultar PNCP" });
  }
}
