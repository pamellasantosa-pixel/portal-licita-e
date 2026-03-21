import { Link } from "react-router-dom";

export default function LoginPage() {
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

        <form className="space-y-4 rounded-2xl border border-brand-brown/10 bg-brand-sand/35 p-6">
          <h2 className="font-heading text-2xl text-brand-brown">Acessar conta</h2>
          <label className="block">
            <span className="mb-1 block font-body text-sm text-brand-ink">E-mail</span>
            <input
              type="email"
              placeholder="nome@empresa.com"
              className="w-full rounded-xl border border-brand-brown/20 bg-white px-4 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-body text-sm text-brand-ink">Senha</span>
            <input
              type="password"
              placeholder="********"
              className="w-full rounded-xl border border-brand-brown/20 bg-white px-4 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
            />
          </label>

          <Link
            to="/dashboard"
            className="inline-flex w-full items-center justify-center rounded-xl bg-brand-cyan px-4 py-3 font-heading text-sm font-semibold uppercase tracking-wider text-white transition hover:brightness-95"
          >
            Entrar
          </Link>
          <button type="button" className="font-body text-sm text-brand-brown underline decoration-brand-cyan decoration-2 underline-offset-4">
            Esqueci minha senha
          </button>
        </form>
      </section>
    </main>
  );
}
