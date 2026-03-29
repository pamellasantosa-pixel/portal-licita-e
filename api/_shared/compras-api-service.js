const COMPRAS_GOV_API_BASE_URL = process.env.COMPRAS_GOV_API_BASE_URL || "https://api.compras.gov.br/licitacoes/v1/licitacoes";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function normalizePayload(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.resultado)) return payload.resultado;
  if (Array.isArray(payload)) return payload;
  return [];
}

function hasExactKeyword(text, keyword) {
  const full = normalizeText(text);
  const needle = normalizeText(keyword).trim();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
  return re.test(full);
}

function normalizeStatus(item = {}) {
  return normalizeText(
    item.status ||
      item.status_nome ||
      item.situacao ||
      item.situacao_nome ||
      item.fase ||
      ""
  ).replace(/[_-]+/g, " ");
}

function isStatusOpen(item = {}) {
  const status = normalizeStatus(item);
  return status.includes("aberto") || status.includes("em andamento") || status.includes("recebendo proposta");
}

function mapComprasItem(item) {
  const title = firstNonEmpty([item.title, item.titulo, item.objeto, item.objetoCompra, "Sem titulo"]);
  const description = firstNonEmpty([item.description, item.descricao, item.objeto, item.resumo, ""]);
  const organization = firstNonEmpty([item.orgao_nome, item.organization, item.orgao, item.uasg_nome, "Orgao nao informado"]);
  const cnpj = String(item.orgao_cnpj || item.cnpj || "").replace(/\D/g, "");
  const sourceUrl = firstNonEmpty([
    item.url,
    item.link,
    item.href,
    item.linkDetalhe,
    item.edital_url,
    item.linkEdital,
    COMPRAS_GOV_API_BASE_URL
  ]);

  return {
    source: "Compras.gov.br",
    source_system: "COMPRAS_GOV",
    source_priority: 1,
    title,
    description,
    organization,
    orgao_cnpj: cnpj.length === 14 ? cnpj : "",
    published_date: item.published_date || item.dataPublicacao || item.data_publicacao || null,
    closing_date: item.data_fim_vigencia || item.dataEncerramentoProposta || null,
    url: sourceUrl,
    raw_status: normalizeStatus(item)
  };
}

export async function fetchComprasGovOpenBidsByKeywords(keywords = [], { timeoutMs = 10000, pageSize = 50 } = {}) {
  const terms = Array.isArray(keywords) ? keywords.filter(Boolean).slice(0, 30) : [];
  const rows = [];

  for (const keyword of terms) {
    const params = new URLSearchParams({
      termo: keyword,
      pagina: "1",
      tamanhoPagina: String(pageSize)
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${COMPRAS_GOV_API_BASE_URL}?${params.toString()}`, {
        method: "GET",
        headers: { "User-Agent": "Licita-E/1.0" },
        signal: controller.signal
      });

      if (!response.ok) continue;

      const payload = await response.json().catch(() => null);
      const items = normalizePayload(payload)
        .filter((item) => isStatusOpen(item))
        .map(mapComprasItem)
        .filter((item) => {
          const corpus = `${item.title} ${item.description}`;
          return hasExactKeyword(item.title, keyword) || hasExactKeyword(corpus, keyword);
        });

      rows.push(...items);
    } catch {
      // ignora falha pontual por keyword
    } finally {
      clearTimeout(timer);
    }
  }

  return rows;
}
