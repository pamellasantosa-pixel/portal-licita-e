export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { pdfUrl, bidTitle, description, organizationName, modality, pncpId } = req.body || {};
  const normalized = `${bidTitle || ""} ${description || ""} ${organizationName || ""} ${modality || ""} ${pncpId || ""} ${pdfUrl || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  // Termos de projetos executados pela Expressao Socioambiental
  const primaryKeywords = [
    "diagnostico socioambiental",
    "estudo de impacto social",
    "plano basico ambiental",
    "consulta livre, previa e informada",
    "mediacao de conflitos territoriais",
    "cadastro socioeconomico",
    "monitoramento de condicionantes",
    "gestao de processos socioambientais",
    "regularizacao fundiaria",
    "elaboracao de relatorios de impacto",
    "consultoria em sustentabilidade",
    "planos de manejo",
    "mobilizacao social",
    "avaliacao de riscos sociais",
    "antropologia aplicada",
    "geoprocessamento e mapeamento",
    "inventario florestal",
    "gestao de participacao social",
    "programas de educacao ambiental",
    "facilitacao de dialogos intersetoriais",
    "clpi",
    "convencao 169",
    "licenciamento ambiental",
    "componente quilombola",
    "componente indigena",
    "termo de referencia",
    "audiencia publica"
  ];

  const positiveSignals = [
    "socioambiental",
    "comunidades tradicionais",
    "quilombola",
    "indigena",
    "territorial",
    "licenciamento",
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
    "engenharia civil",
    "obra",
    "engenharia pesada",
    "asfalto",
    "cimento",
    "pavimentacao",
    "pavimentação",
    "locacao de veiculos",
    "combustivel",
    "lubrificantes",
    "posto",
    "medicamento",
    "hospitalar",
    "limpeza urbana",
    "coleta de lixo",
    "manutencao predial",
    "ar-condicionado"
  ];

  const keywordHits = primaryKeywords.filter((token) => normalized.includes(token));
  const hits = positiveSignals.filter((token) => normalized.includes(token));
  const cautions = cautionSignals.filter((token) => normalized.includes(token));

  const score = keywordHits.length * 4 + hits.length * 2 - cautions.length * 4;
  const isViable = score >= 8;
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
    source_reference: pdfUrl || "https://pncp.gov.br/app/editais?pagina=1",
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
