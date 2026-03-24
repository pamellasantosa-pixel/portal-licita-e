(async function () {
  try {
    const pageUrl = "https://pncp.gov.br/app/editais?q=CLPI&pagina=1";
    const resp = await fetch(pageUrl);
    const html = await resp.text();

    const srcMatches = [...html.matchAll(/src=\"([^\"]+\.js[^\"]*)\"/g)].map((m) => m[1]);
    console.log("scripts", srcMatches);

    for (const src of srcMatches) {
      const jsUrl = new URL(src, resp.url).toString();
      const jsResp = await fetch(jsUrl);
      const js = await jsResp.text();

      const hits = js.match(/\/(api|pncp-api|consulta-api)\/[a-zA-Z0-9_\-\/\?=&]*/g) || [];
      const pncpHits = js.match(/pncp[^\"'\s]{0,120}/gi) || [];

      console.log("---", jsUrl, "status", jsResp.status, "len", js.length);
      console.log("routeHits", Array.from(new Set(hits)).slice(0, 30));
      console.log("pncpHits", Array.from(new Set(pncpHits)).slice(0, 30));
    }
  } catch (err) {
    console.log("error", err && err.message ? err.message : err);
  }
})();
