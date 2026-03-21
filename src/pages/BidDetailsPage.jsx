import { useEffect, useState } from "react";
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

function buildPncpSearchUrl(bid) {
  const query = [bid?.pncp_id, bid?.title, bid?.organization_name].filter(Boolean).join(" ").trim();
  const params = new URLSearchParams({
    q: query,
    status: "recebendo_proposta",
    pagina: "1"
  });
  return `${PNCP_EDITAIS_BASE_URL}?${params.toString()}`;
}

function resolvePublicNoticeUrl(bid) {
  const sourceUrl = bid?.source_url || "";

  if (!sourceUrl) {
    return buildPncpSearchUrl(bid);
  }

  if (sourceUrl.startsWith("http") && !sourceUrl.includes("pncp.gov.br/compras/")) {
    return sourceUrl;
  }

  return buildPncpSearchUrl(bid);
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

  const editalUrl = resolvePublicNoticeUrl(bid);
  const iframeAllowed = canEmbedInIframe(editalUrl);

  async function loadBid() {
    try {
      setIsLoading(true);
      setError("");
      const data = await getBidById(id);
      setBid(data);
      setAnalysisRaw(data.ia_analysis_summary || "");
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
      const result = await analyzeBidWithGemini({
        pdfUrl: editalUrl,
        bidTitle: bid.title
      });
      const raw = parseGeminiText(result.raw || "");
      await updateBidStatus(bid.id, {
        ia_analysis_summary: raw,
        status: "em_analise"
      });
      setAnalysisRaw(raw);
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
              href={editalUrl}
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
          {analysisRaw && (
            <pre className="mt-3 overflow-x-auto rounded-xl bg-brand-sand/60 p-4 font-mono text-xs text-brand-ink">
              {analysisRaw}
            </pre>
          )}
        </section>
      </div>
    </main>
  );
}
