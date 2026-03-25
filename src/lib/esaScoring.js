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

export function sanitizeOrgNameForPncpSearch(value) {
  let text = String(value || "").trim();
  if (!text) return "";

  text = text
    .replace(/\bPREFEITURA MUNICIPAL DE\b/gi, "")
    .replace(/\bMUNICIPIO DE\b/gi, "")
    .replace(/\bPREFEITURA DE\b/gi, "")
    .replace(/\bSECRETARIA MUNICIPAL DE\b/gi, "")
    .replace(/\bSECRETARIA DE\b/gi, "")
    .replace(/\bGOVERNO DO ESTADO DE\b/gi, "")
    .replace(/\bESTADO DE\b/gi, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*[-/]\s*[A-Z]{2}\s*$/g, " ")
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
