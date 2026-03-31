import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  KEYWORDS,
  CNAES,
  EXCLUSION_TERMS,
  REQUIRED_TERMS,
  MAX_TICKET,
  MIN_TICKET,
  NICHES,
  PRIORITY_TERRITORIES,
  PROJECT_TERMS,
  TARGET_ORGS
} from "./_shared/filters.js";
import { fetchComprasGovOpenBidsByKeywords } from "./_shared/compras-api-service.js";
import { validateDocumentLink } from "./_shared/link-validation.js";
import { fetch as fetchPncp } from "./sources/pncp-adapter.js";
import { fetch as fetchComprasGov } from "./sources/compras-gov-adapter.js";
import { fetch as fetchSerper } from "./sources/serper-adapter.js";
import { fetch as fetchBll } from "./sources/bll-adapter.js";

import { createCircuitBreakers, persistCircuitState } from "./lib/circuit-breaker.js";

export const config = { api: { bodyParser: true } };

const SOURCE_ORDER = ["pncp", "compras", "serper", "bll"];
const GLOBAL_SETTLED_TIMEOUT_MS = 25_000;
const SOURCE_BREAKER_CONFIGS = SOURCE_ORDER.map((name) => ({
  name,
  failureThreshold: 3,
  timeout: 60_000
}));

/**
 * Executa uma fonte protegida por circuit breaker e persiste estado atualizado.
 * @template T
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {import("./lib/circuit-breaker.js").CircuitBreaker} breaker
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
async function runWithCircuit(supabase, breaker, operation) {
  try {
    const result = await breaker.execute(operation);
    await persistCircuitState(supabase, breaker);
    return result;
  } catch (error) {
    await persistCircuitState(supabase, breaker).catch((persistError) => {
      console.error("[source_health_persist_error]", persistError?.message || persistError);
    });
    throw error;
  }
}

/**
 * Gera identificador estavel para upsert no Supabase.
 * @param {{url: string}} item
 * @returns {string}
 */
function buildStableId(item) {
  const payload = canonicalizeUrl(item.url);
  return createHash("sha1").update(payload).digest("hex");
}

/**
 * Normaliza resultado de qualquer fonte para o schema unificado.
 * @param {"pncp"|"compras"|"serper"|"bll"} source
 * @param {Record<string, unknown>} row
 * @returns {{title: string, url: string, organ: string, date: string | null, keywords: string[], source: "pncp"|"compras"|"serper"|"bll"}}
 */
function normalizeSourceRow(source, row) {
  if (source === "pncp") {
    return {
      title: String(row.titulo || row.title || "Sem titulo").trim(),
      url: String(row.link || row.url || "").trim(),
      organ: String(row.orgao || row.organ || "Orgao nao informado").trim(),
      date: row.data ? String(row.data) : null,
      keywords: Array.isArray(row.chaves) ? row.chaves.map((v) => String(v)) : [],
      source
    };
  }

  if (source === "compras") {
    return {
      title: String(row.title || row.titulo || "Sem titulo").trim(),
      url: String(row.url || row.link || "").trim(),
      organ: String(row.organ || row.orgao || "Orgao nao informado").trim(),
      date: row.date ? String(row.date) : null,
      keywords: Array.isArray(row.matchedKeywords) ? row.matchedKeywords.map((v) => String(v)) : [],
      source
    };
  }

  if (source === "serper") {
    return {
      title: String(row.name || row.title || "Sem titulo").trim(),
      url: String(row.link || row.url || "").trim(),
      organ: "Serper",
      date: row.publishDate ? String(row.publishDate) : null,
      keywords: Array.isArray(row.queryKeywords) ? row.queryKeywords.map((v) => String(v)) : [],
      source
    };
  }

  return {
    title: String(row.titulo || row.title || "Sem titulo").trim(),
    url: String(row.href || row.url || "").trim(),
    organ: String(row.orgao || row.organ || "BLL").trim(),
    date: row.data ? String(row.data) : null,
    keywords: Array.isArray(row.tags) ? row.tags.map((v) => String(v)) : [],
    source
  };
}

/**
 * Construi assinatura canonica de URL para deduplicacao cross-source.
 * @param {string} url
 * @returns {string}
 */
function canonicalizeUrl(url) {
  try {
    const parsed = new URL(String(url || "").trim());
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${path}`;
  } catch {
    return String(url || "").trim().toLowerCase();
  }
}

/**
 * Determina se o texto representa um valor util, desconsiderando placeholders comuns.
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
function hasMeaningfulText(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;

  const placeholders = new Set(["sem titulo", "orgao nao informado", "google cse", "serper", "bll"]);
  return !placeholders.has(normalized);
}

/**
 * Calcula score de completude para decidir qual registro manter ao deduplicar.
 * @param {{title: string, url: string, organ: string, date: string | null, keywords: string[]}} row
 * @returns {number}
 */
function getCompletenessScore(row) {
  let score = 0;
  if (hasMeaningfulText(row.title)) score += 3;
  if (row.url) score += 2;
  if (hasMeaningfulText(row.organ)) score += 2;
  if (row.date) score += 1;
  if (Array.isArray(row.keywords) && row.keywords.length > 0) score += 1;
  return score;
}

/**
 * Consolida origens em CSV com ordem estavel.
 * @param {string} sourceA
 * @param {string} sourceB
 * @returns {string}
 */
function mergeSources(sourceA, sourceB) {
  const values = new Set(
    [sourceA, sourceB]
      .flatMap((value) => String(value || "").split(","))
      .map((value) => value.trim())
      .filter(Boolean)
  );

  const ordered = SOURCE_ORDER.filter((name) => values.has(name));
  const extras = Array.from(values).filter((name) => !SOURCE_ORDER.includes(name)).sort();
  return [...ordered, ...extras].join(",");
}

/**
 * Remove itens vazios e normaliza lista para persistencia.
 * @param {Array<{title: string, url: string, organ: string, date: string | null, keywords: string[], source: string}>} rows
 * @returns {Array<{title: string, url: string, organ: string, date: string | null, keywords: string[], source: string}>}
 */
function sanitizeRows(rows) {
  const unique = new Map();

  for (const row of rows) {
    if (!row.title || !row.url) continue;
    const key = canonicalizeUrl(row.url);

    if (!unique.has(key)) {
      unique.set(key, row);
      continue;
    }

    const current = unique.get(key);
    const keepRow = getCompletenessScore(row) > getCompletenessScore(current) ? row : current;
    const fallbackRow = keepRow === row ? current : row;
    const mergedKeywords = Array.from(new Set([...(current.keywords || []), ...(row.keywords || [])]));

    unique.set(key, {
      ...keepRow,
      keywords: mergedKeywords,
      source: mergeSources(current.source, row.source),
      title: hasMeaningfulText(keepRow.title) ? keepRow.title : fallbackRow.title,
      organ: hasMeaningfulText(keepRow.organ) ? keepRow.organ : fallbackRow.organ,
      date: keepRow.date || fallbackRow.date
    });
  }

  return Array.from(unique.values());
}

/**
 * Persiste itens normalizados na tabela bids.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Array<{title: string, url: string, organ: string, date: string | null, keywords: string[], source: string}>} rows
 * @returns {Promise<number>}
 */
async function persistFulfilledRows(supabase, rows) {
  if (!rows.length) return 0;

  const payload = rows.map((item) => {
    const stableId = buildStableId(item);
    return {
      pncp_id: stableId,
      title: item.title,
      description: item.keywords.join(" | ") || null,
      organization_name: item.organ,
      orgao_nome: item.organ,
      source: item.source,
      source_system: item.source.toUpperCase(),
      portal_origin: item.source,
      source_url: item.url,
      link_edital: item.url,
      published_date: item.date || new Date().toISOString(),
      data_abertura: item.date || null,
      status: "em_analise",
      objeto_descricao: item.title
    };
  });

  const { error } = await supabase.from("bids").upsert(payload, { onConflict: "pncp_id" });
  if (error) {
    throw new Error(error.message || "failed_to_persist_bids");
  }

  return payload.length;
}

/**
 * Endpoint de busca multi-fonte para editais.
 * @param {import("http").IncomingMessage & { method?: string, body?: any }} req
 * @param {{ status: (code: number) => { json: (body: any) => any } }} res
 * @returns {Promise<any>}
 */
export default async function handler(req, res) {
  console.log("=== DEBUG HEADERS ===", req.headers?.["content-type"]);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "invalid_json_body" });
    }
  }

  const { keywords = [], dateFrom, dateTo } = body || {};
  const safeKeywords = Array.isArray(keywords) ? keywords.filter(Boolean) : [];
  const safeDateFrom = dateFrom || body?.from || null;
  const safeDateTo = dateTo || body?.to || null;

  console.log("keywords recebidas:", safeKeywords, "dateFrom:", safeDateFrom, "dateTo:", safeDateTo);

  if (!safeKeywords.length) {
    return res.status(400).json({ error: "keywords obrigatorio" });
  }

  console.log("=== DEBUG BODY ===", JSON.stringify(req.body));

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const breakers = await createCircuitBreakers(supabase, SOURCE_BREAKER_CONFIGS);

  const sources = [
    {
      key: "pncp",
      run: () => runWithCircuit(supabase, breakers.pncp, () => fetchPncp(safeKeywords, safeDateFrom, safeDateTo))
    },
    {
      key: "compras",
      run: () => runWithCircuit(supabase, breakers.compras, () => fetchComprasGov(safeKeywords, safeDateFrom, safeDateTo))
    },
    {
      key: "serper",
      run: () => runWithCircuit(supabase, breakers.serper, () => fetchSerper(safeKeywords, safeDateFrom, safeDateTo))
    }
    // BLL desativado — timeout 32s > global 25s
    // ,
    // {
    //   key: "bll",
    //   run: () => runWithCircuit(supabase, breakers.bll, () => fetchBll(safeKeywords, safeDateFrom, safeDateTo))
    // }
  ];

  try {
    const requestStartedAt = Date.now();
    /** @type {Array<PromiseSettledResult<any> | undefined>} */
    const partialSettled = new Array(sources.length);

    const trackedRuns = sources.map((source, index) =>
      source
        .run()
        .then((value) => {
          const result = { status: "fulfilled", value };
          partialSettled[index] = result;
          return value;
        })
        .catch((reason) => {
          const result = { status: "rejected", reason };
          partialSettled[index] = result;
          throw reason;
        })
    );

    const allSettledPromise = Promise.allSettled(trackedRuns);
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        const timeoutResults = sources.map((source, index) => {
          if (partialSettled[index]) {
            return partialSettled[index];
          }

          return {
            status: "rejected",
            reason: new Error(`global_timeout_${GLOBAL_SETTLED_TIMEOUT_MS}ms:${source.key}`)
          };
        });
        resolve(timeoutResults);
      }, GLOBAL_SETTLED_TIMEOUT_MS);
    });

    const settled = await Promise.race([allSettledPromise, timeoutPromise]);

    /** @type {Array<{title: string, url: string, organ: string, date: string | null, keywords: string[], source: string}>} */
    const normalizedFromFulfilled = [];
    const bySource = { pncp: 0, compras: 0, serper: 0, bll: 0 };
    const sourceErrors = {};

    settled.forEach((result, index) => {
      const sourceKey = sources[index].key;

      if (result.status === "fulfilled") {
        const rows = Array.isArray(result.value) ? result.value : [];
        const normalized = rows.map((row) => normalizeSourceRow(sourceKey, row));
        normalizedFromFulfilled.push(...normalized);
        bySource[sourceKey] = normalized.length;
        return;
      }

      bySource[sourceKey] = 0;
      sourceErrors[sourceKey] = String(result.reason?.message || result.reason || "unknown_error");
    });

    const sanitized = sanitizeRows(normalizedFromFulfilled);
    const elapsedMs = Date.now() - requestStartedAt;
    const remainingMs = Math.max(0, GLOBAL_SETTLED_TIMEOUT_MS - elapsedMs);

    if (remainingMs > 0) {
      await Promise.race([
        persistFulfilledRows(supabase, sanitized),
        new Promise((resolve) => setTimeout(resolve, remainingMs))
      ]);
    }

    return res.status(200).json({
      total: sanitized.length,
      bySource,
      summary: {
        total: sanitized.length,
        bySource: {
          pncp: bySource.pncp,
          compras: bySource.compras,
          serper: bySource.serper,
          bll: bySource.bll
        }
      },
      errors: sourceErrors
    });
  } catch (error) {
    console.error("[pncp-search-orchestrator]", error);
    return res.status(500).json({ error: String(error?.message || error || "internal_error") });
  }
}
