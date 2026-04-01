import { fetchComprasGovOpenBidsByKeywords } from "../_shared/compras-api-service.js";
import { isDateWithinRange, logStructured, uniqBy, withRetry } from "./common.js";

const SOURCE = "compras";

/**
 * Busca editais no Compras.gov.br com tratamento de falhas e retry.
 * @param {string[]} keywords
 * @param {string | Date | null} dateFrom
 * @param {string | Date | null} dateTo
 * @returns {Promise<Array<{title: string, url: string, organ: string, date: string | null, matchedKeywords: string[]}>>}
 */
export async function fetch(keywords = [], dateFrom = null, dateTo = null) {
  const terms = Array.isArray(keywords) ? keywords.filter(Boolean).slice(0, 25) : [];
  if (terms.length === 0) {
    logStructured("warn", SOURCE, "empty_keywords", {});
    return [];
  }

  logStructured("info", SOURCE, "start", { terms: terms.length });

  const rows = await withRetry(
    () => fetchComprasGovOpenBidsByKeywords(terms, { timeoutMs: 12000, pageSize: 80 }),
    { source: SOURCE, operationName: "fetch_compras_api" }
  );

  const mapped = rows
    .map((row) => {
      const title = String(row.title || row.titulo || row.objeto || "Sem titulo").trim();
      const date = row.published_date || row.dataPublicacao || row.data_publicacao || row.data_abertura || null;
      return {
        title,
        url: row.url || row.link || row.href || row.linkDetalhe || "https://www.gov.br/compras",
        organ: row.organization || row.orgao_nome || row.orgao || row.uasg_nome || "Orgao nao informado",
        date,
        matchedKeywords: terms.filter((term) => title.toLowerCase().includes(String(term).toLowerCase()))
      };
    })
    .filter((item) => isDateWithinRange(item.date, dateFrom, dateTo));

  const deduped = uniqBy(mapped, (item) => `${item.url}|${item.title}`);
  logStructured("info", SOURCE, "done", { total: deduped.length });
  return deduped;
}
