import { load } from "cheerio";
import { isDateWithinRange, logStructured, normalizeText, uniqBy, withRetry } from "./common.js";

const SOURCE = "bll";
const BLL_PAGES = [
  "https://bll.org.br",
  "https://bll.org.br/licitacoes",
  "https://bll.org.br/editais"
];
const MAX_PAGES = 2;
const MAX_TOTAL_RESULTS = 50;
const REQUEST_TIMEOUT_MS = 8_000;
const RETRY_MAX_ATTEMPTS = 2;

function resolveUrl(baseUrl, candidate) {
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return candidate || "";
  }
}

function parseDateFromText(text) {
  const raw = String(text || "");
  const match = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function fetchPage(pageUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const response = await fetch(pageUrl, {
    headers: { "User-Agent": "Licita-E/1.0 (BLL Adapter)" },
    signal: controller.signal
  }).catch((error) => {
    if (error?.name === "AbortError") {
      throw new Error(`bll_timeout_${REQUEST_TIMEOUT_MS}ms`);
    }

    throw error;
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`bll_http_${response.status}`);
  }

  return response.text();
}

/**
 * Realiza scraping leve no portal BLL para extrair links publicos de editais.
 * @param {string[]} keywords
 * @param {string | Date | null} dateFrom
 * @param {string | Date | null} dateTo
 * @returns {Promise<Array<{titulo: string, href: string, orgao: string, data: string | null, tags: string[]}>>}
 */
export async function fetch(keywords = [], dateFrom = null, dateTo = null) {
  const terms = Array.isArray(keywords) ? keywords.filter(Boolean).slice(0, 15) : [];
  const targetPages = BLL_PAGES.slice(0, MAX_PAGES);
  logStructured("info", SOURCE, "start", { terms: terms.length, pages: targetPages.length, maxResults: MAX_TOTAL_RESULTS });

  const rows = [];
  const errors = [];

  for (const pageUrl of targetPages) {
    try {
      const html = await withRetry(() => fetchPage(pageUrl), {
        source: SOURCE,
        operationName: "fetch_page",
        maxAttempts: RETRY_MAX_ATTEMPTS
      });

      const $ = load(html);
      $("a").each((_, element) => {
        if (rows.length >= MAX_TOTAL_RESULTS) return false;

        const title = $(element).text().replace(/\s+/g, " ").trim();
        const href = resolveUrl(pageUrl, $(element).attr("href") || "");
        const corpus = normalizeText(`${title} ${href}`);

        if (!title || !href) return;

        const containsBidTerms = /(edital|licitac|pregao|concorrencia)/i.test(corpus);
        const matchedTerms = terms.filter((term) => corpus.includes(normalizeText(term)));
        if (!containsBidTerms && matchedTerms.length === 0) return;

        const date = parseDateFromText(title);
        if (!isDateWithinRange(date, dateFrom, dateTo)) return;

        rows.push({
          titulo: title,
          href,
          orgao: "BLL",
          data: date,
          tags: matchedTerms
        });

        if (rows.length >= MAX_TOTAL_RESULTS) return false;
      });

      if (rows.length >= MAX_TOTAL_RESULTS) {
        break;
      }
    } catch (error) {
      const reason = String(error?.message || error);

      if (reason.startsWith("bll_timeout_")) {
        logStructured("warn", SOURCE, "timeout_reached", {
          pageUrl,
          timeoutMs: REQUEST_TIMEOUT_MS,
          partialRows: rows.length
        });
        break;
      }

      errors.push({ pageUrl, reason });
      logStructured("error", SOURCE, "page_failed", { pageUrl, reason });
    }
  }

  if (rows.length === 0 && errors.length === targetPages.length) {
    throw new Error("bll_all_pages_failed");
  }

  const deduped = uniqBy(rows, (item) => item.href || item.titulo);
  logStructured("info", SOURCE, "done", { total: deduped.length, failedPages: errors.length });
  return deduped;
}
