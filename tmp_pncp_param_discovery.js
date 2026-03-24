(async function () {
  const statusVals = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "todos",
    "TODOS",
    "recebendo_proposta",
    "em_julgamento",
    "encerradas",
    "abertas"
  ];
  const tipos = ["edital", "EDITAL", "aviso", "AVISO", "edital,aviso", "1", "2", "3"];

  for (const status of statusVals) {
    for (const tipo of tipos) {
      const url = `https://pncp.gov.br/api/search?status=${encodeURIComponent(status)}&tipos_documento=${encodeURIComponent(
        tipo
      )}&pagina=1&tamanhoPagina=5`;
      try {
        const res = await fetch(url);
        const text = await res.text();
        if (res.status === 200) {
          console.log("OK", status, tipo, "len", text.length, "sample", text.slice(0, 140));
        }
      } catch (err) {
        // noop
      }
    }
  }
})();
