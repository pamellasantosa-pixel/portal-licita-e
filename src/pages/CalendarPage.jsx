import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllBids } from "../services/bidsService";
import { useEffect } from "react";
import MainNav from "../components/MainNav";

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const [bids, setBids] = useState([]);
  const [manualAlerts, setManualAlerts] = useState([]);
  const [alertDate, setAlertDate] = useState("");
  const [alertDescription, setAlertDescription] = useState("");

  useEffect(() => {
    getAllBids().then(setBids).catch(() => setBids([]));
  }, []);

  const events = useMemo(() => {
    const bidEvents = bids
      .filter((item) => item.closing_date)
      .map((item) => ({
        type: "Prazo do edital",
        date: item.closing_date,
        title: item.title,
        bidId: item.id
      }));

    const customEvents = manualAlerts.map((item, idx) => ({
      type: "Alerta manual",
      date: item.event_date,
      title: item.description,
      id: `manual-${idx}`
    }));

    return [...bidEvents, ...customEvents].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [bids, manualAlerts]);

  function handleCreateAlert(event) {
    event.preventDefault();
    if (!alertDate || !alertDescription) return;

    setManualAlerts((prev) => [...prev, { event_date: alertDate, description: alertDescription }]);
    setAlertDate("");
    setAlertDescription("");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-sand via-[#FFFDFB] to-[#F2F8F9] px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <MainNav />
      </div>
      <div className="mx-auto mt-6 grid max-w-7xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-brand-brown/10 bg-white p-6 shadow-panel">
          <h1 className="font-heading text-3xl text-brand-brown">Calendario de Prazos</h1>
          <p className="mt-2 font-body text-brand-ink/75">Visualizacao dos prazos de fechamento e alertas manuais.</p>

          <div className="mt-5 overflow-x-auto rounded-xl border border-brand-brown/10">
            <table className="min-w-full text-left">
              <thead className="bg-brand-sand/50">
                <tr>
                  <th className="px-4 py-3 font-body text-xs uppercase tracking-wide text-brand-ink/70">Data</th>
                  <th className="px-4 py-3 font-body text-xs uppercase tracking-wide text-brand-ink/70">Tipo</th>
                  <th className="px-4 py-3 font-body text-xs uppercase tracking-wide text-brand-ink/70">Descricao</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 font-body text-sm text-brand-ink/70" colSpan={4}>
                      Nenhum evento para exibir.
                    </td>
                  </tr>
                )}
                {events.map((eventItem, index) => (
                  <tr key={eventItem.id || eventItem.bidId || index} className="border-t border-brand-brown/10">
                    <td className="px-4 py-3 font-body text-sm text-brand-brown">{formatDate(eventItem.date)}</td>
                    <td className="px-4 py-3 font-body text-sm text-brand-ink/80">{eventItem.type}</td>
                    <td className="px-4 py-3 font-body text-sm text-brand-ink/80">{eventItem.title}</td>
                    <td className="px-4 py-3 text-right">
                      {eventItem.bidId && (
                        <button
                          onClick={() => navigate(`/bids/${eventItem.bidId}`)}
                          className="rounded-lg border border-brand-cyan/30 px-3 py-1 font-body text-xs text-brand-cyan"
                        >
                          Ver edital
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-brand-brown/10 bg-white p-6 shadow-panel">
          <h2 className="font-heading text-2xl text-brand-brown">Criar Alerta Manual</h2>
          <form onSubmit={handleCreateAlert} className="mt-4 space-y-3">
            <input
              type="date"
              value={alertDate}
              onChange={(event) => setAlertDate(event.target.value)}
              className="w-full rounded-xl border border-brand-brown/20 px-4 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
              required
            />
            <textarea
              value={alertDescription}
              onChange={(event) => setAlertDescription(event.target.value)}
              placeholder="Exemplo: validar proposta tecnica com equipe"
              className="min-h-24 w-full rounded-xl border border-brand-brown/20 px-4 py-3 font-body outline-none ring-brand-cyan transition focus:ring-2"
              required
            />
            <button className="rounded-xl bg-brand-cyan px-5 py-3 font-heading text-sm font-semibold uppercase tracking-wider text-white">
              Criar alerta
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
