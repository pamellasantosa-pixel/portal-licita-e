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
const COMPRAS_DADOS_GOV_URLS = [
  process.env.COMPRAS_GOV_URL,
  "https://api.compras.gov.br/licitacoes/v1/licitacoes?pagina=1&tamanhoPagina=50",
  "https://compras.dados.gov.br/licitacoes/v1/licitacoes.json?situacao=aberta",
  "https://compras.dados.gov.br/licitacoes/v1/licitacoes.json"
].filter(Boolean);
const DEFAULT_SYNC_YEAR = "2026";
const STRICT_EXSA_INSERT = String(process.env.STRICT_EXSA_INSERT || "false").toLowerCase() === "true";
const DEFAULT_CAPTURE_MODE = String(process.env.CAPTURE_MODE || "max_recall").toLowerCase();
const ENFORCE_LINK_VALIDATION_DEFAULT = String(process.env.ENFORCE_LINK_VALIDATION || "false").toLowerCase() === "true";
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
const EXSA_FOCUS_TERMS = ["socioambiental", "quilombola", "indigena", "participativo", "diagnostico"];
const COMPRAS_FOCUS_TERMS = ["socioambiental", "diagnostico"];

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
    String(item.pncp_id || "").match(/^(\d{14})-/)?.[1],
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

  const control = String(item.numero_controle_pncp || item.numeroControlePNCP || item.pncp_id || "");
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

function extractPncpItemYear(item = {}) {
  const sourcePath = item.item_url || item.linkSistemaOrigem || item.linkProcessoEletronico || item.url || "";
  const direct = parseDirectIdentifiers(item, sourcePath);
  if (direct.ano) return direct.ano;

  const published = item.data_publicacao_pncp || item.dataPublicacaoPncp || item.dataPublicacao || "";
  const publishedYear = normalizeYear(String(published).slice(0, 4));
  return publishedYear || "";
}

function filterItemsByYear(items = [], targetYear = "") {
  if (!targetYear) return items;
  return items.filter((item) => extractPncpItemYear(item) === targetYear);
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

function containsExsaFocusKeyword(description = "") {
  const normalizedDescription = normalizeText(description);
  if (!normalizedDescription) return false;
  return EXSA_FOCUS_TERMS.some((term) => normalizedDescription.includes(normalizeText(term)));
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
  const normalizedCnpj = onlyDigits(directCnpj);
  const normalizedYear = directIds.ano || extractPncpItemYear(item) || null;
  const normalizedSequential = directIds.sequencial || normalizeSequential(item.numero_sequencial || item.sequencialCompra || item.numero) || null;
  const directUrl = buildPncpDirectEditalUrl(normalizedCnpj, normalizedYear, normalizedSequential);

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
    orgao_cnpj: normalizedCnpj.length === 14 ? normalizedCnpj : null,
    ano: normalizedYear,
    sequencial: normalizedSequential,
    portal_origin: "PNCP",
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
  const title = String(row.title || row.titulo || `Licitacao ${row.numero_licitacao || row.numeroLicitacao || ""}` || "Sem titulo").trim();
  const description = String(row.objeto || row.description || "").trim();
  const uasgLabel = row.uasg ? `UASG: ${row.uasg}` : "";
  const organizationRaw = String(row.orgao_nome || row.organization || row.uasg_nome || uasgLabel || "Orgao nao informado").trim();
  const organization = stripCommonOrgNoise(organizationRaw) || organizationRaw || "Orgao nao informado";
  const cnpj = onlyDigits(row.orgao_cnpj || row.cnpj_orgao || "");
  const abertura = row.data_abertura || row.data_entrega_proposta || row.published_date || null;
  const ano = normalizeYear(row.ano || row.edital_ano || (abertura ? String(new Date(abertura).getFullYear()) : ""));
  const sequencial = normalizeSequential(row.sequencial || row.edital_sequencial || row.numero_licitacao || row.numeroLicitacao || "");
  const municipioOrgao = extractMunicipioOrgao(organization);
  const sourceUrl = String(row._links?.self?.href || row.url || COMPRAS_DADOS_GOV_URLS[0] || "").trim();
  const baseId = normalizeText(`${title}-${organization}-${sequencial || ano || "0"}`).replace(/[^a-z0-9]+/g, "-").slice(0, 80);

  return {
    title,
    description,
    organization_name: organization,
    orgao_nome: organization,
    municipio_orgao: municipioOrgao,
    orgao_cnpj: cnpj.length === 14 ? cnpj : null,
    ano: ano || null,
    sequencial: sequencial || null,
    portal_origin: "Compras.gov.br",
    objeto_descricao: description,
    data_abertura: abertura,
    source_url: sourceUrl,
    pncp_id: `compras-${baseId || Math.random().toString(36).slice(2, 10)}`,
    modality: null,
    cnae_principal: null,
    published_date: abertura || row.published_date || new Date().toISOString(),
    closing_date: row.closing_date || row.data_abertura || null,
    source_system: "COMPRAS_GOV",
    source_priority: 1,
    status: "aberto",
    source: "Compras.gov.br"
  };
}

function mapNormalizedToBidSchema(item = {}) {
  const {
    ano: rawAno,
    sequencial: rawSequencial,
    edital_ano: rawEditalAno,
    edital_sequencial: rawEditalSequencial,
    ...rest
  } = item;

  const ano = normalizeYear(rawAno || rawEditalAno || "") || null;
  const sequencial = normalizeSequential(rawSequencial || rawEditalSequencial || "") || null;
  const cnpj = onlyDigits(rest.orgao_cnpj || "");

  return {
    ...rest,
    orgao_nome: rest.orgao_nome || rest.organization_name || "Orgao nao informado",
    orgao_cnpj: cnpj.length === 14 ? cnpj : null,
    objeto_descricao: rest.objeto_descricao || rest.description || rest.title || "",
    data_abertura: rest.data_abertura || rest.published_date || null,
    edital_ano: ano,
    edital_sequencial: sequencial,
    portal_origin: rest.portal_origin || rest.source_system || rest.source || "Desconhecido"
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

function buildStrongDedupKey(bid = {}) {
  if (bid.orgao_cnpj && bid.edital_ano && bid.edital_sequencial) {
    return `strong:${bid.orgao_cnpj}|${bid.edital_ano}|${bid.edital_sequencial}`;
  }
  return "";
}

function buildFuzzyDedupKey(bid = {}) {
  const org = normalizeText(bid.orgao_nome || bid.organization_name || "").replace(/[^a-z0-9 ]/g, " ").trim();
  const title = normalizeText(bid.title || "").replace(/[^a-z0-9 ]/g, " ").trim();
  const date = String(bid.published_date || bid.data_abertura || "").slice(0, 10);

  const orgTokens = org.split(/\s+/).filter(Boolean).slice(0, 4).join("-");
  const titleTokens = title.split(/\s+/).filter(Boolean).slice(0, 8).join("-");
  return `fuzzy:${orgTokens}|${titleTokens}|${date}`;
}

function isBetterEntry(candidate, current) {
  if (!current) return true;

  const candidatePriority = Number(candidate?.bid?.source_priority || 99);
  const currentPriority = Number(current?.bid?.source_priority || 99);
  if (candidatePriority !== currentPriority) {
    return candidatePriority < currentPriority;
  }

  const candidateDesc = String(candidate?.bid?.description || candidate?.bid?.objeto_descricao || "").length;
  const currentDesc = String(current?.bid?.description || current?.bid?.objeto_descricao || "").length;
  if (candidateDesc !== currentDesc) {
    return candidateDesc > currentDesc;
  }

  const candidateDate = new Date(candidate?.bid?.published_date || 0).getTime();
  const currentDate = new Date(current?.bid?.published_date || 0).getTime();
  return candidateDate > currentDate;
}

function dedupeMergedItems(items = []) {
  const strongMap = new Map();
  const fuzzyMap = new Map();
  let strongDuplicates = 0;
  let fuzzyDuplicates = 0;

  for (const entry of items) {
    const normalizedEntry = {
      ...entry,
      bid: mapNormalizedToBidSchema(entry.bid)
    };

    const strongKey = buildStrongDedupKey(normalizedEntry.bid);
    if (strongKey) {
      const current = strongMap.get(strongKey);
      if (current) strongDuplicates += 1;
      if (isBetterEntry(normalizedEntry, current)) {
        strongMap.set(strongKey, normalizedEntry);
      }
      continue;
    }

    const fuzzyKey = buildFuzzyDedupKey(normalizedEntry.bid);
    const current = fuzzyMap.get(fuzzyKey);
    if (current) fuzzyDuplicates += 1;
    if (isBetterEntry(normalizedEntry, current)) {
      fuzzyMap.set(fuzzyKey, normalizedEntry);
    }
  }

  const dedupedItems = [...strongMap.values(), ...fuzzyMap.values()];
  return {
    items: dedupedItems,
    metrics: {
      input_count: items.length,
      output_count: dedupedItems.length,
      strong_groups: strongMap.size,
      fuzzy_groups: fuzzyMap.size,
      strong_duplicates: strongDuplicates,
      fuzzy_duplicates: fuzzyDuplicates,
      duplicates_removed: Math.max(0, items.length - dedupedItems.length)
    }
  };
}

async function fetchPncpByKeyword(keyword, targetYear = "") {
  try {
    const query = new URLSearchParams({
      tipos_documento: "edital",
      status: "recebendo_proposta",
      q: keyword,
      pagina: "1",
      tamanhoPagina: "50"
    });
    const normalizedTargetYear = normalizeYear(targetYear);
    if (normalizedTargetYear) {
      query.set("ano", normalizedTargetYear);
      query.set("anoCompra", normalizedTargetYear);
    }
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

async function fetchRecentPncpPages(totalPages = 2, targetYear = "") {
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
      const normalizedTargetYear = normalizeYear(targetYear);
      if (normalizedTargetYear) {
        query.set("ano", normalizedTargetYear);
        query.set("anoCompra", normalizedTargetYear);
      }
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

async function fetchPncpSource({ searchTerms, targetYear, requestKeywords }) {
  const allResults = await Promise.all(searchTerms.map((keyword) => fetchPncpByKeyword(keyword, targetYear)));
  const warnings = allResults.filter((result) => result.warning).map((result) => result.warning);
  let rawItems = filterItemsByYear(allResults.flatMap((result) => result.items), targetYear);

  if (rawItems.length < 5) {
    const recentItems = filterItemsByYear(await fetchRecentPncpPages(3, targetYear), targetYear);
    rawItems = [...rawItems, ...recentItems];
  }

  const statusValidated = rawItems.filter((item) => isReceivingProposals(item));
  const keywordValidated = statusValidated.filter((item) => hasExactKeywordInMainFields(item, requestKeywords));
  const flattened = keywordValidated.map((raw) => ({ bid: normalizePncpItem(raw), raw }));
  const deduped = dedupeByPncpId(flattened);

  return {
    source: "PNCP",
    warnings,
    rawCount: rawItems.length,
    statusCount: statusValidated.length,
    keywordCount: keywordValidated.length,
    items: deduped
  };
}

async function fetchComprasGovSource({ searchTerms }) {
  try {
    const comprasApiRows = await fetchComprasGovOpenBidsByKeywords(searchTerms, {
      timeoutMs: 12000,
      pageSize: 80
    }).catch(() => []);

    if (comprasApiRows.length > 0) {
      const items = comprasApiRows.map((row) => ({ bid: normalizeComprasRow(row), raw: row }));
      return {
        source: "ComprasGov",
        warnings: [],
        rawCount: comprasApiRows.length,
        items
      };
    }

    let rawRows = [];
    let lastError = "compras_api_sem_resultado";

    for (const url of COMPRAS_DADOS_GOV_URLS) {
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "Licita-E/1.0 (ComprasDadosGov)" }
        });

        if (!response.ok) {
          lastError = `http_${response.status}`;
          continue;
        }

        const payload = await response.json().catch(() => ({}));
        rawRows = Array.isArray(payload?._embedded?.licitacoes)
          ? payload._embedded.licitacoes
          : Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload?.data)
              ? payload.data
              : [];

        if (rawRows.length > 0) {
          break;
        }
      } catch (error) {
        lastError = String(error?.message || error);
      }
    }

    if (rawRows.length === 0 && lastError) {
      throw new Error(lastError);
    }

    const filteredRows = rawRows.filter((row) => {
      const text = normalizeText(`${row?.objeto || ""} ${row?.descricao || ""} ${row?.titulo || ""} ${row?.title || ""}`);
      if (!text) return false;

      const hasFocused = COMPRAS_FOCUS_TERMS.some((term) => text.includes(normalizeText(term)));
      const hasKeyword = searchTerms.some((term) => containsExactKeyword(text, term));
      return hasFocused || hasKeyword;
    });

    const rowsForNormalization = filteredRows.length > 0 ? filteredRows : rawRows.slice(0, 40);
    const items = rowsForNormalization.map((row) => ({ bid: normalizeComprasRow(row), raw: row }));
    return {
      source: "ComprasGov",
      warnings:
        filteredRows.length === 0 && rawRows.length > 0
          ? ["Compras.gov sem match forte por palavra-chave; usando amostra ampla para nao perder cobertura"]
          : [],
      rawCount: rawRows.length,
      items
    };
  } catch (error) {
    return {
      source: "ComprasGov",
      warnings: [`Compras.gov indisponivel: ${String(error?.message || error)}`],
      rawCount: 0,
      items: []
    };
  }
}

async function fetchStatePortalsSource() {
  return {
    source: "StatePortals",
    warnings: [],
    rawCount: 0,
    items: []
  };
}

const fetchers = {
  PNCP: fetchPncpSource,
  ComprasGov: fetchComprasGovSource,
  StatePortals: fetchStatePortalsSource
};

async function clearBidsTableForFullSync(supabase) {
  const { error } = await supabase.from("bids").delete().not("id", "is", null);
  if (error) {
    throw new Error(`Falha ao limpar tabela bids antes da sincronizacao: ${error.message}`);
  }
}

async function upsertBids(supabase, rows) {
  const { error } = await supabase.from("bids").upsert(rows, { onConflict: "pncp_id" });
  if (!error) return;

  const errorMessage = String(error.message || "").toLowerCase();
  if (errorMessage.includes("portal_origin") && errorMessage.includes("column")) {
    const fallbackRows = rows.map(({ portal_origin, ...rest }) => rest);
    const fallback = await supabase.from("bids").upsert(fallbackRows, { onConflict: "pncp_id" });
    if (!fallback.error) return;
    throw new Error(fallback.error.message);
  }

  throw new Error(error.message);
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
  const targetYear = normalizeYear(req.body?.year || req.body?.targetYear || "") || DEFAULT_SYNC_YEAR;
  const captureMode = String(req.body?.captureMode || DEFAULT_CAPTURE_MODE).toLowerCase();
  const enforceLinkValidation = req.body?.enforceLinkValidation === true || ENFORCE_LINK_VALIDATION_DEFAULT;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const profile = await loadDynamicProfile(supabase, requestKeywords);
    const searchTerms = profile.keywords.slice(0, 40);

    if (fullSync) {
      console.log("[PNCP-SEARCH] fullSync=true: limpando tabela bids antes da sincronizacao...");
      await clearBidsTableForFullSync(supabase);
    }

    console.log(`[PNCP-SEARCH] Iniciando busca com ${searchTerms.length} termos de perfil.`);
    console.log(`[PNCP-SEARCH] Ano alvo da sincronizacao: ${targetYear}`);
    console.log(`[PNCP-SEARCH] Modo de captura: ${captureMode} (enforceLinkValidation=${enforceLinkValidation})`);
    console.log(`[PNCP-SEARCH] Perfil ativo:`, {
      keywords: profile.keywords.length,
      niches: profile.niches.length,
      projects: profile.projects.length,
      cnaes: profile.cnaes.length
    });

    const sourceEntries = Object.entries(fetchers);
    const sourceResults = await Promise.all(
      sourceEntries.map(async ([sourceName, fetchSource]) => {
        const result = await fetchSource({ searchTerms, targetYear, requestKeywords });
        return { sourceName, ...result };
      })
    );

    const warnings = sourceResults.flatMap((result) => result.warnings || []);
    const allFetchedItems = sourceResults.flatMap((result) => result.items || []);
    const dedupeResult = dedupeMergedItems(allFetchedItems);
    const dedupedFetchedItems = dedupeResult.items;

    for (const sourceResult of sourceResults) {
      console.log(`[PNCP-SEARCH] Fonte ${sourceResult.sourceName}: itens=${sourceResult.items?.length || 0} warnings=${(sourceResult.warnings || []).length}`);
    }

    console.log(`[PNCP-SEARCH] Total multi-fonte normalizado: ${allFetchedItems.length}`);
    console.log(`[PNCP-SEARCH] Dedupe avançado:`, dedupeResult.metrics);

    if (dedupedFetchedItems.length > 0) {
      console.log(
        `[PNCP-SEARCH] Amostra de itens multi-fonte:`,
        dedupedFetchedItems.slice(0, 2).map((row) => ({ title: row.bid.title, org: row.bid.organization_name, origem: row.bid.portal_origin }))
      );
    }

    const scoredItems = dedupedFetchedItems
      .map((row) => {
        const normalizedBid = row.bid;
        const ticketValue = extractTicketValue(row.raw || {});
        const text = `${normalizedBid.title} ${normalizedBid.description || ""} ${normalizedBid.organization_name || ""} ${normalizedBid.modality || ""} ${normalizedBid.pncp_id || ""} ${normalizedBid.cnae_principal || ""}`;
        const relevance = scoreBid(text, profile, ticketValue);
        return { bid: normalizedBid, relevance, ticketValue };
      })
      .filter((row) => !row.relevance.shouldHide)
      .sort((a, b) => {
      const priorityDiff = (a.bid.source_priority || 99) - (b.bid.source_priority || 99);
      if (priorityDiff !== 0) return priorityDiff;
      return b.relevance.total - a.relevance.total;
    });

    const highMatches = scoredItems.filter((row) => row.relevance.strongMatch && row.relevance.total >= 8);
    const mediumMatches = scoredItems.filter((row) => row.relevance.strongMatch && row.relevance.total >= 3);
    const broadMatches = scoredItems;

    // Na sincronizacao inicial queremos visibilidade ampla: sem filtro por aderencia_score > 0.
    const selectedRows = broadMatches.length ? broadMatches : scoredItems.slice(0, 40);

    const selected = selectedRows.map((row) => row.bid).slice(0, 60);

    console.log(`[PNCP-SEARCH] Selecao final: ${selected.length} itens (high=${highMatches.length}, medium=${mediumMatches.length}, broad=${broadMatches.length})`);

    if (selected.length === 0) {
      return res.status(200).json({
        inserted: 0,
        warnings,
        message: "Nenhum edital encontrado nas fontes configuradas"
      });
    }

    const preflight = enforceLinkValidation
      ? await applyPreflightValidation(selected)
      : {
          validRows: selected.map((row) => ({
            ...row,
            is_link_valid: null,
            link_http_status: null,
            link_validation_error: "not_checked",
            link_checked_at: null,
            link_edital: row.source_url
          })),
          invalidRows: []
        };
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

    const nicheRows = preflight.validRows.filter((row) => containsExsaFocusKeyword(row.description || ""));
    const skippedByNiche = preflight.validRows.length - nicheRows.length;
    const shouldEnforceNiche = STRICT_EXSA_INSERT || captureMode === "strict_quality";
    const rowsToInsert = shouldEnforceNiche ? nicheRows : preflight.validRows;

    if (rowsToInsert.length === 0) {
      return res.status(200).json({
        inserted: 0,
        warnings: [
          ...warnings,
          ...preflightWarnings,
          `Sem insercao: ${skippedByNiche} editais nao contem palavras-chave do nicho ExSA na descricao`
        ],
        message: "Nenhum edital alinhado ao nicho ExSA para insercao"
      });
    }

    await upsertBids(supabase, rowsToInsert);

    console.log(`[PNCP-SEARCH] Sucesso: inseridos ${rowsToInsert.length} editais`);
    return res.status(200).json({
      inserted: rowsToInsert.length,
      warnings: shouldEnforceNiche && skippedByNiche > 0
        ? [...warnings, ...preflightWarnings, `${skippedByNiche} editais descartados por nao aderirem ao nicho ExSA`]
        : [...warnings, ...preflightWarnings],
      metrics: {
        capture_mode: captureMode,
        full_sync: fullSync,
        target_year: targetYear,
        source_stats: sourceResults.map((sourceResult) => ({
          source: sourceResult.sourceName,
          fetched_items: sourceResult.items?.length || 0,
          warnings: (sourceResult.warnings || []).length
        })),
        dedupe: dedupeResult.metrics,
        selected_count: selected.length,
        preflight_valid_count: preflight.validRows.length,
        preflight_invalid_count: preflight.invalidRows.length,
        niche_match_count: nicheRows.length,
        inserted_count: rowsToInsert.length,
        enforce_link_validation: enforceLinkValidation,
        enforce_niche_filter: shouldEnforceNiche
      },
      validated: rowsToInsert.map((item) => ({
        pncp_id: item.pncp_id,
        title: item.title,
        organization_name: item.organization_name,
        municipio_orgao: item.municipio_orgao || null,
        orgao_cnpj: item.orgao_cnpj || null,
        ano: item.edital_ano || null,
        sequencial: item.edital_sequencial || null,
        edital_ano: item.edital_ano || null,
        edital_sequencial: item.edital_sequencial || null,
        portal_origin: item.portal_origin || item.source_system || item.source || null,
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
