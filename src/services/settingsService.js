import { getSupabaseClientOrThrow } from "../lib/supabaseClient";

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

  if (filtersResult.error) throw new Error(filtersResult.error.message);
  if (cnaeResult.error && cnaeResult.error.code !== "42P01") throw new Error(cnaeResult.error.message);

  return {
    keywords: (filtersResult.data || []).map((row) => row.keyword).join(", "),
    cnaes: (cnaeResult.data || []).map((row) => row.cnae_code).join(", "),
    emailNotifications: notificationResult?.data?.email_notifications ?? true
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

  await supabase.from("bid_filters").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("company_cnae").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  if (keywords.length > 0) {
    const { error: filtersError } = await supabase.from("bid_filters").insert(
      keywords.map((keyword) => ({
        keyword,
        is_active: true
      }))
    );
    if (filtersError) throw new Error(filtersError.message);
  }

  if (cnaes.length > 0) {
    const { error: cnaeError } = await supabase.from("company_cnae").upsert(
      cnaes.map((cnae_code) => ({
        cnae_code,
        is_active: true
      })),
      { onConflict: "cnae_code" }
    );
    if (cnaeError) throw new Error(cnaeError.message);
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

  if (notificationError) throw new Error(notificationError.message);
}
