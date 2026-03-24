(async function () {
  const urls = [
    "https://pncp.gov.br/api/pncp/v1/contratacoes?pagina=1&tamanhoPagina=5",
    "https://pncp.gov.br/pncp-api/v1/contratacoes?pagina=1&tamanhoPagina=5",
    "https://pncp.gov.br/api/consulta/v1/contratacoes?pagina=1&tamanhoPagina=5",
    "https://pncp.gov.br/consulta-api/v1/contratacoes?pagina=1&tamanhoPagina=5",
    "https://pncp.gov.br/api/pncp/v1/orgaos?pagina=1&tamanhoPagina=5",
    "https://pncp.gov.br/pncp-api/v1/orgaos?pagina=1&tamanhoPagina=5",
    "https://pncp.gov.br/api/consulta/v1/orgaos?pagina=1&tamanhoPagina=5",
    "https://pncp.gov.br/consulta-api/v1/orgaos?pagina=1&tamanhoPagina=5"
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, { method: "GET" });
      console.log(r.status, url);
      if (r.status === 200) {
        const t = await r.text();
        console.log("sample", t.slice(0, 160));
      }
    } catch (err) {
      console.log("ERR", url, err.message);
    }
  }
})();
