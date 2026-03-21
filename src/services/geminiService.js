export async function analyzeBidWithGemini({ pdfUrl, bidTitle }) {
  const response = await fetch("/api/analyze-edital", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdfUrl, bidTitle })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Falha na analise de edital.");
  }

  return response.json();
}
