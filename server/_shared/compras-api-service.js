const COMPRAS_GOV_API_BASE_URL =
  process.env.COMPRAS_GOV_API_BASE_URL ||
  "https://dadosabertos.compras.gov.br/modulo-legado/1_consultarLicitacao";

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

function formatDateISO(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

function buildRecentDateRanges(days = 14) {
  const ranges = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const iso = formatDateISO(day);
    ranges.push({ start: iso, end: iso });
  }
  return ranges;
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
  if (!status) return true;
  const closed = ["encerrado", "cancelado", "revogado", "anulado", "homologado", "deserto", "fracassado"];
  return !closed.some((term) => status.includes(term));
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
  const safePageSize = Math.max(10, Number(pageSize) || 10);
  const dateRanges = buildRecentDateRanges(14);

  for (const keyword of terms) {
    let foundForKeyword = false;

    for (const range of dateRanges) {
      const params = new URLSearchParams({
        pagina: "1",
        tamanhoPagina: String(safePageSize),
        data_publicacao_inicial: range.start,
        data_publicacao_final: range.end
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

        if (items.length > 0) {
          rows.push(...items);
          foundForKeyword = true;
          break;
        }
      } catch {
        // ignora falha pontual por keyword/faixa de data
      } finally {
        clearTimeout(timer);
      }
    }

    if (!foundForKeyword) {
      continue;
    }
  }

  return rows;
}
