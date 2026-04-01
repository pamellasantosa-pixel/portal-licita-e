const RETRY_BASE_DELAY_MS = 350;
const RETRY_MAX_ATTEMPTS = 3;

/**
 * Produz logs estruturados em JSON para facilitar rastreabilidade entre fontes.
 * @param {"info"|"warn"|"error"} level
 * @param {string} source
 * @param {string} event
 * @param {Record<string, unknown>} [meta]
 */
export function logStructured(level, source, event, meta = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    source,
    event,
    ...meta
  };

  const serialized = JSON.stringify(payload);
  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}

/**
 * Executa uma operacao assincrona com retry e backoff exponencial.
 * @template T
 * @param {() => Promise<T>} operation
 * @param {{source: string, operationName: string, maxAttempts?: number, baseDelayMs?: number}} options
 * @returns {Promise<T>}
 */
export async function withRetry(operation, options) {
  const maxAttempts = options.maxAttempts || RETRY_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs || RETRY_BASE_DELAY_MS;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (attempt > 1) {
        logStructured("warn", options.source, "retry_attempt", {
          operation: options.operationName,
          attempt,
          maxAttempts
        });
      }

      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts) {
        break;
      }

      const delayMs = baseDelayMs * (2 ** (attempt - 1));
      await sleep(delayMs);
    }
  }

  throw lastError || new Error(`${options.source}:${options.operationName}:unknown_error`);
}

/**
 * Aplica filtro de intervalo de datas quando a origem fornece data parseavel.
 * @param {string | Date | null | undefined} value
 * @param {string | Date | null | undefined} dateFrom
 * @param {string | Date | null | undefined} dateTo
 * @returns {boolean}
 */
export function isDateWithinRange(value, dateFrom, dateTo) {
  if (!value) return true;

  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return true;

  if (dateFrom) {
    const from = new Date(dateFrom);
    if (!Number.isNaN(from.getTime()) && target.getTime() < from.getTime()) {
      return false;
    }
  }

  if (dateTo) {
    const to = new Date(dateTo);
    if (!Number.isNaN(to.getTime()) && target.getTime() > to.getTime()) {
      return false;
    }
  }

  return true;
}

/**
 * Remove duplicidades por chave de string.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} keyBuilder
 * @returns {T[]}
 */
export function uniqBy(items, keyBuilder) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = keyBuilder(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}

/**
 * Normaliza texto para comparacoes sem acento e case-insensitive.
 * @param {string} value
 * @returns {string}
 */
export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Aguarda a quantidade de milissegundos informada.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
