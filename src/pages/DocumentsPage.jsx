import { useEffect, useMemo, useState } from "react";
import { getSupabaseClientOrThrow } from "../lib/supabaseClient";
import MainNav from "../components/MainNav";
import { uploadDocumentFile } from "../services/documentsService";

function daysUntil(dateLike) {
  if (!dateLike) return null;
  const now = new Date();
  const end = new Date(dateLike);
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileType, setFileType] = useState("pdf");
  const [expirationDate, setExpirationDate] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadDocuments() {
    try {
      setIsLoading(true);
      setError("");
      const supabase = getSupabaseClientOrThrow();
      const { data, error: queryError } = await supabase
        .from("documents")
        .select("id,name,file_url,file_type,expiration_date,created_at")
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;
      setDocuments(data ?? []);
    } catch (err) {
      setError(err.message || "Falha ao carregar documentos.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      const supabase = getSupabaseClientOrThrow();
      let finalFileUrl = fileUrl;
      let finalFileType = fileType;

      if (selectedFile) {
        const uploaded = await uploadDocumentFile({ file: selectedFile });
        finalFileUrl = uploaded.fileUrl;
        finalFileType = uploaded.fileType;
      }

      if (!finalFileUrl) {
        throw new Error("Informe uma URL ou selecione um arquivo para upload.");
      }

      const { error: insertError } = await supabase.from("documents").insert([
        {
          name,
          file_url: finalFileUrl,
          file_type: finalFileType,
          expiration_date: expirationDate || null
        }
      ]);

      if (insertError) throw insertError;

      setName("");
      setFileUrl("");
      setFileType("pdf");
      setExpirationDate("");
      setSelectedFile(null);
      await loadDocuments();
    } catch (err) {
      setError(err.message || "Falha ao salvar documento.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const expiringSoon = useMemo(() => {
    return documents.filter((doc) => {
      const days = daysUntil(doc.expiration_date);
      return days !== null && days <= 30;
    });
  }, [documents]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-sand via-[#FFFDFB] to-[#F2F8F9] px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <MainNav />
      </div>
      <div className="mx-auto mt-6 grid max-w-7xl gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-2xl border border-brand-brown/10 bg-white p-6 shadow-panel">
          <h1 className="font-heading text-3xl text-brand-brown">Gestao de Documentos</h1>
          <p className="mt-2 font-body text-brand-ink/75">Repositório centralizado para certidoes e documentos de habilitacao.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome do documento"
              required
              className="w-full rounded-xl border border-brand-brown/20 px-4 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
            />
            <input
              value={fileUrl}
              onChange={(event) => setFileUrl(event.target.value)}
              placeholder="URL do arquivo (opcional se fizer upload)"
              className="w-full rounded-xl border border-brand-brown/20 px-4 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
            />
            <input
              type="file"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              className="w-full rounded-xl border border-brand-brown/20 px-4 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <select
                value={fileType}
                onChange={(event) => setFileType(event.target.value)}
                className="rounded-xl border border-brand-brown/20 px-4 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
              >
                <option value="pdf">PDF</option>
                <option value="doc">DOC</option>
                <option value="xls">XLS</option>
              </select>
              <input
                type="date"
                value={expirationDate}
                onChange={(event) => setExpirationDate(event.target.value)}
                className="rounded-xl border border-brand-brown/20 px-4 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
              />
            </div>
            <button
              disabled={isSubmitting}
              className="rounded-xl bg-brand-cyan px-5 py-3 font-heading text-sm font-semibold uppercase tracking-wider text-white disabled:opacity-60"
            >
              {isSubmitting ? "Enviando..." : "Novo Upload"}
            </button>
          </form>

          {error && <p className="mt-4 font-body text-sm text-red-700">{error}</p>}
        </section>

        <section className="rounded-2xl border border-brand-brown/10 bg-white p-6 shadow-panel">
          <h2 className="font-heading text-2xl text-brand-brown">Alertas de Validade</h2>
          {expiringSoon.length === 0 && <p className="mt-2 font-body text-brand-ink/75">Nenhum documento proximo do vencimento.</p>}
          {expiringSoon.length > 0 && (
            <ul className="mt-3 space-y-2">
              {expiringSoon.map((doc) => {
                const days = daysUntil(doc.expiration_date);
                return (
                  <li key={doc.id} className="rounded-xl border border-amber-300 bg-amber-50 p-3 font-body text-sm text-amber-800">
                    {doc.name}: vence em {days} dia(s)
                  </li>
                );
              })}
            </ul>
          )}

          <h3 className="mt-6 font-heading text-xl text-brand-brown">Lista de documentos</h3>
          {isLoading && <p className="mt-2 font-body text-brand-ink/75">Carregando...</p>}
          {!isLoading && documents.length === 0 && <p className="mt-2 font-body text-brand-ink/75">Nenhum documento cadastrado.</p>}
          {!isLoading && documents.length > 0 && (
            <ul className="mt-3 space-y-2">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border border-brand-brown/10 p-3">
                  <div>
                    <p className="font-body text-sm text-brand-brown">{doc.name}</p>
                    <p className="font-body text-xs text-brand-ink/65">{doc.file_type || "arquivo"}</p>
                  </div>
                  <a href={doc.file_url} target="_blank" rel="noreferrer" className="font-body text-xs text-brand-cyan underline">
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
