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

  return response.json();
}
