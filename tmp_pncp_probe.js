(async function () {
  try {
    const u = "https://pncp.gov.br/app/editais?q=CLPI&pagina=1";
    const r = await fetch(u);
    const t = await r.text();

    console.log("status", r.status, "len", t.length);

    const jsSrc = t.match(/src=\"[^\"]+\.js[^\"]*\"/g) || [];
    console.log("jsSrcCount", jsSrc.length);
    console.log(jsSrc.slice(0, 20));

    const apiLike = t.match(/[^\"'\s]+(api|contrat|edital)[^\"'\s]*/gi) || [];
    console.log("apiLikeCount", apiLike.length);
    console.log(apiLike.slice(0, 40));

    const hasWindowData = t.includes("window.__") || t.includes("__NEXT_DATA__") || t.includes("hydration");
    console.log("hasWindowData", hasWindowData);
  } catch (err) {
    console.log("error", err && err.message ? err.message : err);
  }
})();
