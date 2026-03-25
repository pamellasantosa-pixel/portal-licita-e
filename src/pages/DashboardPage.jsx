import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getTodayBids } from "../services/bidsService";
import { syncPncBids } from "../services/pncpService";
import { getSupabaseClientOrThrow } from "../lib/supabaseClient";
import MainNav from "../components/MainNav";
import { getActiveKeywords } from "../services/settingsService";
import { evaluateEsaScore } from "../lib/esaScoring";
import ScoreReasonBadge from "../components/ScoreReasonBadge";

const AUTO_SYNC_KEY = "licitae_dashboard_last_auto_sync";
const AUTO_SYNC_INTERVAL_MS = 1000 * 60 * 60 * 3; // 3 horas

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
  const [period, setPeriod] = useState("hoje");
  const [category, setCategory] = useState("todas");

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        setError("");
        setWarnings([]);
        const data = await getTodayBids();
        setBids(data);

        const lastSync = Number(localStorage.getItem(AUTO_SYNC_KEY) || "0");
        const shouldAutoSync = !lastSync || Date.now() - lastSync > AUTO_SYNC_INTERVAL_MS || data.length === 0;

        if (shouldAutoSync) {
          setIsSyncing(true);
          const customKeywords = await getActiveKeywords().catch(() => []);
          const result = await syncPncBids(customKeywords);
          if (result.warnings?.length) {
            setWarnings(result.warnings);
          }
          localStorage.setItem(AUTO_SYNC_KEY, String(Date.now()));
          const updated = await getTodayBids();
          setBids(updated);
        }
      } catch (err) {
        setError(err.message || "Falha ao carregar editais de hoje.");
      } finally {
        setIsSyncing(false);
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
      const customKeywords = await getActiveKeywords().catch(() => []);
      const result = await syncPncBids(customKeywords);
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

  const filteredBids = useMemo(() => {
    let result = [...bids];

    if (period !== "hoje") {
      const days = period === "7dias" ? 7 : 30;
      const start = new Date();
      start.setDate(start.getDate() - days);
      result = result.filter((item) => new Date(item.published_date) >= start);
    }

    if (category !== "todas") {
      result = result.filter((item) => item.status === category);
    }

    return result;
  }, [bids, period, category]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-sand via-[#FFFDFB] to-[#F2F8F9] px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <MainNav />
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
            <p className="font-body text-sm text-brand-ink/70">Oportunidades Estrategicas ESA</p>
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

        <section className="grid gap-3 rounded-2xl border border-brand-brown/10 bg-white p-4 shadow-panel md:grid-cols-2">
          <label className="font-body text-sm text-brand-ink">
            Periodo
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="mt-1 w-full rounded-xl border border-brand-brown/20 px-3 py-2"
            >
              <option value="hoje">Hoje</option>
              <option value="7dias">Ultimos 7 dias</option>
              <option value="30dias">Ultimos 30 dias</option>
            </select>
          </label>
          <label className="font-body text-sm text-brand-ink">
            Categoria
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-1 w-full rounded-xl border border-brand-brown/20 px-3 py-2"
            >
              <option value="todas">Todas</option>
              <option value="em_analise">Em analise</option>
              <option value="favoritado">Favoritadas</option>
              <option value="rejeitado">Rejeitadas</option>
            </select>
          </label>
        </section>

        <section className="rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-panel">
          {isLoading && <p className="font-body text-brand-ink/80">Carregando editais...</p>}
          {error && <p className="font-body text-sm text-red-700">{error}</p>}
          {warnings.length > 0 && (
            <p className="mb-3 font-body text-sm text-amber-700">
              Sincronizacao parcial: {warnings.length} palavras-chave indisponiveis temporariamente no PNCP.
            </p>
          )}

          {!isLoading && !error && filteredBids.length === 0 && (
            <p className="font-body text-brand-ink/80">Nenhum edital novo encontrado para hoje.</p>
          )}

          {!isLoading && filteredBids.length > 0 && (
            <ul className="space-y-4">
              {filteredBids.map((bid) => (
                <li key={bid.id} className="rounded-xl border border-brand-brown/10 p-4 transition hover:bg-brand-sand/40">
                  {(() => {
                    const evaluation = evaluateEsaScore(`${bid.title || ""} ${bid.description || ""}`, {
                      organizationName: bid.organization_name || bid.orgao_nome || ""
                    });
                    return <ScoreReasonBadge reason={evaluation.reason} evaluation={evaluation} />;
                  })()}
                  <h3 className="font-heading text-lg text-brand-brown">{bid.title}</h3>
                  <p className="mt-1 font-body text-sm text-brand-ink/80">{bid.organization_name || "Orgao nao informado"}</p>
                  {bid.orgao_cnpj && <p className="mt-1 font-body text-xs text-brand-ink/65">CNPJ: {bid.orgao_cnpj}</p>}
                  <p className="mt-1 font-body text-xs text-brand-ink/60">Publicado em: {dateToBrazilian(bid.published_date)}</p>
                  <Link to={`/bids/${bid.id}`} className="mt-2 inline-block font-body text-xs text-brand-cyan underline underline-offset-4">
                    Abrir detalhes do edital
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
