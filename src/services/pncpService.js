import { NICHE_KEYWORDS } from "../config/constants";
import { buildSearchQuery } from "./keywordService";

/**
 * @typedef {"ambiental" | "social" | "combinados"} KeywordCategory
 */

/**
 * @typedef {Object} SyncOptions
 * @property {boolean} [fullSync] Indica sincronizacao completa.
 * @property {"max_recall" | "strict"} [captureMode] Modo de captura para orquestracao.
 * @property {boolean} [enforceLinkValidation] Ativa validacao de links durante a captura.
 * @property {KeywordCategory[]} [categories] Categorias marcadas para enriquecimento de busca.
 */

/**
 * Executa sincronizacao de editais utilizando keywords enriquecidas.
 *
 * @param {string[] | null} [customKeywords] Lista de termos definidos pelo usuario.
 * @param {SyncOptions} [options] Opcoes de sincronizacao e enriquecimento.
 * @returns {Promise<{inserted: number, warnings: string[], validated: any[], metrics: any, message: string}>}
 */
export async function syncPncBids(customKeywords = null, options = {}) {
  const baseKeywords = customKeywords?.length ? customKeywords : NICHE_KEYWORDS;
  const selectedCategories = Array.isArray(options.categories) ? options.categories : [];
  const keywords = buildSearchQuery(baseKeywords, selectedCategories);
  const fullSync = options.fullSync ?? false;
  const captureMode = options.captureMode ?? "max_recall";
  const enforceLinkValidation = options.enforceLinkValidation ?? false;

  const response = await fetch("/api/pncp-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords, fullSync, captureMode, enforceLinkValidation })
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
    metrics: payload.metrics || null,
    message: payload.message || ""
  };
}
