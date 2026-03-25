import { useEffect, useMemo, useState } from "react";
import { syncPncBids } from "../services/pncpService";
import MainNav from "../components/MainNav";
import { getActiveCnaes, getActiveKeywords } from "../services/settingsService";
import { getSupabaseClientOrThrow } from "../lib/supabaseClient";
import {
  cleanOrganName,
  evaluateEsaScore,
  extractScoreSearchTerm,
  isAbsoluteVeto,
  isPriorityFederalOrg,
  sanitizeOrgNameForPncpSearch,
  sanitizeCnpj
} from "../lib/esaScoring";
import ScoreReasonBadge from "../components/ScoreReasonBadge";

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

function formatCurrencyBRL(value) {
  if (value == null || value === "") return "Valor nao informado";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "Valor nao informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numeric);
}

function buildPncpUrlByOrgName(orgName, scoreReason = "sem_termo", scoreEvaluation = {}) {
  const orgTerm = sanitizeOrgNameForPncpSearch(cleanOrganName(orgName));
  const scoreTerm = String(extractScoreSearchTerm(scoreReason, scoreEvaluation) || "")
    .replace(/^"|"$/g, "")
    .trim();
  const formattedScoreTerm = scoreTerm ? `"${scoreTerm}"` : "";

  const normalizedOrg = String(orgTerm || "").toLowerCase();
  const normalizedScore = String(scoreTerm || "").toLowerCase();
  if (normalizedOrg.includes("aracaju") && normalizedScore.includes("quilombola")) {
    const specialFallback = `"quilombola" aracaju`;
    return `https://pncp.gov.br/app/editais?q=${encodeURIComponent(specialFallback)}`;
  }

  const combined = [orgTerm, formattedScoreTerm].filter(Boolean).join(" ").trim();
  if (!combined) return "https://pncp.gov.br/app/editais?pagina=1";
  return `https://pncp.gov.br/app/editais?q=${encodeURIComponent(combined)}`;
}

function buildPncpUrlByCnpj(bid) {
  const reason = bid?.score_reason || bid?.esa_evaluation?.reason || "sem_termo";
  const evaluation = bid?.esa_evaluation || {};
  return buildPncpUrlByOrgName(bid?.organization_name || bid?.orgao_nome, reason, evaluation);
}

function buildDetailsUrl(bid) {
  return buildPncpUrlByCnpj(bid);
}

function extractMunicipioEstado(orgaoNome = "") {
  const text = String(orgaoNome || "").trim();
  if (!text) return { municipio: "Municipio nao informado", estado: "UF nao informada" };

  const slashUfMatch = text.match(/\/?([A-Z]{2})$/);
  const dashUfMatch = text.match(/-\s*([A-Z]{2})$/);
  const estado = (slashUfMatch?.[1] || dashUfMatch?.[1] || "UF nao informada").toUpperCase();

  let municipio = text;
  municipio = municipio.replace(/^MUNICIPIO DE\s+/i, "");
  municipio = municipio.replace(/^PREFEITURA MUNICIPAL DE\s+/i, "");
  municipio = municipio.replace(/\s*[-/]\s*[A-Z]{2}$/i, "");
  municipio = municipio.trim();

  return {
    municipio: municipio || "Municipio nao informado",
    estado
  };
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

  function normalizeExternalWarnings(rawWarnings = []) {
    const normalized = [];
    for (const item of rawWarnings) {
      const text = String(item || "").toLowerCase();
      if (text.includes("licitacoes-e")) normalized.push("Fonte Licitacoes-e (BB) temporariamente indisponivel");
      else if (text.includes("compras.gov")) normalized.push("Fonte Compras.gov.br temporariamente indisponivel");
      else if (text.includes("portal de compras publicas")) normalized.push("Fonte Portal de Compras Publicas temporariamente indisponivel");
      else if (text.includes("pncp")) normalized.push("Fonte PNCP temporariamente indisponivel");
    }
    return Array.from(new Set(normalized));
  }

  async function loadBids() {
    try {
      setIsLoading(true);
      setError("");
      setWarnings([]);
      const supabase = getSupabaseClientOrThrow();

      let fromDate = null;
      if (period !== "todos") {
        const days = period === "7dias" ? 7 : 30;
        const from = new Date();
        from.setDate(from.getDate() - days);
        fromDate = from.toISOString();
      }

      const rpcSearch = [search, keywordFilter !== "todos" ? keywordFilter : "", cnaeFilter !== "todos" ? cnaeFilter : ""]
        .filter(Boolean)
        .join(" ")
        .trim();

      const [rpcResult, externalResult] = await Promise.all([
        supabase.rpc("get_filtered_bids", {
          p_search: rpcSearch || null,
          p_from_date: fromDate,
          p_to_date: null,
          p_status: status,
          p_limit: 200
        }),
        fetch("/api/multi-source-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        })
      ]);

      const { data, error: rpcError } = rpcResult;

      if (rpcError) throw new Error(rpcError.message);

      const ids = (data || []).map((row) => row.id).filter(Boolean);
      let cnpjById = {};
      if (ids.length > 0) {
        const { data: cnpjRows } = await supabase
          .from("bids")
          .select("id,orgao_cnpj")
          .in("id", ids);

        cnpjById = (cnpjRows || []).reduce((acc, row) => {
          acc[row.id] = sanitizeCnpj(row.orgao_cnpj);
          return acc;
        }, {});
      }

      const normalizedInternal = (data || []).map((row) => ({
        ...(function () {
          const textForScoring = `${row.objeto_descricao || ""}`;
          const evaluation = evaluateEsaScore(textForScoring, { organizationName: row.orgao_nome || "" });
          return {
            alta_aderencia: evaluation.highAdherence,
            aderencia_score: evaluation.score,
            esa_score: evaluation.score,
            score_reason: evaluation.reason || "sem_termo",
            esa_evaluation: evaluation
          };
        })(),
        ...extractMunicipioEstado(row.orgao_nome),
        id: row.id,
        rowType: "internal",
        source: "PNCP",
        title: row.objeto_descricao || "Sem titulo",
        description: row.objeto_descricao || "",
        organization_name: row.orgao_nome || "Orgao nao informado",
        published_date: row.data_abertura,
        closing_date: null,
        valor_estimado: row.valor_estimado,
        status: row.status || "em_analise",
        source_url: row.link_edital,
        orgao_cnpj: cnpjById[row.id] || "",
        cnae_principal: row.cnae_principal || ""
      }));

      let normalizedExternal = [];
      if (externalResult.ok) {
        const payload = await externalResult.json().catch(() => ({}));
        const sourceWarnings = normalizeExternalWarnings(payload.warnings || []);
        if (sourceWarnings.length > 0) {
          setWarnings(sourceWarnings);
        }

        normalizedExternal = (payload.data || []).map((row, index) => ({
          ...(function () {
            const textForScoring = `${row.title || ""} ${row.description || ""}`;
            const evaluation = evaluateEsaScore(textForScoring, { organizationName: row.organization || "" });
            return {
              alta_aderencia: evaluation.highAdherence,
              aderencia_score: evaluation.score,
              esa_score: evaluation.score,
              score_reason: evaluation.reason || "sem_termo",
              esa_evaluation: evaluation
            };
          })(),
          id: row.url || `external-${index}`,
          rowType: "external",
          source: row.source || "Externa",
          title: row.title || "Sem titulo",
          description: row.description || "",
          organization_name: row.organization || "Orgao nao informado",
          published_date: row.published_date,
          closing_date: null,
          valor_estimado: null,
          status: "em_analise",
          source_url: row.url,
          orgao_cnpj: sanitizeCnpj(row.orgao_cnpj),
          cnae_principal: "",
          municipio: "-",
          estado: "-"
        }));
      } else {
        setWarnings(["Fontes externas temporariamente indisponiveis"]);
      }

      const hiddenFiltered = [...normalizedInternal, ...normalizedExternal].filter((row) => {
        return !isAbsoluteVeto(row.esa_evaluation);
      });

      hiddenFiltered.sort((a, b) => {
        const scoreDiff = (b.esa_score || 0) - (a.esa_score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(b.published_date || 0) - new Date(a.published_date || 0);
      });

      setBids(hiddenFiltered);
    } catch (err) {
      setError(err.message || "Falha ao carregar editais.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    getActiveKeywords().then(setAvailableKeywords).catch(() => setAvailableKeywords([]));
    getActiveCnaes().then(setAvailableCnaes).catch(() => setAvailableCnaes([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadBids();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, status, period, keywordFilter, cnaeFilter]);

  async function handleSync() {
    try {
      setIsSyncing(true);
      setWarnings([]);
      setError("");
      const customKeywords = await getActiveKeywords().catch(() => []);
      const result = await syncPncBids(customKeywords);
      const syncWarnings = (result.warnings || []).map(() => "Fonte PNCP temporariamente indisponivel");
      if (syncWarnings.length) setWarnings((prev) => Array.from(new Set([...prev, ...syncWarnings])));
      await loadBids();
    } catch (err) {
      setError(err.message || "Falha ao sincronizar editais.");
    } finally {
      setIsSyncing(false);
    }
  }

  const filtered = useMemo(() => bids, [bids]);

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
              {warnings.join(" | ")}
            </p>
          )}

          {isLoading && (
            <p className="font-body text-brand-ink/80">
              Minerando editais especificos para a Expressao Socioambiental (CNAE, nicho e termos obrigatorios)...
            </p>
          )}

          {!isLoading && filtered.length === 0 && (
            <p className="font-body text-brand-ink/80">Nenhum edital encontrado para o filtro informado.</p>
          )}

          {!isLoading && filtered.length > 0 && (
            <ul className="space-y-3">
              {filtered.map((bid) => (
                <li key={bid.id} className="rounded-xl border border-brand-brown/10 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {isPriorityFederalOrg(bid.organization_name || "") && (
                          <span className="rounded-full border border-[#C8A74E] bg-[#0B1F3A] px-2 py-1 font-body text-[11px] font-semibold uppercase tracking-wide text-[#F3D27A]">
                            Federal Prioritario
                          </span>
                        )}
                        {bid.alta_aderencia && (
                          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 font-body text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                            Alta Aderencia
                          </span>
                        )}
                        <span className="rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-2 py-1 font-body text-[11px] font-semibold uppercase tracking-wide text-brand-cyan">
                          Score {bid.aderencia_score}
                        </span>
                        <ScoreReasonBadge reason={bid.score_reason} evaluation={bid.esa_evaluation} />
                        <span className="rounded-full border border-brand-brown/20 bg-white px-2 py-1 font-body text-[11px] font-semibold text-brand-brown">
                          Municipio: {bid.municipio}
                        </span>
                        <span className="rounded-full border border-brand-brown/20 bg-white px-2 py-1 font-body text-[11px] font-semibold text-brand-brown">
                          Estado: {bid.estado}
                        </span>
                        <span className="rounded-full border border-brand-brown/20 bg-brand-sand px-2 py-1 font-body text-[11px] font-semibold text-brand-brown">
                          {formatCurrencyBRL(bid.valor_estimado)}
                        </span>
                        {bid.cnae_principal && (
                          <span className="rounded-full border border-brand-brown/20 bg-brand-sand px-2 py-1 font-body text-[11px] font-semibold text-brand-brown">
                            CNAE {bid.cnae_principal}
                          </span>
                        )}
                        <span className="rounded-full border border-brand-brown/20 bg-white px-2 py-1 font-body text-[11px] font-semibold text-brand-brown">
                          Fonte: {bid.source || "PNCP"}
                        </span>
                      </div>
                      <h3 className="font-heading text-lg text-brand-brown">{bid.title}</h3>
                      <p className="font-body text-sm text-brand-ink/80">{bid.organization_name || "Orgao nao informado"}</p>
                      <p className="mt-1 font-body text-xs text-brand-ink/60">
                        Publicado: {formatDate(bid.published_date)} | Encerramento: {formatDate(bid.closing_date)}
                      </p>
                      {import.meta.env.DEV && (
                        <p className="mt-1 font-body text-[11px] text-brand-ink/50">
                          Termo que gerou o Score: {bid.score_reason || "sem_termo"}
                        </p>
                      )}
                    </div>
                    <a
                      href={buildDetailsUrl(bid)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-brand-cyan px-4 py-2 text-center font-heading text-xs font-semibold uppercase tracking-wider text-white"
                    >
                      Ver Detalhes
                    </a>
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
