import { useEffect, useMemo, useState } from "react";
import { getTodayBids } from "../services/bidsService";
import { syncPncBids } from "../services/pncpService";
import { getSupabaseClientOrThrow } from "../lib/supabaseClient";

function dateToBrazilian(dateLike) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(dateLike));
}

export default function DashboardPage() {
  const [bids, setBids] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        setError("");
        setWarnings([]);
        const data = await getTodayBids();
        setBids(data);
      } catch (err) {
        setError(err.message || "Falha ao carregar editais de hoje.");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const stats = useMemo(() => {
    const total = bids.length;
    const emAnalise = bids.filter((item) => item.status === "em_analise").length;
    const favoritados = bids.filter((item) => item.is_favorite).length;

    return { total, emAnalise, favoritados };
  }, [bids]);

  async function handleSync() {
    try {
      setIsSyncing(true);
      setError("");
      setWarnings([]);
      const result = await syncPncBids();
      if (result.warnings?.length) {
        setWarnings(result.warnings);
      }
      const data = await getTodayBids();
      setBids(data);
    } catch (err) {
      setError(err.message || "Nao foi possivel sincronizar com o PNCP.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleSignOut() {
    const supabase = getSupabaseClientOrThrow();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-sand via-[#FFFDFB] to-[#F2F8F9] px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-body text-sm uppercase tracking-[0.25em] text-brand-cyan">Dashboard</p>
            <h1 className="font-heading text-3xl text-brand-brown md:text-4xl">Novos editais encontrados hoje</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="rounded-xl bg-brand-cyan px-5 py-3 font-heading text-sm font-semibold uppercase tracking-wider text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSyncing ? "Sincronizando..." : "Sincronizar Agora"}
            </button>
            <button
              onClick={handleSignOut}
              className="rounded-xl border border-brand-brown/20 bg-white px-5 py-3 font-heading text-sm font-semibold uppercase tracking-wider text-brand-brown transition hover:bg-brand-sand"
            >
              Sair
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-panel">
            <p className="font-body text-sm text-brand-ink/70">Licitacoes de hoje</p>
            <p className="font-heading text-3xl text-brand-brown">{stats.total}</p>
          </article>
          <article className="rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-panel">
            <p className="font-body text-sm text-brand-ink/70">Em analise tecnica</p>
            <p className="font-heading text-3xl text-brand-brown">{stats.emAnalise}</p>
          </article>
          <article className="rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-panel">
            <p className="font-body text-sm text-brand-ink/70">Favoritados</p>
            <p className="font-heading text-3xl text-brand-brown">{stats.favoritados}</p>
          </article>
        </section>

        <section className="rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-panel">
          {isLoading && <p className="font-body text-brand-ink/80">Carregando editais...</p>}
          {error && <p className="font-body text-sm text-red-700">{error}</p>}
          {warnings.length > 0 && (
            <p className="mb-3 font-body text-sm text-amber-700">
              Sincronizacao parcial: {warnings.length} palavras-chave indisponiveis temporariamente no PNCP.
            </p>
          )}

          {!isLoading && !error && bids.length === 0 && (
            <p className="font-body text-brand-ink/80">Nenhum edital novo encontrado para hoje.</p>
          )}

          {!isLoading && bids.length > 0 && (
            <ul className="space-y-4">
              {bids.map((bid) => (
                <li key={bid.id} className="rounded-xl border border-brand-brown/10 p-4">
                  <h3 className="font-heading text-lg text-brand-brown">{bid.title}</h3>
                  <p className="mt-1 font-body text-sm text-brand-ink/80">{bid.organization_name || "Orgao nao informado"}</p>
                  <p className="mt-1 font-body text-xs text-brand-ink/60">Publicado em: {dateToBrazilian(bid.published_date)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
