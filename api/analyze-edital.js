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
import { extractPdfTextFromUrl } from "./_shared/pdf-content-service.js";
import { evaluateEsaScore, evaluatePdfTextRelevanceGate } from "../src/lib/esaScoring.js";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function scoreWithProfile(text) {
  const lowered = normalizeText(text);
  const priorityRules = [
    ["clpi", "consulta livre previa e informada", "consulta previa", "consulta livre"],
    ["quilombola", "componente quilombola"],
    ["indigena", "indigena", "componente indigena"],
    ["diagnostico socioambiental"],
    ["convencao 169 oit", "convencao 169", "oit 169"],
    ["mediacao de conflitos", "mediacao de conflitos territoriais", "mediacao"]
  ];
  const negativeBlockers = ["pavimentacao", "brinquedos", "obras de engenharia", "aquisicao de materiais"];

  if (negativeBlockers.some((term) => lowered.includes(normalizeText(term)))) {
    return {
      score: 0,
      keywordHits: 0,
      nicheHits: 0,
      projectHits: 0,
      requiredHits: 0,
      cnaeHits: 0,
      orgHits: 0,
      territoryHits: 0,
      exclusionHits: 0
    };
  }

  const priorityHits = priorityRules.filter((group) => group.some((term) => lowered.includes(normalizeText(term)))).length;
  const keywordHits = KEYWORDS.filter((term) => lowered.includes(normalizeText(term))).length;
  const nicheHits = NICHES.filter((term) => lowered.includes(normalizeText(term))).length;
  const projectHits = PROJECT_TERMS.filter((term) => lowered.includes(normalizeText(term))).length;
  const requiredHits = REQUIRED_TERMS.filter((term) => lowered.includes(normalizeText(term))).length;
  const cnaeHits = CNAES.filter((term) => lowered.includes(normalizeText(term))).length;
  const orgHits = TARGET_ORGS.filter((term) => lowered.includes(normalizeText(term))).length;
  const territoryHits = PRIORITY_TERRITORIES.filter((term) => lowered.includes(normalizeText(term))).length;
  const exclusionHits = EXCLUSION_TERMS.filter((term) => lowered.includes(normalizeText(term))).length;

  const score =
    priorityHits * 10 +
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

function extractCommunitySummary(text) {
  const lowered = normalizeText(text);
  const communities = [];
  if (lowered.includes("quilombola")) communities.push("comunidades quilombolas");
  if (lowered.includes("indigena") || lowered.includes("indigena")) communities.push("povos indigenas");
  if (lowered.includes("comunidades tradicionais")) communities.push("comunidades tradicionais");
  if (lowered.includes("ribeirinh")) communities.push("comunidades ribeirinhas");
  if (lowered.includes("territorio")) communities.push("populacao de territorios afetados");
  return communities.length > 0 ? Array.from(new Set(communities)) : ["Nao identificado no texto do objeto"];
}

function extractTechnicalDeliverables(text) {
  const lowered = normalizeText(text);
  const candidates = [
    { key: "oficinas", label: "oficinas participativas" },
    { key: "relatorio", label: "relatorios tecnicos" },
    { key: "diagnostico", label: "diagnostico socioambiental" },
    { key: "plano de trabalho", label: "plano de trabalho" },
    { key: "consulta", label: "processos de consulta" },
    { key: "mapeamento", label: "mapeamento territorial/social" },
    { key: "monitoramento", label: "monitoramento de condicionantes" }
  ];

  const found = candidates.filter((item) => lowered.includes(item.key)).map((item) => item.label);
  return found.length > 0 ? Array.from(new Set(found)) : ["Entregaveis tecnicos nao explicitados no texto"];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { pdfUrl, bidTitle, description, organizationName, modality, pncpId, guidelines } = req.body || {};

  const pdfExtraction = await extractPdfTextFromUrl(pdfUrl, { timeoutMs: 25000 });
  const pdfText = pdfExtraction.ok ? String(pdfExtraction.text || "") : "";
  const relevanceGate = evaluatePdfTextRelevanceGate(pdfText);
  const metadataText = `${bidTitle || ""} ${description || ""} ${organizationName || ""} ${modality || ""} ${pncpId || ""}`
    .replace(/\s+/g, " ")
    .trim();
  const normalizedMetadata = normalizeText(metadataText);
  const metadataScore = evaluateEsaScore(metadataText, { organizationName: organizationName || "" });
  const metadataProfile = scoreWithProfile(normalizedMetadata);
  const metadataKeywordHits = KEYWORDS.filter((term) => normalizedMetadata.includes(normalizeText(term)));
  const metadataPositiveSignals = [...NICHES, ...PROJECT_TERMS, ...REQUIRED_TERMS].filter((term) =>
    normalizedMetadata.includes(normalizeText(term))
  );
  const metadataWarningSignals = EXCLUSION_TERMS.filter((term) => normalizedMetadata.includes(normalizeText(term)));

  if (!pdfExtraction.ok || !relevanceGate.isRelevant) {
    const fallbackScore = Math.max(Number(metadataScore.score || 0), Number(metadataProfile.score || 0));
    const fallbackIsViable = fallbackScore >= 8 || Boolean(metadataScore.highAdherence);
    const fallbackStatus = fallbackIsViable ? "relevante" : "revisar";
    const summary = {
      method: "analise_hibrida_fallback",
      guidelines: guidelines || "Diretrizes ESA padrao",
      source_reference: pdfUrl || "https://pncp.gov.br/app/editais?pagina=1",
      is_viable: fallbackIsViable,
      score: fallbackScore,
      score_esa: fallbackScore,
      confidence: fallbackIsViable ? 78 : 60,
      ia_relevance_status: fallbackStatus,
      relevance_reason: !pdfExtraction.ok
        ? `PDF indisponivel (${pdfExtraction.error}); analise feita por metadados do edital.`
        : `${relevanceGate.reason}; analise feita por metadados do edital.`,
      keywords_encontradas: metadataKeywordHits,
      sinais_positivos: metadataPositiveSignals,
      sinais_de_atencao: [
        "PDF sem confirmacao minima de aderencia; resultado baseado em metadados.",
        ...metadataWarningSignals
      ],
      score_breakdown: {
        keywordHits: metadataProfile.keywordHits,
        nicheHits: metadataProfile.nicheHits,
        projectHits: metadataProfile.projectHits,
        requiredHits: metadataProfile.requiredHits,
        cnaeHits: metadataProfile.cnaeHits,
        orgHits: metadataProfile.orgHits,
        territoryHits: metadataProfile.territoryHits,
        exclusionHits: metadataProfile.exclusionHits
      },
      objeto_esa_resumo: {
        comunidade_afetada: extractCommunitySummary(metadataText),
        entregaveis_tecnicos: extractTechnicalDeliverables(metadataText),
        sintese: "Analise gerada com fallback por metadados porque o PDF nao estava disponivel/aderente."
      },
      justification: fallbackIsViable
        ? "Coerente com os sinais do cadastro do edital, mas recomenda-se validar no documento oficial quando o PDF estiver disponivel."
        : "Sinais insuficientes no cadastro do edital e sem texto PDF confiavel para confirmar aderencia.",
      deliverables: [],
      pdf_meta: {
        ok: pdfExtraction.ok,
        error: pdfExtraction.error || null,
        pages: pdfExtraction.pages || 0,
        text_length: pdfText.length,
        terms_found: relevanceGate.matchedTerms || []
      }
    };

    return res.status(200).json({ raw: JSON.stringify(summary, null, 2) });
  }

  const normalized = normalizeText(
    `${bidTitle || ""} ${description || ""} ${organizationName || ""} ${modality || ""} ${pncpId || ""} ${pdfText || ""}`
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
    method: "analise_pdf_real",
    guidelines: guidelines || "Diretrizes ESA padrao",
    source_reference: pdfUrl || "https://pncp.gov.br/app/editais?pagina=1",
    is_viable: isViable,
    score,
    score_esa: score,
    confidence,
    ia_relevance_status: "relevante",
    relevance_reason: relevanceGate.reason,
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
    objeto_esa_resumo: {
      comunidade_afetada: extractCommunitySummary(normalized),
      entregaveis_tecnicos: extractTechnicalDeliverables(normalized),
      sintese: "Resumo automatico focado em comunidade impactada e entregaveis tecnicos para triagem ESA."
    },
    justification: isViable
      ? "Ha sinais consistentes de aderencia ao perfil socioambiental com base na mesma regua de captura usada na listagem."
      : "Aderencia baixa pela regua de captura/analise atual. Vale abrir o edital no PNCP e validar objeto e entregas antes de descartar.",
    deliverables,
    pdf_meta: {
      ok: true,
      error: null,
      pages: pdfExtraction.pages || 0,
      text_length: pdfText.length,
      terms_found: relevanceGate.matchedTerms || []
    }
  };

  return res.status(200).json({ raw: JSON.stringify(summary, null, 2) });
}
