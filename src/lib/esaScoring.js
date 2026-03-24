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
  "obras de pavimentacao",
  "brinquedos",
  "generos alimenticios"
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function evaluateEsaScore(text) {
  const lowered = normalizeText(text);

  const matchedExclusions = ESA_EXCLUSION_TERMS.filter((term) => lowered.includes(term));
  if (matchedExclusions.length > 0) {
    return {
      score: 0,
      hidden: true,
      highAdherence: false,
      matchedTopTerms: [],
      matchedExclusions
    };
  }

  const matchedTopTerms = ESA_TOP_TERMS.filter((term) => lowered.includes(term));
  const hasTopTerm = matchedTopTerms.length > 0;

  return {
    score: hasTopTerm ? 10 : 0,
    hidden: false,
    highAdherence: hasTopTerm,
    matchedTopTerms,
    matchedExclusions: []
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
