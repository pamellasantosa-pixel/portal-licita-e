(async function () {
  const paths = [
    "/api/pncp/v1/contratacao",
    "/api/pncp/v1/contratacoes",
    "/api/pncp/v1/contratacoes/",
    "/api/pncp/v1/contratacoes/publicacao",
    "/api/pncp/v1/contratacoes/publicacoes",
    "/api/pncp/v1/contratacoes-proposta",
    "/api/pncp/v1/contratacao-proposta",
    "/api/pncp/v1/editais",
    "/api/pncp/v1/licitacoes",
    "/api/pncp/v1/avisos",
    "/api/pncp/v1/dispensas",
    "/api/pncp/v1/orgaos",
    "/api/pncp/v1/unidades",
    "/api/pncp/v1/usuarios"
  ];

  for (const p of paths) {
    const url = `https://pncp.gov.br${p}?pagina=1&tamanhoPagina=5`;
    try {
      const r = await fetch(url);
      console.log(r.status, p);
      if (r.status === 200) {
        const t = await r.text();
        console.log("sample", t.slice(0, 120));
      }
    } catch (err) {
      console.log("ERR", p, err.message);
    }
  }
})();
