import { useEffect, useState } from "react";
import { getSupabaseClientOrThrow } from "../lib/supabaseClient";
import MainNav from "../components/MainNav";

const STORAGE_KEY = "licitae-settings-keywords";

export default function SettingsPage() {
  const [keywords, setKeywords] = useState("Processos Participativos, CLPI, Diagnostico Socioambiental");
  const [cnaes, setCnaes] = useState("7320-3/00, 7220-7/00");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      setKeywords(parsed.keywords || "");
      setCnaes(parsed.cnaes || "");
    }

    const supabase = getSupabaseClientOrThrow();
    supabase.auth.getUser().then(async ({ data }) => {
      const userId = data.user?.id;
      if (!userId) return;

      const { data: row } = await supabase
        .from("notifications")
        .select("email_notifications")
        .eq("user_id", userId)
        .maybeSingle();

      if (row?.email_notifications !== undefined) {
        setEmailNotifications(Boolean(row.email_notifications));
      }
    });
  }, []);

  async function handleSave(event) {
    event.preventDefault();
    setMessage("");

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        keywords,
        cnaes
      })
    );

    const supabase = getSupabaseClientOrThrow();
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;

    if (userId) {
      await supabase.from("notifications").upsert(
        [
          {
            user_id: userId,
            email_notifications: emailNotifications,
            channel: "email"
          }
        ],
        { onConflict: "user_id" }
      );
    }

    setMessage("Configuracoes salvas com sucesso.");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-sand via-[#FFFDFB] to-[#F2F8F9] px-6 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <MainNav />
      </div>
      <div className="mx-auto mt-6 max-w-4xl rounded-2xl border border-brand-brown/10 bg-white p-6 shadow-panel">
        <h1 className="font-heading text-3xl text-brand-brown">Configuracoes do Sistema</h1>
        <p className="mt-2 font-body text-brand-ink/75">Ajuste parametros de busca, CNAEs e preferencias de notificacao.</p>

        <form onSubmit={handleSave} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block font-body text-sm text-brand-ink">Palavras-chave monitoradas</span>
            <textarea
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
              className="min-h-24 w-full rounded-xl border border-brand-brown/20 px-4 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-body text-sm text-brand-ink">CNAEs da empresa</span>
            <input
              value={cnaes}
              onChange={(event) => setCnaes(event.target.value)}
              className="w-full rounded-xl border border-brand-brown/20 px-4 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
            />
          </label>

          <label className="flex items-center gap-2 font-body text-sm text-brand-ink">
            <input
              type="checkbox"
              checked={emailNotifications}
              onChange={(event) => setEmailNotifications(event.target.checked)}
            />
            Receber notificacoes por e-mail
          </label>

          <button className="rounded-xl bg-brand-cyan px-5 py-3 font-heading text-sm font-semibold uppercase tracking-wider text-white">
            Salvar configuracoes
          </button>
          {message && <p className="font-body text-sm text-emerald-700">{message}</p>}
        </form>
      </div>
    </main>
  );
}
