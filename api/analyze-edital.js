import {
  CNAES,
  EXCLUSION_TERMS,
  KEYWORDS,
  NICHES,
  PRIORITY_TERRITORIES,
  PROJECT_TERMS,
  REQUIRED_TERMS,
  TARGET_ORGS
} from "./_shared/filters.js";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function scoreWithProfile(text) {
  const lowered = normalizeText(text);
  const keywordHits = KEYWORDS.filter((term) => lowered.includes(normalizeText(term))).length;
  const nicheHits = NICHES.filter((term) => lowered.includes(normalizeText(term))).length;
  const projectHits = PROJECT_TERMS.filter((term) => lowered.includes(normalizeText(term))).length;
  const requiredHits = REQUIRED_TERMS.filter((term) => lowered.includes(normalizeText(term))).length;
  const cnaeHits = CNAES.filter((term) => lowered.includes(normalizeText(term))).length;
  const orgHits = TARGET_ORGS.filter((term) => lowered.includes(normalizeText(term))).length;
  const territoryHits = PRIORITY_TERRITORIES.filter((term) => lowered.includes(normalizeText(term))).length;
  const exclusionHits = EXCLUSION_TERMS.filter((term) => lowered.includes(normalizeText(term))).length;

  const score =
    keywordHits * 4 +
    nicheHits * 3 +
    projectHits * 2 +
    requiredHits * 5 +
    cnaeHits * 2 +
    orgHits * 2 +
    territoryHits * 2 -
    exclusionHits * 3;

  return {
    score,
    keywordHits,
    nicheHits,
    projectHits,
    requiredHits,
    cnaeHits,
    orgHits,
    territoryHits,
    exclusionHits
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { pdfUrl, bidTitle, description, organizationName, modality, pncpId, guidelines } = req.body || {};
  const normalized = normalizeText(
    `${bidTitle || ""} ${description || ""} ${organizationName || ""} ${modality || ""} ${pncpId || ""} ${pdfUrl || ""}`
      .replace(/\s+/g, " ")
      .trim()
  );

  const profileScore = scoreWithProfile(normalized);
  const score = profileScore.score;
  const isViable = score >= 8;
  const confidence = Math.max(10, Math.min(95, 50 + score * 6));

  const keywordsEncontradas = [];
  for (const term of KEYWORDS) {
    if (normalized.includes(normalizeText(term))) keywordsEncontradas.push(term);
  }

  const sinaisPositivos = [];
  for (const term of [...NICHES, ...PROJECT_TERMS, ...REQUIRED_TERMS]) {
    if (normalized.includes(normalizeText(term))) sinaisPositivos.push(term);
  }

  const sinaisAtencao = [];
  for (const term of EXCLUSION_TERMS) {
    if (normalized.includes(normalizeText(term))) sinaisAtencao.push(term);
  }

  const deliverables = [
    "Plano de trabalho com cronograma",
    "Diagnostico socioterritorial",
    "Relatorios tecnicos parciais e final",
    "Facilitacao de oficinas participativas",
    "Mapa de stakeholders e riscos"
  ];

  const summary = {
    method: "analise_heuristica_gratuita",
    guidelines: guidelines || "Diretrizes ESA padrao",
    source_reference: pdfUrl || "https://pncp.gov.br/app/editais?pagina=1",
    is_viable: isViable,
    score,
    confidence,
    keywords_encontradas: keywordsEncontradas,
    sinais_positivos: sinaisPositivos,
    sinais_de_atencao: sinaisAtencao,
    score_breakdown: {
      keywordHits: profileScore.keywordHits,
      nicheHits: profileScore.nicheHits,
      projectHits: profileScore.projectHits,
      requiredHits: profileScore.requiredHits,
      cnaeHits: profileScore.cnaeHits,
      orgHits: profileScore.orgHits,
      territoryHits: profileScore.territoryHits,
      exclusionHits: profileScore.exclusionHits
    },
    justification: isViable
      ? "Ha sinais consistentes de aderencia ao perfil socioambiental com base na mesma regua de captura usada na listagem."
      : "Aderencia baixa pela regua de captura/analise atual. Vale abrir o edital no PNCP e validar objeto e entregas antes de descartar.",
    deliverables
  };

  return res.status(200).json({ raw: JSON.stringify(summary, null, 2) });
}
