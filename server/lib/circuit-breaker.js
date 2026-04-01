export const CIRCUIT_STATE = {
  CLOSED: "CLOSED",
  OPEN: "OPEN",
  HALF_OPEN: "HALF_OPEN"
};

const DEFAULT_CONFIG = {
  failureThreshold: 3,
  timeout: 60_000
};

function ensureConfig(config) {
  const name = String(config?.name || "").trim();
  if (!name) {
    throw new Error("circuit_breaker_name_required");
  }

  const failureThreshold = Number(config?.failureThreshold || DEFAULT_CONFIG.failureThreshold);
  const timeout = Number(config?.timeout || DEFAULT_CONFIG.timeout);

  return {
    name,
    failureThreshold: Number.isFinite(failureThreshold) && failureThreshold > 0 ? Math.floor(failureThreshold) : DEFAULT_CONFIG.failureThreshold,
    timeout: Number.isFinite(timeout) && timeout > 0 ? Math.floor(timeout) : DEFAULT_CONFIG.timeout
  };
}

function mapDbStatus(status) {
  const value = String(status || "").toUpperCase();
  if (value === CIRCUIT_STATE.OPEN || value === CIRCUIT_STATE.HALF_OPEN) {
    return value;
  }

  return CIRCUIT_STATE.CLOSED;
}

/**
 * @typedef {Object} CircuitState
 * @property {"CLOSED"|"OPEN"|"HALF_OPEN"} status
 * @property {number} failureCount
 * @property {string | null} lastFailureAt
 * @property {string | null} lastSuccessAt
 */

export class CircuitBreaker {
  /**
   * @param {{name: string, failureThreshold?: number, timeout?: number}} config
   * @param {{status?: string, failure_count?: number, last_failure_at?: string | null, last_success_at?: string | null} | null} [initialState]
   */
  constructor(config, initialState = null) {
    this.config = ensureConfig(config);
    this.state = {
      status: mapDbStatus(initialState?.status),
      failureCount: Number(initialState?.failure_count || 0),
      lastFailureAt: initialState?.last_failure_at || null,
      lastSuccessAt: initialState?.last_success_at || null
    };
  }

  toRecord() {
    return {
      source_name: this.config.name,
      status: this.state.status,
      failure_count: this.state.failureCount,
      last_failure_at: this.state.lastFailureAt,
      last_success_at: this.state.lastSuccessAt
    };
  }

  isOpenAndBlocked(nowMs = Date.now()) {
    if (this.state.status !== CIRCUIT_STATE.OPEN) return false;

    const lastFailureMs = this.state.lastFailureAt ? Date.parse(this.state.lastFailureAt) : 0;
    if (!Number.isFinite(lastFailureMs) || lastFailureMs <= 0) {
      return true;
    }

    if (nowMs - lastFailureMs >= this.config.timeout) {
      this.state.status = CIRCUIT_STATE.HALF_OPEN;
      return false;
    }

    return true;
  }

  markSuccess(nowIso = new Date().toISOString()) {
    this.state.status = CIRCUIT_STATE.CLOSED;
    this.state.failureCount = 0;
    this.state.lastSuccessAt = nowIso;
  }

  markFailure(nowIso = new Date().toISOString()) {
    this.state.failureCount += 1;
    this.state.lastFailureAt = nowIso;

    if (this.state.status === CIRCUIT_STATE.HALF_OPEN || this.state.failureCount >= this.config.failureThreshold) {
      this.state.status = CIRCUIT_STATE.OPEN;
      return;
    }

    this.state.status = CIRCUIT_STATE.CLOSED;
  }

  /**
   * @template T
   * @param {() => Promise<T>} operation
   * @returns {Promise<T>}
   */
  async execute(operation) {
    if (this.isOpenAndBlocked()) {
      throw new Error(`circuit_open:${this.config.name}`);
    }

    try {
      const result = await operation();
      this.markSuccess();
      return result;
    } catch (error) {
      this.markFailure();
      throw error;
    }
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @returns {Promise<Record<string, {status: string, failure_count: number, last_failure_at: string | null, last_success_at: string | null}>>}
 */
export async function loadSourceHealthMap(supabase) {
  const { data, error } = await supabase
    .from("source_health")
    .select("source_name,status,failure_count,last_failure_at,last_success_at");

  if (error) {
    throw new Error(error.message || "failed_to_load_source_health");
  }

  const output = {};
  for (const row of data || []) {
    const key = String(row.source_name || "").trim();
    if (!key) continue;
    output[key] = row;
  }

  return output;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {CircuitBreaker} breaker
 * @returns {Promise<void>}
 */
export async function persistCircuitState(supabase, breaker) {
  const { error } = await supabase.from("source_health").upsert(breaker.toRecord(), {
    onConflict: "source_name"
  });

  if (error) {
    throw new Error(error.message || "failed_to_persist_source_health");
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Array<{name: string, failureThreshold?: number, timeout?: number}>} configs
 * @returns {Promise<Record<string, CircuitBreaker>>}
 */
export async function createCircuitBreakers(supabase, configs) {
  const loadedState = await loadSourceHealthMap(supabase);
  const output = {};

  for (const config of configs) {
    output[config.name] = new CircuitBreaker(config, loadedState[config.name] || null);
  }

  return output;
}
