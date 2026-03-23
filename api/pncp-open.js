const PNCP_SEARCH_URL = "https://pncp.gov.br/api/search";

function decodeRepeated(value) {
  let current = String(value || "").trim();
  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

function parsePncpControl(value) {
  const raw = decodeRepeated(value);
  if (!raw) return null;

  const withSlashYear = raw.match(/^(\d{14})-(\d+)-(\d+)\/(\d{4})$/);
  if (withSlashYear) {
    return {
      cnpj: withSlashYear[1],
      ano: withSlashYear[4],
      numero: withSlashYear[3]
    };
  }

  const canonical = raw.match(/^(\d{14})-(\d{4})-(\d+)$/);
  if (canonical) {
    return {
      cnpj: canonical[1],
      ano: canonical[2],
      numero: canonical[3]
    };
  }

  const onlyCnpj = raw.match(/^(\d{14})$/);
  if (onlyCnpj) {
    return {
      cnpj: onlyCnpj[1],
      ano: "",
      numero: ""
    };
  }

  return null;
}

function buildPncpQuery(pncpId) {
  const parsed = parsePncpControl(pncpId);
  if (!parsed) return decodeRepeated(pncpId);
  if (parsed.cnpj && parsed.ano && parsed.numero) return `${parsed.cnpj}-${parsed.ano}-${parsed.numero}`;
  return parsed.cnpj || decodeRepeated(pncpId);
}

function extractCnpj(pncpId, cnpjHint = "") {
  const parsed = parsePncpControl(pncpId);
  if (parsed?.cnpj) return parsed.cnpj;
  const hint = String(cnpjHint || "").replace(/\D/g, "");
  return /^\d{14}$/.test(hint) ? hint : "";
}

function normalizePayload(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.itens)) return payload.itens;
  if (Array.isArray(payload?.resultado)) return payload.resultado;
  return [];
}

function buildSearchUrl(queryTerm) {
  const query = new URLSearchParams({
    q: queryTerm,
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
  const pncpId = decodeRepeated(req.query?.pncp_id || req.query?.pncpId || "");
  const cnpj = extractCnpj(pncpId, req.query?.cnpj);
  const normalizedQuery = buildPncpQuery(pncpId);
  const fallbackQuery = cnpj || normalizedQuery;

  if (!fallbackQuery) {
    res.writeHead(302, { Location: "https://pncp.gov.br/app/editais?pagina=1" });
    return res.end();
  }

  try {
    const item = await findItemByPncpId(pncpId);
    const directUrl = buildContratacoesUrl(item?.item_url);
    const location = directUrl || buildSearchUrl(fallbackQuery);
    res.writeHead(302, { Location: location });
    return res.end();
  } catch {
    res.writeHead(302, { Location: buildSearchUrl(fallbackQuery) });
    return res.end();
  }
}
