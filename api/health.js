import { createClient } from "@supabase/supabase-js";
import { loadSourceHealthMap } from "../server/lib/circuit-breaker.js";

const DEFAULT_SOURCES = ["pncp", "compras", "google", "bll"];

/**
 * @param {import("http").IncomingMessage & { method?: string }} req
 * @param {{ status: (code: number) => { json: (body: any) => any } }} res
 * @returns {Promise<any>}
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const healthMap = await loadSourceHealthMap(supabase);

    const sources = DEFAULT_SOURCES.map((name) => {
      const row = healthMap[name] || null;
      return {
        sourceName: name,
        status: String(row?.status || "CLOSED"),
        failureCount: Number(row?.failure_count || 0),
        lastFailureAt: row?.last_failure_at || null,
        lastSuccessAt: row?.last_success_at || null
      };
    });

    return res.status(200).json({ sources });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error || "internal_error") });
  }
}
