export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { pdfUrl, bidTitle, description, organizationName, modality, pncpId } = req.body || {};
  const normalized = `${bidTitle || ""} ${description || ""} ${organizationName || ""} ${modality || ""} ${pncpId || ""} ${pdfUrl || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  // Keywords alinhadas ao escopo do Licita-E (mesmas do filtro inicial)
  const primaryKeywords = [
    "processos participativos",
    "consulta livre",
    "clpi",
    "povos e comunidades tradicionais",
    "mediação",
    "mediacao",
    "conflitos socioambientais",
    "diagnóstico",
    "diagnostico",
    "planejamento territorial",
    "urbano",
    "facilitação",
    "facilitacao",
    "oficinas",
    "mapeamento",
    "quilomb",
    "indigen"
  ];

  const positiveSignals = [
    "socioambiental",
    "comunidades tradicionais",
    "diagnostico",
    "territorial",
    "oficina",
    "pesquisa social",
    "antropologia",
    "sociologia",
    "etnografia",
    "trabalho social",
    "consulta pública",
    "consulta publica",
    "audiência pública",
    "audiencia publica"
  ];

  const cautionSignals = [
    "obra",
    "engenharia pesada",
    "asfalto",
    "cimento",
    "pavimentacao",
    "pavimentação",
    "locacao de veiculos",
    "combustivel",
    "medicamento",
    "equipamento hospitalar"
  ];

  const keywordHits = primaryKeywords.filter((token) => normalized.includes(token));
  const hits = positiveSignals.filter((token) => normalized.includes(token));
  const cautions = cautionSignals.filter((token) => normalized.includes(token));

  const score = keywordHits.length * 3 + hits.length - cautions.length * 2;
  const isViable = score >= 3;
  const confidence = Math.max(10, Math.min(95, 30 + score * 10));

  const deliverables = [
    "Plano de trabalho com cronograma",
    "Diagnostico socioterritorial",
    "Relatorios tecnicos parciais e final",
    "Facilitacao de oficinas participativas",
    "Mapa de stakeholders e riscos"
  ];

  const summary = {
    method: "analise_heuristica_gratuita",
    source_reference: pdfUrl || "https://pncp.gov.br/app/editais?status=recebendo_proposta&pagina=1",
    is_viable: isViable,
    score,
    confidence,
    keywords_encontradas: keywordHits,
    sinais_positivos: hits,
    sinais_de_atencao: cautions,
    justification: isViable
      ? "Ha sinais consistentes de que o edital envolve consultoria/servicos socioambientais/participativos, com termos aderentes encontrados em titulo/descricao."
      : "Nao encontrei sinais suficientes de aderencia no titulo/descricao. Vale abrir o edital no PNCP e validar o objeto e as entregas exigidas.",
    deliverables
  };

  return res.status(200).json({ raw: JSON.stringify(summary, null, 2) });
}
