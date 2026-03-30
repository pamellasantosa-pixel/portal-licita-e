import { getSupabaseClientOrThrow } from "../lib/supabaseClient";

export async function getTodayBids() {
  const supabase = getSupabaseClientOrThrow();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const { data, error } = await supabase
    .from("bids")
    .select("id,title,published_date,status,is_favorite,organization_name,orgao_cnpj")
    .gte("published_date", todayStart.toISOString())
    .lt("published_date", todayEnd.toISOString())
    .order("published_date", { ascending: false });

  if (error) {
    throw new Error(`Erro ao carregar bids: ${error.message}`);
  }

  return data ?? [];
}

export async function getRelevantBids() {
  const supabase = getSupabaseClientOrThrow();

  const selectFields =
    "id,title,description,published_date,status,is_favorite,is_rejected,organization_name,orgao_nome,orgao_cnpj,source_url,aderencia_score,alta_aderencia";

  const { data, error } = await supabase
    .from("bids")
    .select(selectFields)
    .gt("aderencia_score", 0)
    .order("published_date", { ascending: false })
    .limit(300);

  if (error) {
    throw new Error(`Erro ao carregar bids relevantes: ${error.message}`);
  }

  return data ?? [];
}

export async function getAllBids() {
  const supabase = getSupabaseClientOrThrow();

  // Primeiro tenta ler schema estendido (aderencia/valor). Se o banco ainda nao foi migrado,
  // cai automaticamente para o schema basico sem quebrar a aplicacao.
  const extendedSelect =
    "id,title,description,published_date,closing_date,status,is_favorite,is_rejected,organization_name,orgao_nome,municipio_orgao,orgao_cnpj,edital_ano,edital_sequencial,source_url,pncp_id,modality,aderencia_score,alta_aderencia,valor_estimado,is_link_valid,link_http_status,link_checked_at,source_system,source_priority,score_esa,ia_relevance_status,pdf_text_length,pdf_terms_found";

  const basicSelect =
    "id,title,description,published_date,closing_date,status,is_favorite,is_rejected,organization_name,municipio_orgao,orgao_cnpj,edital_ano,edital_sequencial,source_url,pncp_id,modality,is_link_valid";

  const extended = await supabase.from("bids").select(extendedSelect).order("published_date", { ascending: false }).limit(150);

  if (!extended.error) {
    return extended.data ?? [];
  }

  const basic = await supabase.from("bids").select(basicSelect).order("published_date", { ascending: false }).limit(150);

  if (basic.error) {
    throw new Error(`Erro ao carregar lista de bids: ${basic.error.message}`);
  }

  return (basic.data || []).map((item) => ({
    ...item,
    orgao_nome: item.organization_name,
    municipio_orgao: item.municipio_orgao || null,
    orgao_cnpj: item.orgao_cnpj || null,
    edital_ano: item.edital_ano || null,
    edital_sequencial: item.edital_sequencial || null,
    aderencia_score: null,
    alta_aderencia: null,
    valor_estimado: null,
    is_link_valid: item.is_link_valid ?? null,
    source_system: null,
    source_priority: null,
    score_esa: null,
    ia_relevance_status: null,
    pdf_text_length: null,
    pdf_terms_found: []
  }));
}

export async function getBidById(id) {
  const supabase = getSupabaseClientOrThrow();

  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(`Erro ao carregar bid: ${error.message}`);
  }

  return data;
}

export async function updateBidStatus(id, patch) {
  const supabase = getSupabaseClientOrThrow();

  const { error } = await supabase.from("bids").update(patch).eq("id", id);

  if (error) {
    throw new Error(`Erro ao atualizar bid: ${error.message}`);
  }
}
