(async function () {
  try {
    const base = "https://pncp.gov.br/app/editais?q=CLPI&pagina=1";
    const page = await fetch(base);
    const html = await page.text();
    const srcMatches = [...html.matchAll(/src=\"([^\"]+\.js[^\"]*)\"/g)].map((m) => m[1]);
    console.log("scripts", srcMatches);

    const mainSrc = srcMatches.find((item) => item.includes("main."));
    if (!mainSrc) {
      console.log("main js nao encontrado");
      return;
    }

    const jsUrl = new URL(mainSrc, page.url).toString();
    console.log("jsUrl", jsUrl);

    const jsResp = await fetch(jsUrl);
    const js = await jsResp.text();
    console.log("jsStatus", jsResp.status, "jsLen", js.length);

    const urls = js.match(/https?:\/\/[^\"'\s]+/g) || [];
    const apiTokens = js.match(/[^\"'\s]{0,40}(api|contrat|edital|pncp)[^\"'\s]{0,80}/gi) || [];

    console.log("urls", urls.slice(0, 20));
    console.log("apiTokensCount", apiTokens.length);
    console.log(apiTokens.slice(0, 80));
  } catch (err) {
    console.log("error", err && err.message ? err.message : err);
  }
})();
