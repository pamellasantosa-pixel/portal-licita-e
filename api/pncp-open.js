const PNCP_SEARCH_URL = "https://pncp.gov.br/api/search";

function normalizePayload(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.itens)) return payload.itens;
  if (Array.isArray(payload?.resultado)) return payload.resultado;
  return [];
}

function buildSearchUrl(pncpId) {
  const query = new URLSearchParams({
    q: pncpId,
    pagina: "1"
  });
  return `https://pncp.gov.br/app/editais?${query.toString()}`;
}

function buildContratacoesUrl(itemUrl) {
  if (!itemUrl || !itemUrl.startsWith("/compras/")) return null;
  const rest = itemUrl.replace(/^\/compras/, "");
  return `https://pncp.gov.br/app/contratacoes${rest}`;
}

async function findItemByPncpId(pncpId) {
  const statuses = ["recebendo_proposta", "1", "2", "3", "4", "5"];

  for (const status of statuses) {
    const params = new URLSearchParams({
      tipos_documento: "edital",
      status,
      q: pncpId,
      pagina: "1",
      tamanhoPagina: "1"
    });

    const response = await fetch(`${PNCP_SEARCH_URL}?${params.toString()}`);
    if (!response.ok) continue;

    const payload = await response.json().catch(() => null);
    const items = normalizePayload(payload);
    if (items.length > 0) return items[0];
  }

  return null;
}

export default async function handler(req, res) {
  const pncpId = String(req.query?.pncp_id || req.query?.pncpId || "").trim();

  if (!pncpId) {
    res.writeHead(302, { Location: "https://pncp.gov.br/app/editais?pagina=1" });
    return res.end();
  }

  try {
    const item = await findItemByPncpId(pncpId);
    const directUrl = buildContratacoesUrl(item?.item_url);
    const location = directUrl || buildSearchUrl(pncpId);
    res.writeHead(302, { Location: location });
    return res.end();
  } catch {
    res.writeHead(302, { Location: buildSearchUrl(pncpId) });
    return res.end();
  }
}
