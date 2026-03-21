const GEMINI_MODEL = "gemini-2.0-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { pdfUrl, bidTitle } = req.body || {};
  if (!pdfUrl) {
    return res.status(400).json({ error: "pdfUrl e obrigatorio" });
  }

  // Validar se chave de API está configurada
  if (!process.env.GEMINI_API_KEY) {
    console.error("[GEMINI] Chave GEMINI_API_KEY nao configurada");
    return res.status(500).json({ 
      error: "Servico de IA nao configurado. Configure GEMINI_API_KEY nas variaveis de ambiente." 
    });
  }

  try {
    const prompt = [
      `Analise o edital: ${bidTitle || "Sem titulo"}.`,
      `PDF: ${pdfUrl}`,
      "Responda em portugues e em JSON com os campos:",
      "is_viable (boolean)",
      "justification (string)",
      "deliverables (array de strings)",
      "A pergunta central: Este edital e viavel para uma consultoria de sociologia/antropologia?",
      "Liste os produtos entregaveis, por exemplo: relatorios, oficinas, diagnosticos e mapeamentos."
    ].join("\n");

    console.log(`[GEMINI] Enviando requisicao para ${GEMINI_MODEL}...`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[GEMINI] Erro HTTP ${response.status}:`, errText);

      if (response.status === 429) {
        return res.status(429).json({ 
          error: "Quota de API Gemini excedida. Configure billing em https://console.cloud.google.com/billing" 
        });
      }
      if (response.status === 401 || response.status === 403) {
        return res.status(401).json({ 
          error: "Chave de API Gemini invalida ou sem permissao. Verifique GEMINI_API_KEY." 
        });
      }

      return res.status(500).json({ error: `Gemini API error: ${errText}` });
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!text) {
      console.warn("[GEMINI] Resposta vazia do modelo");
      return res.status(500).json({ error: "Modelo Gemini retornou resposta vazia" });
    }

    console.log(`[GEMINI] Sucesso: ${text.length} caracteres retornados`);
    return res.status(200).json({ raw: text });
  } catch (error) {
    console.error(`[GEMINI] Excecao:`, error);
    return res.status(500).json({ error: error.message || "Falha na analise com IA" });
  }
}
