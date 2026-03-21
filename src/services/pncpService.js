import { NICHE_KEYWORDS } from "../config/constants";

export async function syncPncBids() {
  const response = await fetch("/api/pncp-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords: NICHE_KEYWORDS })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Falha na sincronizacao PNCP.");
  }

  const payload = await response.json();
  return {
    inserted: payload.inserted ?? 0,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    message: payload.message || ""
  };
}
