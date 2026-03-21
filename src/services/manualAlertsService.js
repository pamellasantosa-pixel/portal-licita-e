import { getSupabaseClientOrThrow } from "../lib/supabaseClient";

export async function getManualAlerts() {
  const supabase = getSupabaseClientOrThrow();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("manual_alerts")
    .select("id,event_date,description,created_at")
    .eq("user_id", user.id)
    .order("event_date", { ascending: true });

  if (error) {
    if (error.code === "42P01") {
      return [];
    }
    throw new Error(`Erro ao carregar alertas manuais: ${error.message}`);
  }

  return data || [];
}

export async function createManualAlert({ eventDate, description }) {
  const supabase = getSupabaseClientOrThrow();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Usuario nao autenticado.");
  }

  const { error } = await supabase.from("manual_alerts").insert([
    {
      user_id: user.id,
      event_date: eventDate,
      description
    }
  ]);

  if (error) {
    throw new Error(`Erro ao criar alerta manual: ${error.message}`);
  }
}

export async function deleteManualAlert(id) {
  const supabase = getSupabaseClientOrThrow();
  const { error } = await supabase.from("manual_alerts").delete().eq("id", id);
  if (error) {
    throw new Error(`Erro ao remover alerta manual: ${error.message}`);
  }
}
