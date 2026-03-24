(async function () {
  const jsUrl = "https://pncp.gov.br/app/main.ad8742157dcd6043.js";
  const r = await fetch(jsUrl);
  const js = await r.text();

  function contexts(token) {
    const out = [];
    let idx = 0;
    while (true) {
      const pos = js.indexOf(token, idx);
      if (pos === -1) break;
      const start = Math.max(0, pos - 160);
      const end = Math.min(js.length, pos + 260);
      out.push(js.slice(start, end));
      idx = pos + token.length;
      if (out.length >= 8) break;
    }
    return out;
  }

  console.log("--- /api/search contexts ---");
  for (const c of contexts("/api/search")) {
    console.log(c);
    console.log("\n---\n");
  }

  console.log("--- /api/pncp/v1 contexts ---");
  for (const c of contexts("/api/pncp/v1")) {
    console.log(c);
    console.log("\n---\n");
  }
})();
