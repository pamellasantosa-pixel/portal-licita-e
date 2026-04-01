import { isDateWithinRange, logStructured, uniqBy, withRetry } from "./common.js";

const SOURCE = "serper";
const SERPER_URL = "https://google.serper.dev/search";
const CACHE_TTL_MS = 30 * 60 * 1000;
const KNOWN_MARKETPLACE_DOMAINS = new Set(["bll.org.br", "licitanet.com.br", "bnc.org.br"]);
const memoryCache = new Map();

/**
 * @typedef {Object} EditalItem
 * @property {string} source
 * @property {string} title
 * @property {string} name
 * @property {string} link
 * @property {string} url
 * @property {string} snippet
 * @property {string} displayLink
 * @property {string | null} publishDate
 * @property {string | null} date
 * @property {string[]} queryKeywords
 * @property {string[]} keywords
 * @property {string} query
 */

/**
 * Monta query combinando keywords com termos e dominios de interesse.
 * @param {string[]} keywords
 * @returns {string}
 */
export function buildSerperQuery(keywords) {
  const terms = Array.isArray(keywords)
    ? keywords.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  const fixedTerms =
    "edital OR licitação OR pregão site:gov.br OR site:bll.org.br OR site:licitanet.com.br";

  return [terms.join(" "), fixedTerms].filter(Boolean).join(" ").trim();
}

function buildCacheKey(query, dateFrom, dateTo) {
  return [String(query || "").trim().toLowerCase(), String(dateFrom || ""), String(dateTo || "")].join("|");
}

function getCachedItems(cacheKey) {
  const entry = memoryCache.get(cacheKey);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(cacheKey);
    return null;
  }

  return entry.items;
}

function setCachedItems(cacheKey, items) {
  memoryCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    items
  });
}

function extractHostname(url) {
  try {
    return new URL(String(url || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isAllowedDomain(hostname) {
  if (!hostname) return false;
  if (hostname.endsWith(".gov.br") || hostname === "gov.br") return true;

  for (const domain of KNOWN_MARKETPLACE_DOMAINS) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return true;
    }
  }

  return false;
}

/**
 * @param {any} item
 * @param {string[]} queryKeywords
 * @param {string} query
 * @returns {EditalItem | null}
 */
function toEditalItem(item, queryKeywords, query) {
  const link = String(item?.link || "").trim();
  const hostname = extractHostname(link);

  if (!isAllowedDomain(hostname)) {
    return null;
  }

  const publishDate = item?.date ? String(item.date) : null;
  const title = String(item?.title || "Sem titulo").trim();
  const snippet = String(item?.snippet || "").trim();

  return {
    source: SOURCE,
    title,
    name: title,
    link,
    url: link,
    snippet,
    displayLink: hostname,
    publishDate,
    date: publishDate,
    queryKeywords,
    keywords: queryKeywords,
    query
  };
}

async function fetchByQuery(query, apiKey, dateFrom, dateTo, queryKeywords) {
  const cacheKey = buildCacheKey(query, dateFrom, dateTo);
  const cached = getCachedItems(cacheKey);
  if (cached) {
    logStructured("info", SOURCE, "cache_hit", { query });
    return cached;
  }

  const response = await globalThis.fetch(SERPER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
      "User-Agent": "Licita-E/1.0 (Serper Adapter)"
    },
    body: JSON.stringify({ q: query, gl: "br", hl: "pt-br", num: 10 })
  });

  if (!response.ok) {
    throw new Error(`serper_http_${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  const items = Array.isArray(payload?.organic) ? payload.organic : [];

  const normalized = items
    .map((item) => toEditalItem(item, queryKeywords, query))
    .filter(Boolean)
    .filter((item) => isDateWithinRange(item.publishDate, dateFrom, dateTo));

  setCachedItems(cacheKey, normalized);
  return normalized;
}

/**
 * Busca editais usando Serper API com credencial de ambiente.
 * @param {string[]} keywords
 * @param {string | Date | null} dateFrom
 * @param {string | Date | null} dateTo
 * @returns {Promise<EditalItem[]>}
 */
export async function fetch(keywords = [], dateFrom = null, dateTo = null) {
  const apiKey = process.env.SERPER_API_KEY || "";

  if (!apiKey) {
    throw new Error("SERPER_API_KEY não configurada");
  }

  const terms = Array.isArray(keywords) ? keywords.filter(Boolean).slice(0, 15) : [];
  if (terms.length === 0) {
    logStructured("warn", SOURCE, "empty_keywords", {});
    return [];
  }

  const query = buildSerperQuery(terms);
  logStructured("info", SOURCE, "start", { terms: terms.length, query });

  try {
    const rows = await withRetry(() => fetchByQuery(query, apiKey, dateFrom, dateTo, terms), {
      source: SOURCE,
      operationName: "fetch_serper_query"
    });

    const deduped = uniqBy(rows, (item) => item.link || `${item.name}|${item.query}`);
    logStructured("info", SOURCE, "done", { total: deduped.length, failedKeywords: 0 });
    return deduped;
  } catch (error) {
    const reason = String(error?.message || error);
    logStructured("error", SOURCE, "query_failed", { query, reason });
    throw new Error(`serper_query_failed:${reason}`);
  }
}
