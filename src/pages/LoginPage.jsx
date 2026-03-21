import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabaseClientOrThrow } from "../lib/supabaseClient";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseClientOrThrow();

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate("/dashboard", { replace: true });
      }
    });
  }, [navigate]);

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setError("");

      const supabase = getSupabaseClientOrThrow();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        throw signInError;
      }

      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Nao foi possivel entrar. Verifique email e senha.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-brand-sand px-6 py-12">
      <section className="mx-auto grid max-w-5xl gap-8 rounded-3xl bg-white p-8 shadow-panel lg:grid-cols-2 lg:p-12">
        <div className="space-y-4">
          <p className="font-body text-sm uppercase tracking-[0.25em] text-brand-cyan">Portal Licita-E</p>
          <h1 className="font-heading text-4xl font-semibold text-brand-brown">Monitoramento Inteligente de Editais</h1>
          <p className="font-body text-base text-brand-ink/80">
            Plataforma focada em oportunidades socioambientais, com filtros por termos-chave e analise automatizada de viabilidade.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-brand-brown/10 bg-brand-sand/35 p-6">
          <h2 className="font-heading text-2xl text-brand-brown">Acessar conta</h2>
          <label className="block">
            <span className="mb-1 block font-body text-sm text-brand-ink">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nome@empresa.com"
              required
              className="w-full rounded-xl border border-brand-brown/20 bg-white px-4 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-body text-sm text-brand-ink">Senha</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              required
              className="w-full rounded-xl border border-brand-brown/20 bg-white px-4 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
            />
          </label>

          {error && <p className="font-body text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center rounded-xl bg-brand-cyan px-4 py-3 font-heading text-sm font-semibold uppercase tracking-wider text-white transition hover:brightness-95"
          >
            {isSubmitting ? "Entrando..." : "Entrar"}
          </button>
          <button type="button" className="font-body text-sm text-brand-brown underline decoration-brand-cyan decoration-2 underline-offset-4">
            Esqueci minha senha
          </button>
        </form>
      </section>
    </main>
  );
}
