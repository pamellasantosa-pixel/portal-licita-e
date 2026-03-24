(async function () {
  const urls = [
    "https://pncp.gov.br/api/search",
    "https://pncp.gov.br/api/search?tipos_documento=edital",
    "https://pncp.gov.br/api/search?tipos_documento=edital&pagina=1&tamanhoPagina=10",
    "https://pncp.gov.br/api/search?tipos_documento=edital&q=CLPI&pagina=1&tamanhoPagina=10",
    "https://pncp.gov.br/api/search?tipos_documento=edital&status=recebendo_proposta&pagina=1&tamanhoPagina=10",
    "https://pncp.gov.br/api/search?tipos_documento=edital&ordenacao=-data&pagina=1&tamanhoPagina=10"
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      const txt = await res.text();
      console.log(res.status, url);
      console.log(txt.slice(0, 260));
      console.log("---");
    } catch (err) {
      console.log("ERR", url, err.message);
    }
  }
})();
