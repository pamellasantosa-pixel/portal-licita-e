import { NICHE_KEYWORDS } from "../config/constants";

export async function syncPncBids(customKeywords = null, options = {}) {
  const keywords = customKeywords?.length ? customKeywords : NICHE_KEYWORDS;
  const fullSync = options.fullSync ?? true;

  const response = await fetch("/api/pncp-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords, fullSync })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Falha na sincronizacao PNCP.");
  }

  const payload = await response.json();
  return {
    inserted: payload.inserted ?? 0,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    validated: Array.isArray(payload.validated) ? payload.validated : [],
    message: payload.message || ""
  };
}
