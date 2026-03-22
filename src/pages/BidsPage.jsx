import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAllBids } from "../services/bidsService";
import { syncPncBids } from "../services/pncpService";
import MainNav from "../components/MainNav";
import { getActiveCnaes, getActiveKeywords } from "../services/settingsService";

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

export default function BidsPage() {
  const [bids, setBids] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [period, setPeriod] = useState("todos");
  const [keywordFilter, setKeywordFilter] = useState("todos");
  const [cnaeFilter, setCnaeFilter] = useState("todos");
  const [availableKeywords, setAvailableKeywords] = useState([]);
  const [availableCnaes, setAvailableCnaes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);

  async function loadBids() {
    try {
      setIsLoading(true);
      setError("");
      const data = await getAllBids();
      setBids(data);
    } catch (err) {
      setError(err.message || "Falha ao carregar editais.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadBids();
    getActiveKeywords().then(setAvailableKeywords).catch(() => setAvailableKeywords([]));
    getActiveCnaes().then(setAvailableCnaes).catch(() => setAvailableCnaes([]));
  }, []);

  async function handleSync() {
    try {
      setIsSyncing(true);
      setWarnings([]);
      setError("");
      const customKeywords = await getActiveKeywords().catch(() => []);
      const result = await syncPncBids(customKeywords);
      if (result.warnings?.length) {
        setWarnings(result.warnings);
      }
      await loadBids();
    } catch (err) {
      setError(err.message || "Falha ao sincronizar editais.");
    } finally {
      setIsSyncing(false);
    }
  }

  const filtered = useMemo(() => {
    return bids.filter((item) => {
      const baseText = `${item.title} ${item.description || ""} ${item.organization_name || ""}`.toLowerCase();
      const matchesSearch = baseText.includes(search.toLowerCase());
      const matchesStatus = status === "todos" || item.status === status;
      const matchesKeyword = keywordFilter === "todos" || baseText.includes(keywordFilter.toLowerCase());
      const matchesCnae = cnaeFilter === "todos" || baseText.includes(cnaeFilter.toLowerCase());

      let matchesPeriod = true;
      if (period !== "todos") {
        const days = period === "7dias" ? 7 : 30;
        const from = new Date();
        from.setDate(from.getDate() - days);
        matchesPeriod = new Date(item.published_date) >= from;
      }

      return matchesSearch && matchesStatus && matchesPeriod && matchesKeyword && matchesCnae;
    });
  }, [bids, search, status, period, keywordFilter, cnaeFilter]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-sand via-[#FFFDFB] to-[#F2F8F9] px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <MainNav />
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-body text-sm uppercase tracking-[0.25em] text-brand-cyan">Explorar Editais</p>
            <h1 className="font-heading text-3xl text-brand-brown md:text-4xl">Base de oportunidades capturadas</h1>
          </div>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="rounded-xl bg-brand-cyan px-5 py-3 font-heading text-sm font-semibold uppercase tracking-wider text-white transition hover:brightness-95 disabled:opacity-60"
          >
            {isSyncing ? "Sincronizando..." : "Sincronizar Agora"}
          </button>
        </header>

        <section className="grid gap-3 rounded-2xl border border-brand-brown/10 bg-white p-4 shadow-panel md:grid-cols-2 lg:grid-cols-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por titulo, orgao ou palavra-chave"
            className="w-full rounded-xl border border-brand-brown/20 px-4 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-brand-brown/20 px-3 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
          >
            <option value="todos">Todos os status</option>
            <option value="em_analise">Em analise</option>
            <option value="favoritado">Favoritado</option>
            <option value="rejeitado">Rejeitado</option>
          </select>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="rounded-xl border border-brand-brown/20 px-3 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
          >
            <option value="todos">Periodo: todos</option>
            <option value="7dias">Periodo: ultimos 7 dias</option>
            <option value="30dias">Periodo: ultimos 30 dias</option>
          </select>
          <select
            value={keywordFilter}
            onChange={(event) => setKeywordFilter(event.target.value)}
            className="rounded-xl border border-brand-brown/20 px-3 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
          >
            <option value="todos">Keyword: todas</option>
            {availableKeywords.map((keyword) => (
              <option key={keyword} value={keyword}>
                {keyword}
              </option>
            ))}
          </select>
          <select
            value={cnaeFilter}
            onChange={(event) => setCnaeFilter(event.target.value)}
            className="rounded-xl border border-brand-brown/20 px-3 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
          >
            <option value="todos">CNAE: todos</option>
            {availableCnaes.map((cnae) => (
              <option key={cnae} value={cnae}>
                {cnae}
              </option>
            ))}
          </select>
        </section>

        <section className="rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-panel">
          {error && <p className="mb-3 font-body text-sm text-red-700">{error}</p>}
          {warnings.length > 0 && (
            <p className="mb-3 font-body text-sm text-amber-700">
              Sincronizacao parcial: {warnings.length} termos ficaram indisponiveis no PNCP.
            </p>
          )}

          {isLoading && <p className="font-body text-brand-ink/80">Carregando editais...</p>}

          {!isLoading && filtered.length === 0 && (
            <p className="font-body text-brand-ink/80">Nenhum edital encontrado para o filtro informado.</p>
          )}

          {!isLoading && filtered.length > 0 && (
            <ul className="space-y-3">
              {filtered.map((bid) => (
                <li key={bid.id} className="rounded-xl border border-brand-brown/10 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="font-heading text-lg text-brand-brown">{bid.title}</h3>
                      <p className="font-body text-sm text-brand-ink/80">{bid.organization_name || "Orgao nao informado"}</p>
                      <p className="mt-1 font-body text-xs text-brand-ink/60">
                        Publicado: {formatDate(bid.published_date)} | Encerramento: {formatDate(bid.closing_date)}
                      </p>
                    </div>
                    <Link
                      to={`/bids/${bid.id}`}
                      className="rounded-lg bg-brand-cyan px-4 py-2 text-center font-heading text-xs font-semibold uppercase tracking-wider text-white"
                    >
                      Ver Detalhes
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
