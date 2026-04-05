import { isDateWithinRange, logStructured, uniqBy, withRetry } from "./common.js";
import { z } from "zod";

const SOURCE = "pncp";
const PNCP_SEARCH_URL = "https://pncp.gov.br/api/search";
const PAGE_SIZE = 50;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * @typedef {Object} EditalItem
 * @property {string} titulo
 * @property {string} link
 * @property {string} orgao
 * @property {string} cnpj
 * @property {string | null} data
 * @property {string[]} chaves
 */

const pncpItemSchema = z.object({
  numeroControlePNCP: z.union([z.string(), z.number()]).optional().default("").transform((value) => String(value)),
  objetoCompra: z.string().optional().default(""),
  dataPublicacaoPncp: z.string().optional().default(""),
  orgaoEntidade: z.object({
    razaoSocial: z.string().optional().default(""),
    cnpj: z.string().optional().default("")
  }).optional().default({ razaoSocial: "" }),
  valorTotalEstimado: z.union([z.number(), z.string()]).nullable().optional().default(0),
  linkSistemaOrigem: z.string().optional().default(""),
  modalidadeNome: z.string().optional().default(""),
  situacaoCompraNome: z.string().optional().default("")
});

function getRequestTimeoutMs() {
  const fromEnv = Number(process.env.PNCP_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv);
  }

  return REQUEST_TIMEOUT_MS;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable_payload]";
  }
}

function normalizeIncomingItem(item) {
  const source = item && typeof item === "object" ? item : {};
  const orgaoEntidade = source.orgaoEntidade || source.orgao_entidade || {};
  const razaoSocial =
    orgaoEntidade.razaoSocial ??
    orgaoEntidade.razao_social ??
    source.orgao_nome ??
    source.unidadeOrgao?.nomeUnidade ??
    source.unidade_nome;
  const orgaoCnpj =
    orgaoEntidade.cnpj ??
    orgaoEntidade.cnpjBasico ??
    source.orgao_cnpj ??
    source.cnpj ??
    source.cnpjOrgaoEntidade;

  return {
    numeroControlePNCP: source.numeroControlePNCP ?? source.numero_controle_pncp,
    objetoCompra: source.objetoCompra ?? source.objeto_compra ?? source.description ?? source.title ?? source.objeto,
    dataPublicacaoPncp: source.dataPublicacaoPncp ?? source.data_publicacao_pncp ?? source.dataPublicacao,
    orgaoEntidade: {
      razaoSocial,
      cnpj: String(orgaoCnpj || "")
    },
    valorTotalEstimado: source.valorTotalEstimado ?? source.valor_total_estimado ?? source.valor_global ?? 0,
    linkSistemaOrigem:
      source.linkSistemaOrigem ??
      source.link_sistema_origem ??
      source.item_url ??
      source.linkProcessoEletronico ??
      source.url ??
      undefined,
    modalidadeNome: source.modalidadeNome ?? source.modalidade_nome ?? undefined,
    situacaoCompraNome: source.situacaoCompraNome ?? source.situacao_compra_nome ?? undefined
  };
}

function extractItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.itens)) {
    return payload.itens;
  }

  if (Array.isArray(payload?.items)) return payload.items;

  logStructured("warn", SOURCE, "unknown_payload_shape", {
    keys: Object.keys(payload ?? {})
  });

  return [];
}

function isValidRawPncpItem(item) {
  if (!item || typeof item !== "object") return false;
  return !!(
    (item.numero_controle_pncp || item.numeroControlePNCP) &&
    (item.description || item.title || item.objetoCompra || item.objeto_compra) &&
    (item.data_publicacao_pncp || item.dataPublicacaoPncp)
  );
}

function sanitizeCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 14 ? digits : "";
}

function parseControlIdParts(controlId) {
  const raw = String(controlId || "").trim();
  if (!raw) return null;

  const slashPattern = raw.match(/^(\d{14})-(\d+)-(\d+)\/(\d{4})$/);
  if (slashPattern) {
    return {
      cnpj: sanitizeCnpj(slashPattern[1]),
      ano: String(slashPattern[4] || "").replace(/\D/g, ""),
      sequencial: String(Number(String(slashPattern[3] || "").replace(/\D/g, "")) || "")
    };
  }

  const canonicalPattern = raw.match(/^(\d{14})-(\d{4})-(\d+)$/);
  if (canonicalPattern) {
    return {
      cnpj: sanitizeCnpj(canonicalPattern[1]),
      ano: String(canonicalPattern[2] || "").replace(/\D/g, ""),
      sequencial: String(Number(String(canonicalPattern[3] || "").replace(/\D/g, "")) || "")
    };
  }

  return null;
}

function resolvePncpUrl(item = {}) {
  const controlParts = parseControlIdParts(item.numeroControlePNCP);
  if (controlParts?.cnpj && controlParts?.ano && controlParts?.sequencial) {
    return `https://pncp.gov.br/app/editais/${controlParts.cnpj}/${controlParts.ano}/${controlParts.sequencial}`;
  }

  const path = item.item_url || item.linkSistemaOrigem || item.linkProcessoEletronico || item.url || "";
  if (!path) return "https://pncp.gov.br/app/editais?pagina=1";
  if (/^https?:\/\//i.test(path)) return path;
  return `https://pncp.gov.br${path}`;
}

function normalizeKeywordForQuery(keyword) {
  const normalized = String(keyword || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  return encodeURIComponent(normalized);
}

async function fetchByKeywordPage(keyword, page, pageSize, timeoutMs) {
  const encodedKeyword = normalizeKeywordForQuery(keyword);
  const query = new URLSearchParams({
    tipos_documento: "edital",
    status: "recebendo_proposta",
    pagina: String(page),
    tamanhoPagina: String(pageSize)
  });

  const url = `${PNCP_SEARCH_URL}?${query.toString()}&q=${encodedKeyword}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await globalThis.fetch(url, {
      headers: { "User-Agent": "Licita-E/1.0 (PNCP Adapter)" },
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`pncp_timeout_${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`pncp_http_${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  const rawItems = extractItems(payload).filter((item) => item && typeof item === "object");

  const items = rawItems
    .filter((item) => isValidRawPncpItem(item))
    .map((item) => normalizeIncomingItem(item))
    .map((item) => pncpItemSchema.parse(item));

  return items;
}

/**
 * @param {string} keyword
 * @param {string | Date | null} dateFrom
 * @param {string | Date | null} dateTo
 * @returns {Promise<EditalItem[]>}
 */
async function fetchByKeyword(keyword, dateFrom, dateTo) {
  const timeoutMs = getRequestTimeoutMs();
  const items = [];
  let page = 1;

  while (true) {
    const pageItems = await fetchByKeywordPage(keyword, page, PAGE_SIZE, timeoutMs);
    items.push(...pageItems);

    if (pageItems.length < PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return items
    .map((item) => {
      const date = item.dataPublicacaoPncp || null;
      return {
        titulo: item.objetoCompra || "Sem titulo",
        link: resolvePncpUrl(item),
        orgao: item.orgaoEntidade?.razaoSocial || "Orgao nao informado",
        cnpj: sanitizeCnpj(item.orgaoEntidade?.cnpj),
        data: date,
        chaves: [keyword]
      };
    })
    .filter((item) => isDateWithinRange(item.data, dateFrom, dateTo));
}

/**
 * Busca editais no PNCP com execucao resiliente.
 * @param {string[]} keywords
 * @param {string | Date | null} dateFrom
 * @param {string | Date | null} dateTo
 * @returns {Promise<EditalItem[]>}
 */
export async function fetch(keywords = [], dateFrom = null, dateTo = null) {
  const terms = Array.isArray(keywords) ? keywords.filter(Boolean).slice(0, 20) : [];
  if (terms.length === 0) {
    logStructured("warn", SOURCE, "empty_keywords", {});
    return [];
  }

  logStructured("info", SOURCE, "start", { terms: terms.length });

  const rows = [];
  const errors = [];

  for (const keyword of terms) {
    try {
      const byKeyword = await withRetry(() => fetchByKeyword(keyword, dateFrom, dateTo), {
        source: SOURCE,
        operationName: "fetch_by_keyword"
      });
      rows.push(...byKeyword);
    } catch (error) {
      const reason = String(error?.message || error);
      errors.push({ keyword, reason });
      logStructured("error", SOURCE, "keyword_failed", { keyword, reason });
    }
  }

  if (rows.length === 0 && errors.length > 0) {
    if (errors.length === 1) {
      throw new Error(`pncp_all_keywords_failed:1:${errors[0].reason}`);
    }

    throw new Error(`pncp_all_keywords_failed:${errors.length}`);
  }

  const deduped = uniqBy(rows, (item) => `${item.link}|${item.titulo}`);
  logStructured("info", SOURCE, "done", { total: deduped.length, failedKeywords: errors.length });
  return deduped;
}
