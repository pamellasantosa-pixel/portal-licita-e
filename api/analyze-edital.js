export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { pdfUrl, bidTitle } = req.body || {};
  const normalized = `${bidTitle || ""} ${pdfUrl || ""}`.toLowerCase();

  const positiveSignals = [
    "consulta",
    "participativo",
    "socioambiental",
    "comunidades tradicionais",
    "quilomb",
    "indigen",
    "diagnostico",
    "territorial",
    "oficina",
    "pesquisa social",
    "antropologia",
    "sociologia"
  ];

  const cautionSignals = [
    "obra",
    "engenharia pesada",
    "asfalto",
    "cimento",
    "locacao de veiculos",
    "combustivel",
    "medicamento",
    "equipamento hospitalar"
  ];

  const hits = positiveSignals.filter((token) => normalized.includes(token));
  const cautions = cautionSignals.filter((token) => normalized.includes(token));

  const score = hits.length - cautions.length;
  const isViable = score >= 1;

  const deliverables = [
    "Plano de trabalho com cronograma",
    "Diagnostico socioterritorial",
    "Relatorios tecnicos parciais e final",
    "Facilitacao de oficinas participativas",
    "Mapa de stakeholders e riscos"
  ];

  const summary = {
    method: "analise_heuristica_gratuita",
    source_reference: "https://www.gov.br/compras/pt-br",
    is_viable: isViable,
    score,
    sinais_positivos: hits,
    sinais_de_atencao: cautions,
    justification: isViable
      ? "O edital parece aderente a servicos de consultoria socioambiental/sociologica com base nos termos encontrados no titulo e referencia do documento."
      : "O edital nao apresenta termos suficientes de aderencia para consultoria socioambiental/sociologica. Recomenda-se validacao manual no Compras.gov.br.",
    deliverables
  };

  return res.status(200).json({ raw: JSON.stringify(summary, null, 2) });
}
