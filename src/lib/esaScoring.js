const ESA_TOP_TERMS = [
  "clpi",
  "consulta previa",
  "quilombola",
  "indigena",
  "diagnostico socioambiental",
  "convencao 169"
];

const ESA_EXCLUSION_TERMS = [
  "aquisicao de materiais",
  "pavimentacao",
  "obras de pavimentacao",
  "brinquedo",
  "brinquedos",
  "alimenticio",
  "alimenticios",
  "generos alimenticios"
];

const FEDERAL_PRIORITY_ORGS = ["incra", "funai", "ibama", "icmbio", "mma"];
const PNCP_EDITAIS_BASE_URL = "https://pncp.gov.br/app/editais";

const PDF_ADHERENCE_TERMS = [
  "quilombola",
  "diagnostico socioambiental",
  "diagnostico",
  "socioambiental",
  "licenciamento",
  "clpi",
  "consulta previa",
  "indigena",
  "convencao 169"
];

const BRAZIL_STATE_NAMES = [
  "ACRE",
  "ALAGOAS",
  "AMAPA",
  "AMAZONAS",
  "BAHIA",
  "CEARA",
  "DISTRITO FEDERAL",
  "ESPIRITO SANTO",
  "GOIAS",
  "MARANHAO",
  "MATO GROSSO",
  "MATO GROSSO DO SUL",
  "MINAS GERAIS",
  "PARA",
  "PARAIBA",
  "PARANA",
  "PERNAMBUCO",
  "PIAUI",
  "RIO DE JANEIRO",
  "RIO GRANDE DO NORTE",
  "RIO GRANDE DO SUL",
  "RONDONIA",
  "RORAIMA",
  "SANTA CATARINA",
  "SAO PAULO",
  "SERGIPE",
  "TOCANTINS"
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function isPriorityFederalOrg(orgName) {
  const normalized = normalizeText(orgName);
  return FEDERAL_PRIORITY_ORGS.some((org) => normalized.includes(org));
}

function hasAutoTopFederalSignal(normalizedText, normalizedOrgName) {
  const isIncraOrFunai = normalizedOrgName.includes("incra") || normalizedOrgName.includes("funai");
  if (!isIncraOrFunai) return false;
  return normalizedText.includes("quilombola") || normalizedText.includes("indigena");
}

export function isAbsoluteVeto(evaluation) {
  return Boolean(evaluation?.isAbsoluteVeto || evaluation?.hidden);
}

export function formatEsaReasonLabel(reason, evaluation = {}) {
  const value = String(reason || "sem_termo");
  if (value.startsWith("exclusao:")) {
    const exclusionTerm = value.replace("exclusao:", "").trim() || evaluation?.matchedExclusions?.[0] || "termo de exclusao";
    return `Vetado por: ${exclusionTerm}`;
  }
  if (value.startsWith("termo:")) {
    const topTerm = value.replace("termo:", "").trim() || evaluation?.matchedTopTerms?.[0] || "termo ESA";
    return `Filtrado por: ${topTerm}`;
  }
  if (value === "federal_incra_funai") {
    return "Filtrado por: prioridade federal INCRA/FUNAI";
  }
  return "Sem sinais ESA";
}

export function extractScoreSearchTerm(reason, evaluation = {}) {
  const value = String(reason || "sem_termo").trim();

  if (value.startsWith("termo:")) {
    return value.replace("termo:", "").trim();
  }

  if (value === "federal_incra_funai") {
    const matched = Array.isArray(evaluation?.matchedTopTerms) ? evaluation.matchedTopTerms : [];
    const firstRelevant = matched.find((term) => term && term !== "federal_incra_funai" && term !== "quilombola_ou_indigena");
    return firstRelevant || "quilombola";
  }

  return "";
}

export function cleanOrganName(value) {
  let text = String(value || "").trim();
  if (!text) return "";

  text = text
    .replace(/\bPREFEITURA MUNICIPAL DE\b/gi, "")
    .replace(/\bFUNDO MUNICIPAL DE\b/gi, "")
    .replace(/\bSEPLAN\b/gi, "")
    .replace(/\bUCP\b/gi, "")
    .replace(/\bSECRETARIA\b/gi, "")
    .replace(/\bDEPARTAMENTO\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const normalized = normalizeText(text);
  for (const stateName of BRAZIL_STATE_NAMES) {
    if (normalized.includes(normalizeText(stateName))) {
      return stateName;
    }
  }

  return text;
}

export function sanitizeOrgNameForPncpSearch(value) {
  let text = cleanOrganName(value)
    .replace(/\b[A-Z]{2,6}\b/g, (chunk) => {
      // Remove siglas administrativas comuns que poluem a busca.
      const upper = chunk.toUpperCase();
      const noisy = new Set(["PM", "PMA", "SE", "SMS", "SM", "SEM", "GOV", "EST"]);
      return noisy.has(upper) ? " " : chunk;
    })
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

export function buildPncpSearchUrlByCnpj(orgaoCnpj, organizationName = "", scoreTerm = "") {
  const cnpj = sanitizeCnpj(orgaoCnpj);
  const term = String(scoreTerm || "").trim();
  if (cnpj) {
    const query = [cnpj, term].filter(Boolean).join(" ").trim();
    return `${PNCP_EDITAIS_BASE_URL}?q=${encodeURIComponent(query)}`;
  }

  const cleanOrg = sanitizeOrgNameForPncpSearch(cleanOrganName(organizationName));
  const fallbackQuery = [cleanOrg, term, "edital"].filter(Boolean).join(" ").trim();
  if (!fallbackQuery) return `${PNCP_EDITAIS_BASE_URL}?pagina=1`;
  return `${PNCP_EDITAIS_BASE_URL}?q=${encodeURIComponent(fallbackQuery)}`;
}

function normalizeYear(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 4) return digits;
  return "";
}

function normalizeSequential(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const asNumber = Number(digits);
  if (!Number.isFinite(asNumber)) return digits;
  return String(asNumber);
}

function parsePncpIdIdentifiers(pncpId) {
  const raw = String(pncpId || "").trim();
  if (!raw) return { cnpj: "", ano: "", sequencial: "" };

  const slashPattern = raw.match(/^(\d{14})-(\d+)-(\d+)\/(\d{4})$/);
  if (slashPattern) {
    return {
      cnpj: sanitizeCnpj(slashPattern[1]),
      ano: normalizeYear(slashPattern[4]),
      sequencial: normalizeSequential(slashPattern[3])
    };
  }

  const canonicalPattern = raw.match(/^(\d{14})-(\d{4})-(\d+)$/);
  if (canonicalPattern) {
    return {
      cnpj: sanitizeCnpj(canonicalPattern[1]),
      ano: normalizeYear(canonicalPattern[2]),
      sequencial: normalizeSequential(canonicalPattern[3])
    };
  }

  return { cnpj: "", ano: "", sequencial: "" };
}

export function hasPncpDirectIdentifiers({ orgaoCnpj, ano, sequencial, pncpId } = {}) {
  const fromPncpId = parsePncpIdIdentifiers(pncpId);
  const cnpj = sanitizeCnpj(orgaoCnpj) || fromPncpId.cnpj;
  const safeYear = normalizeYear(ano) || fromPncpId.ano;
  const safeSequential = normalizeSequential(sequencial) || fromPncpId.sequencial;
  return Boolean(cnpj && safeYear && safeSequential);
}

export function buildPncpDirectUrl({ orgaoCnpj, ano, sequencial, pncpId, fallbackUrl } = {}) {
  const fromPncpId = parsePncpIdIdentifiers(pncpId);
  const cnpj = sanitizeCnpj(orgaoCnpj) || fromPncpId.cnpj;
  const safeYear = normalizeYear(ano) || fromPncpId.ano;
  const safeSequential = normalizeSequential(sequencial) || fromPncpId.sequencial;

  if (cnpj && safeYear && safeSequential) {
    return `${PNCP_EDITAIS_BASE_URL}/${cnpj}/${safeYear}/${safeSequential}`;
  }

  const safeFallback = String(fallbackUrl || "").trim();
  if (safeFallback) return safeFallback;
  return `${PNCP_EDITAIS_BASE_URL}?pagina=1`;
}

export function evaluatePdfTextRelevanceGate(pdfText) {
  const normalized = normalizeText(pdfText || "");
  if (!normalized.trim()) {
    return {
      isRelevant: false,
      score: 0,
      matchedTerms: [],
      status: "irrelevante",
      reason: "Texto do PDF vazio"
    };
  }

  const matchedTerms = PDF_ADHERENCE_TERMS.filter((term) => normalized.includes(normalizeText(term)));

  if (matchedTerms.length < 1) {
    return {
      isRelevant: false,
      score: 0,
      matchedTerms,
      status: "irrelevante",
      reason: "Nenhum termo de aderencia identificado no PDF"
    };
  }

  return {
    isRelevant: true,
    score: Math.min(10, matchedTerms.length + 3),
    matchedTerms,
    status: "relevante",
    reason: "PDF com aderencia minima confirmada"
  };
}

export function evaluateEsaScore(text, context = {}) {
  const lowered = normalizeText(text);
  const orgName = normalizeText(context.organizationName || context.organization || "");

  const matchedExclusions = ESA_EXCLUSION_TERMS.filter((term) => lowered.includes(normalizeText(term)));
  if (matchedExclusions.length > 0) {
    return {
      score: 0,
      hidden: true,
      isAbsoluteVeto: true,
      highAdherence: false,
      matchedTopTerms: [],
      matchedExclusions,
      reason: `exclusao:${matchedExclusions[0]}`
    };
  }

  if (hasAutoTopFederalSignal(lowered, orgName)) {
    return {
      score: 10,
      hidden: false,
      isAbsoluteVeto: false,
      highAdherence: true,
      matchedTopTerms: ["federal_incra_funai", "quilombola_ou_indigena"],
      matchedExclusions: [],
      reason: "federal_incra_funai"
    };
  }

  const matchedTopTerms = ESA_TOP_TERMS.filter((term) => lowered.includes(term));
  const hasTopTerm = matchedTopTerms.length > 0;

  return {
    score: hasTopTerm ? 10 : 0,
    hidden: false,
    isAbsoluteVeto: false,
    highAdherence: hasTopTerm,
    matchedTopTerms,
    matchedExclusions: [],
    reason: hasTopTerm ? `termo:${matchedTopTerms[0]}` : "sem_termo"
  };
}

export function sanitizeCnpj(value) {
  const clean = String(value || "").replace(/\D/g, "");
  return clean.length === 14 ? clean : "";
}

export function isEmailLike(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.toLowerCase().startsWith("mailto:")) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(text);
}
