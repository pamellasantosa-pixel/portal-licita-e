import { useState } from "react";
import { Link } from "react-router-dom";
import { getSupabaseClientOrThrow } from "../lib/supabaseClient";

export default function RecoverPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    try {
      const supabase = getSupabaseClientOrThrow();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
      if (resetError) throw resetError;
      setMessage("Se o e-mail existir, voce recebera instrucoes de recuperacao.");
    } catch (err) {
      setError(err.message || "Falha ao solicitar recuperacao de senha.");
    }
  }

  return (
    <main className="min-h-screen bg-brand-sand px-6 py-12">
      <section className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-panel">
        <h1 className="font-heading text-3xl text-brand-brown">Recuperar conta</h1>
        <p className="mt-2 font-body text-brand-ink/75">Informe seu e-mail para receber o link de redefinicao de senha.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            placeholder="nome@empresa.com"
            className="w-full rounded-xl border border-brand-brown/20 px-4 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
          />
          <button className="rounded-xl bg-brand-cyan px-5 py-3 font-heading text-sm font-semibold uppercase tracking-wider text-white">
            Enviar link
          </button>
        </form>

        {message && <p className="mt-3 font-body text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-3 font-body text-sm text-red-700">{error}</p>}

        <Link to="/" className="mt-5 inline-block font-body text-sm text-brand-cyan underline underline-offset-4">
          Voltar para login
        </Link>
      </section>
    </main>
  );
}
