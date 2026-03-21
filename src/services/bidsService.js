import { supabase } from "../lib/supabaseClient";

export async function getTodayBids() {
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
