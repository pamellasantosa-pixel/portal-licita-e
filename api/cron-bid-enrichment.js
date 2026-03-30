import { createClient } from "@supabase/supabase-js";
import { validateDocumentLink } from "./_shared/link-validation.js";

const ASYNC_EXSA_TERMS = ["socioambiental", "quilombola", "indigena", "clpi", "consulta previa", "diagnostico"];

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function evaluateAsyncRelevance(text = "") {
  const normalized = normalizeText(text);
  const matched = ASYNC_EXSA_TERMS.filter((term) => normalized.includes(term));
  const score = Math.min(10, matched.length * 3);
  const status = matched.length > 0 ? "relevante" : "baixa_relevancia";
  return { score, status, matched };
}

export default async function handler(req, res) {
  const authHeader = req.headers["authorization"] || "";
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const limit = Math.max(1, Math.min(Number(req.query?.limit || 80), 300));
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: pendingRows, error: fetchError } = await supabase
      .from("bids")
      .select("id,title,description,objeto_descricao,source_url,link_edital,score_esa,ia_relevance_status")
      .or("link_checked_at.is.null,link_validation_error.eq.pending_async_validation,ia_relevance_status.is.null")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    const rows = pendingRows || [];
    let processed = 0;
    let linkValidated = 0;

    for (const row of rows) {
      const link = row.source_url || row.link_edital || "";
      const linkResult = link
        ? await validateDocumentLink(link, { timeoutMs: 9000 })
        : { isValid: false, statusCode: null, error: "missing_url" };

      const relevance = evaluateAsyncRelevance(`${row.objeto_descricao || ""} ${row.description || ""} ${row.title || ""}`);
      const nextScore = Math.max(Number(row.score_esa || 0), relevance.score);

      const updatePayload = {
        is_link_valid: linkResult.isValid,
        link_http_status: linkResult.statusCode || null,
        link_validation_error: linkResult.error || null,
        link_checked_at: new Date().toISOString(),
        score_esa: nextScore,
        ia_relevance_status: relevance.status,
        pdf_terms_found: relevance.matched
      };

      const { error: updateError } = await supabase.from("bids").update(updatePayload).eq("id", row.id);
      if (updateError) {
        continue;
      }

      processed += 1;
      if (link) linkValidated += 1;
    }

    return res.status(200).json({
      fetched: rows.length,
      processed,
      linkValidated,
      skipped: rows.length - processed
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Falha no cron de enrichment" });
  }
}
