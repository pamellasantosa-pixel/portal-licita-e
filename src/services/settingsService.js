import { getSupabaseClientOrThrow } from "../lib/supabaseClient";

const SETTINGS_FALLBACK_KEY = "licitae_settings_fallback";

export async function loadSystemSettings() {
  const supabase = getSupabaseClientOrThrow();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const [filtersResult, cnaeResult, notificationResult] = await Promise.all([
    supabase.from("bid_filters").select("keyword").eq("is_active", true).order("created_at", { ascending: true }),
    supabase.from("company_cnae").select("cnae_code").eq("is_active", true).order("created_at", { ascending: true }),
    user ? supabase.from("notifications").select("email_notifications").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null })
  ]);

  const fallbackRaw = localStorage.getItem(SETTINGS_FALLBACK_KEY);
  const fallback = fallbackRaw ? JSON.parse(fallbackRaw) : {};

  if (filtersResult.error && filtersResult.error.code !== "42P01") throw new Error(filtersResult.error.message);
  if (cnaeResult.error && cnaeResult.error.code !== "42P01") throw new Error(cnaeResult.error.message);

  return {
    keywords: (filtersResult.data || []).map((row) => row.keyword).join(", ") || fallback.keywords || "",
    cnaes: (cnaeResult.data || []).map((row) => row.cnae_code).join(", ") || fallback.cnaes || "",
    emailNotifications: notificationResult?.data?.email_notifications ?? true,
    authEmail: user?.email || ""
  };
}

export async function getActiveKeywords() {
  const data = await loadSystemSettings();
  return data.keywords
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function getActiveCnaes() {
  const data = await loadSystemSettings();
  return data.cnaes
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function saveSystemSettings({ keywordsText, cnaesText, emailNotifications }) {
  const supabase = getSupabaseClientOrThrow();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Usuario nao autenticado.");
  }

  const keywords = keywordsText
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const cnaes = cnaesText
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const { error: clearFiltersError } = await supabase.from("bid_filters").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const filtersTableMissing = clearFiltersError?.code === "42P01";
  if (clearFiltersError && !filtersTableMissing) {
    throw new Error(`Falha ao limpar filtros. Execute o schema atualizado no Supabase (RLS): ${clearFiltersError.message}`);
  }

  const { error: clearCnaeError } = await supabase.from("company_cnae").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const cnaeTableMissing = clearCnaeError?.code === "42P01";
  if (clearCnaeError && !cnaeTableMissing) {
    throw new Error(`Falha ao limpar CNAEs: ${clearCnaeError.message}`);
  }

  if (keywords.length > 0 && !filtersTableMissing) {
    const { error: filtersError } = await supabase.from("bid_filters").insert(
      keywords.map((keyword) => ({
        keyword,
        is_active: true
      }))
    );
    if (filtersError && filtersError.code !== "42P01") {
      throw new Error(`Falha ao salvar palavras-chave. Execute o schema atualizado no Supabase: ${filtersError.message}`);
    }
  }

  if (cnaes.length > 0 && !cnaeTableMissing) {
    const { error: cnaeError } = await supabase.from("company_cnae").upsert(
      cnaes.map((cnae_code) => ({
        cnae_code,
        is_active: true
      })),
      { onConflict: "cnae_code" }
    );
    if (cnaeError && cnaeError.code !== "42P01") {
      throw new Error(`Falha ao salvar CNAEs: ${cnaeError.message}`);
    }
  }

  if (filtersTableMissing || cnaeTableMissing) {
    localStorage.setItem(
      SETTINGS_FALLBACK_KEY,
      JSON.stringify({
        keywords: keywordsText,
        cnaes: cnaesText
      })
    );
  }

  const { error: notificationError } = await supabase.from("notifications").upsert(
    [
      {
        user_id: user.id,
        email_notifications: emailNotifications,
        channel: "email"
      }
    ],
    { onConflict: "user_id" }
  );

  if (notificationError) throw new Error(`Falha ao salvar notificacoes: ${notificationError.message}`);
}
