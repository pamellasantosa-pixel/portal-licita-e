import { useEffect, useState } from "react";
import MainNav from "../components/MainNav";
import { loadSystemSettings, saveSystemSettings } from "../services/settingsService";

export default function SettingsPage() {
  const [keywords, setKeywords] = useState("Processos Participativos, CLPI, Diagnostico Socioambiental");
  const [cnaes, setCnaes] = useState("7320-3/00, 7220-7/00");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSystemSettings()
      .then((data) => {
        if (data.keywords) setKeywords(data.keywords);
        if (data.cnaes) setCnaes(data.cnaes);
        setEmailNotifications(Boolean(data.emailNotifications));
      })
      .catch((err) => {
        setError(err.message || "Falha ao carregar configuracoes.");
      });
  }, []);

  async function handleSave(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSaving(true);

    try {
      await saveSystemSettings({
        keywordsText: keywords,
        cnaesText: cnaes,
        emailNotifications
      });
      setMessage("Configuracoes salvas com sucesso.");
    } catch (err) {
      setError(err.message || "Falha ao salvar configuracoes.");
    } finally {
      setIsSaving(false);
    }
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

          <button
            disabled={isSaving}
            className="rounded-xl bg-brand-cyan px-5 py-3 font-heading text-sm font-semibold uppercase tracking-wider text-white disabled:opacity-60"
          >
            {isSaving ? "Salvando..." : "Salvar configuracoes"}
          </button>
          {message && <p className="font-body text-sm text-emerald-700">{message}</p>}
          {error && <p className="font-body text-sm text-red-700">{error}</p>}
        </form>
      </div>
    </main>
  );
}
