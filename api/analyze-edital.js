const GEMINI_MODEL = "gemini-2.0-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { pdfUrl, bidTitle } = req.body || {};
  if (!pdfUrl) {
    return res.status(400).json({ error: "pdfUrl e obrigatorio" });
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
      return res.status(500).json({ error: `Gemini API error: ${errText}` });
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return res.status(200).json({ raw: text });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Falha na analise com IA" });
  }
}