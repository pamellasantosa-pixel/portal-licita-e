import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { analyzeBidWithGemini } from "../services/geminiService";
import { getBidById, updateBidStatus } from "../services/bidsService";
import MainNav from "../components/MainNav";

const PNCP_EDITAIS_BASE_URL = "https://pncp.gov.br/app/editais";

function parseGeminiText(raw) {
  if (!raw) return "";
  const sanitized = raw.replace(/```json|```/g, "").trim();
  return sanitized;
}

function parseAnalysisJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildPncpSearchUrl(bid) {
  // Busca resiliente: usar pncp_id (chave mais estável), sem filtrar status,
  // para não ocultar editais que saíram de recebendo_proposta.
  const query = (bid?.pncp_id || bid?.title || "").toString().trim();
  const params = new URLSearchParams({
    q: query,
    pagina: "1"
  });
  return `${PNCP_EDITAIS_BASE_URL}?${params.toString()}`;
}

function buildPortalUrl(bid) {
  if (bid?.pncp_id) {
    return `/api/pncp-open?pncp_id=${encodeURIComponent(bid.pncp_id)}`;
  }
  return buildPncpSearchUrl(bid);
}

function shouldEnrichBid(bid) {
  if (!bid?.pncp_id) return false;
  if (!bid.source_url) return true;
  if (bid.source_url.includes("pncp.gov.br/compras/")) return true;
  if (bid.source_url.includes("pncp.gov.br/app/compras/")) return true;
  if (!bid.description) return true;
  return false;
}

function resolvePublicNoticeUrl(bid) {
  const searchUrl = buildPncpSearchUrl(bid);
  const sourceUrl = bid?.source_url || "";

  if (!sourceUrl) {
    return searchUrl;
  }

  // Só tratamos como "visualizador" quando for PDF real. Para rotas PNCP, usa busca oficial.
  if (/\.pdf($|\?)/i.test(sourceUrl)) {
    return sourceUrl;
  }

  if (sourceUrl.includes("pncp.gov.br") || sourceUrl.startsWith("/compras/")) {
    return searchUrl;
  }

  return sourceUrl.startsWith("http") ? sourceUrl : searchUrl;
}

function canEmbedInIframe(url) {
  if (!url) return false;
  return /\.pdf($|\?)/i.test(url);
}

export default function BidDetailsPage() {
  const { id } = useParams();
  const [bid, setBid] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [analysisRaw, setAnalysisRaw] = useState("");
  const didEnrichRef = useRef(false);

  // Para o botão principal, sempre abre a busca oficial por `pncp_id` (mais resiliente).
  const portalUrl = buildPortalUrl(bid);

  // Para visualização/iframe, só usamos URL quando for PDF.
  const editalUrl = resolvePublicNoticeUrl(bid);
  const iframeAllowed = canEmbedInIframe(editalUrl);
  const analysis = parseAnalysisJson(analysisRaw);

  async function loadBid() {
    try {
      setIsLoading(true);
      setError("");
      const data = await getBidById(id);
      setBid(data);
      setAnalysisRaw(data.ia_analysis_summary || "");

      if (!didEnrichRef.current && shouldEnrichBid(data)) {
        didEnrichRef.current = true;
        const response = await fetch("/api/pncp-enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bidId: data.id, pncpId: data.pncp_id })
        });
        if (response.ok) {
          const payload = await response.json().catch(() => null);
          if (payload?.bid) {
            setBid((current) => ({ ...current, ...payload.bid }));
          }
        }
      }
    } catch (err) {
      setError(err.message || "Falha ao carregar detalhes do edital.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadBid();
  }, [id]);

  async function handleAnalyze() {
    try {
      setIsAnalyzing(true);
      setError("");

      if (!didEnrichRef.current && shouldEnrichBid(bid)) {
        didEnrichRef.current = true;
        const enrichResponse = await fetch("/api/pncp-enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bidId: bid.id, pncpId: bid.pncp_id })
        });
        if (enrichResponse.ok) {
          const payload = await enrichResponse.json().catch(() => null);
          if (payload?.bid) {
            setBid((current) => ({ ...current, ...payload.bid }));
          }
        }
      }

      const result = await analyzeBidWithGemini({
        pdfUrl: iframeAllowed ? editalUrl : portalUrl,
        bidTitle: bid.title,
        description: bid.description,
        organizationName: bid.organization_name,
        modality: bid.modality,
        pncpId: bid.pncp_id
      });
      const raw = parseGeminiText(result.raw || "");
      setAnalysisRaw(raw);

      try {
        await updateBidStatus(bid.id, {
          ia_analysis_summary: raw,
          status: "em_analise"
        });
      } catch (saveErr) {
        setError(saveErr.message || "Analise gerada, mas nao foi possivel salvar no banco.");
      }
    } catch (err) {
      setError(err.message || "Falha ao gerar analise com IA.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleMark(patch) {
    if (!bid) return;
    try {
      await updateBidStatus(bid.id, patch);
      await loadBid();
    } catch (err) {
      setError(err.message || "Falha ao atualizar status.");
    }
  }

  if (isLoading) {
    return <main className="p-6 font-body text-brand-ink/80">Carregando detalhes...</main>;
  }

  if (!bid) {
    return <main className="p-6 font-body text-red-700">Edital nao encontrado.</main>;
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-sand via-[#FFFDFB] to-[#F2F8F9] px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <MainNav />
        <Link to="/bids" className="font-body text-sm text-brand-cyan underline underline-offset-4">
          Voltar para explorar editais
        </Link>

        <section className="rounded-2xl border border-brand-brown/10 bg-white p-6 shadow-panel">
          <h1 className="font-heading text-3xl text-brand-brown">{bid.title}</h1>
          <p className="mt-2 font-body text-brand-ink/80">{bid.organization_name || "Orgao nao informado"}</p>
          <p className="mt-2 font-body text-sm text-brand-ink/70">Status atual: {bid.status}</p>

          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={portalUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-brand-brown/20 bg-white px-4 py-2 font-heading text-xs font-semibold uppercase tracking-wider text-brand-brown"
            >
              Visualizar Edital no Portal
            </a>
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="rounded-xl bg-brand-cyan px-4 py-2 font-heading text-xs font-semibold uppercase tracking-wider text-white disabled:opacity-60"
            >
              {isAnalyzing ? "Analisando..." : "Gerar Analise Gratuita"}
            </button>
            <button
              onClick={() => handleMark({ is_favorite: true, is_rejected: false, status: "favoritado" })}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 font-heading text-xs font-semibold uppercase tracking-wider text-emerald-700"
            >
              Favoritar
            </button>
            <button
              onClick={() => handleMark({ is_rejected: true, is_favorite: false, status: "rejeitado" })}
              className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 font-heading text-xs font-semibold uppercase tracking-wider text-red-700"
            >
              Rejeitar
            </button>
          </div>

          {error && <p className="mt-4 font-body text-sm text-red-700">{error}</p>}
        </section>

        <section className="rounded-2xl border border-brand-brown/10 bg-white p-6 shadow-panel">
          <h2 className="font-heading text-2xl text-brand-brown">Visualizador de PDF</h2>
          {!iframeAllowed && (
            <p className="mt-2 font-body text-brand-ink/80">
              Este edital esta com link direto indisponivel. Abra na busca oficial de editais do PNCP:
              {" "}
              <a href={editalUrl} target="_blank" rel="noreferrer" className="text-brand-cyan underline underline-offset-4">
                {editalUrl}
              </a>
            </p>
          )}
          {iframeAllowed && (
            <div className="mt-3 overflow-hidden rounded-xl border border-brand-brown/10">
              <iframe title="PDF do edital" src={editalUrl} className="h-[560px] w-full" />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-brand-brown/10 bg-white p-6 shadow-panel">
          <h2 className="font-heading text-2xl text-brand-brown">Analise da IA</h2>
          {!analysisRaw && <p className="mt-2 font-body text-brand-ink/80">Nenhuma analise gerada ainda.</p>}
          {analysis && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "rounded-full px-3 py-1 font-body text-xs font-semibold uppercase tracking-wide",
                    analysis.is_viable ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
                  ].join(" ")}
                >
                  {analysis.is_viable ? "Viavel para concorrer" : "Baixa aderencia"}
                </span>
                <span className="rounded-full bg-brand-cyan/10 px-3 py-1 font-body text-xs font-semibold text-brand-cyan">
                  Score: {analysis.score ?? "-"}
                </span>
                <span className="rounded-full bg-brand-sand px-3 py-1 font-body text-xs font-semibold text-brand-brown">
                  Confianca: {analysis.confidence ?? "-"}%
                </span>
              </div>

              <div className="rounded-xl border border-brand-brown/10 bg-brand-sand/35 p-4">
                <p className="font-body text-sm text-brand-ink/90">{analysis.justification || "Sem justificativa."}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-brand-brown/10 p-4">
                  <h3 className="font-heading text-sm text-brand-brown">Palavras encontradas</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(analysis.keywords_encontradas || []).length === 0 && (
                      <span className="font-body text-xs text-brand-ink/70">Nenhuma palavra obrigatoria encontrada.</span>
                    )}
                    {(analysis.keywords_encontradas || []).map((keyword) => (
                      <span key={keyword} className="rounded-full bg-emerald-50 px-2 py-1 font-body text-xs text-emerald-700">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-brand-brown/10 p-4">
                  <h3 className="font-heading text-sm text-brand-brown">Sinais de atencao</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(analysis.sinais_de_atencao || []).length === 0 && (
                      <span className="font-body text-xs text-brand-ink/70">Nenhum sinal de atencao detectado.</span>
                    )}
                    {(analysis.sinais_de_atencao || []).map((keyword) => (
                      <span key={keyword} className="rounded-full bg-red-50 px-2 py-1 font-body text-xs text-red-700">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-brand-brown/10 p-4">
                <h3 className="font-heading text-sm text-brand-brown">Entregaveis sugeridos</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 font-body text-sm text-brand-ink/90">
                  {(analysis.deliverables || []).map((item, idx) => (
                    <li key={`${item}-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {analysisRaw && !analysis && (
            <pre className="mt-3 overflow-x-auto rounded-xl bg-brand-sand/60 p-4 font-mono text-xs text-brand-ink">
              {analysisRaw}
            </pre>
          )}
        </section>
      </div>
    </main>
  );
}
