import pdfParse from "pdf-parse";

export async function extractPdfTextFromUrl(url, { timeoutMs = 20000, maxBytes = 25 * 1024 * 1024 } = {}) {
  const target = String(url || "").trim();
  if (!target) {
    return { ok: false, text: "", error: "pdf_url_vazia" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(target, { method: "GET", signal: controller.signal, redirect: "follow" });
    if (!response.ok) {
      return { ok: false, text: "", error: `http_${response.status}` };
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("pdf") && !target.toLowerCase().includes(".pdf")) {
      return { ok: false, text: "", error: "url_nao_pdf" };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0) {
      return { ok: false, text: "", error: "pdf_vazio" };
    }
    if (buffer.byteLength > maxBytes) {
      return { ok: false, text: "", error: "pdf_muito_grande" };
    }

    const parsed = await pdfParse(buffer);
    const text = String(parsed?.text || "").replace(/\s+/g, " ").trim();

    return {
      ok: true,
      text,
      pages: Number(parsed?.numpages || 0),
      bytes: buffer.byteLength
    };
  } catch (error) {
    return { ok: false, text: "", error: String(error?.name || error?.message || "pdf_parse_error") };
  } finally {
    clearTimeout(timer);
  }
}
