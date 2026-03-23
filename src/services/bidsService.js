import { getSupabaseClientOrThrow } from "../lib/supabaseClient";

export async function getTodayBids() {
  const supabase = getSupabaseClientOrThrow();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const { data, error } = await supabase
    .from("bids")
    .select("id,title,published_date,status,is_favorite,organization_name")
    .gte("published_date", todayStart.toISOString())
    .lt("published_date", todayEnd.toISOString())
    .order("published_date", { ascending: false });

  if (error) {
    throw new Error(`Erro ao carregar bids: ${error.message}`);
  }

  return data ?? [];
}

export async function getAllBids() {
  const supabase = getSupabaseClientOrThrow();

  // Primeiro tenta ler schema estendido (aderencia/valor). Se o banco ainda nao foi migrado,
  // cai automaticamente para o schema basico sem quebrar a aplicacao.
  const extendedSelect =
    "id,title,description,published_date,closing_date,status,is_favorite,is_rejected,organization_name,orgao_nome,source_url,pncp_id,modality,aderencia_score,alta_aderencia,valor_estimado";

  const basicSelect =
    "id,title,description,published_date,closing_date,status,is_favorite,is_rejected,organization_name,source_url,pncp_id,modality";

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
    aderencia_score: null,
    alta_aderencia: null,
    valor_estimado: null
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
