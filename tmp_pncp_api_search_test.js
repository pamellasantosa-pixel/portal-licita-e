(async function () {
  const tests = [
    { method: "GET", url: "https://pncp.gov.br/api/search" },
    { method: "POST", url: "https://pncp.gov.br/api/search", body: {} },
    { method: "POST", url: "https://pncp.gov.br/api/search", body: { q: "CLPI" } },
    {
      method: "POST",
      url: "https://pncp.gov.br/api/search",
      body: { query: { bool: { must: [{ query_string: { query: "CLPI" } }] } } }
    }
  ];

  for (const t of tests) {
    try {
      const res = await fetch(t.url, {
        method: t.method,
        headers: { "Content-Type": "application/json" },
        body: t.method === "POST" ? JSON.stringify(t.body) : undefined
      });
      const txt = await res.text();
      console.log(t.method, t.url, "->", res.status);
      console.log(txt.slice(0, 250));
      console.log("---");
    } catch (err) {
      console.log("ERR", t.method, err.message);
    }
  }
})();
