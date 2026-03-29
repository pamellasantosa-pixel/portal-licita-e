import { createClient } from "@supabase/supabase-js";

const PNCP_SEARCH_URL = "https://pncp.gov.br/api/search";
const PNCP_BASE_URL = "https://pncp.gov.br";

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function extractOrgaoCnpj(item = {}, sourcePath = "") {
  const candidates = [
    item.orgaoEntidade?.cnpj,
    item.orgaoEntidade?.cnpjOrgaoEntidade,
    item.unidadeOrgao?.codigoUnidade,
    item.cnpj,
    item.cnpjOrgao,
    item.cnpj_origem,
    sourcePath.match(/^\/compras\/(\d{14})\//)?.[1]
  ];

  for (const candidate of candidates) {
    const cleaned = onlyDigits(candidate);
    if (cleaned.length === 14) return cleaned;
  }

  return null;
}

function normalizeYear(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 4 ? digits : "";
}

function normalizeSequential(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const asNumber = Number(digits);
  if (!Number.isFinite(asNumber)) return digits;
  return String(asNumber);
}

function parseDirectIdentifiers(item = {}, sourcePath = "") {
  const pathMatch = String(sourcePath || "").match(/^\/compras\/(\d{14})\/(\d{4})\/(\d+)/i);
  if (pathMatch) {
    return {
      cnpj: pathMatch[1],
      ano: normalizeYear(pathMatch[2]),
      sequencial: normalizeSequential(pathMatch[3])
    };
  }

  const control = String(item.numero_controle_pncp || item.numeroControlePNCP || "");
  const slashPattern = control.match(/^(\d{14})-(\d+)-(\d+)\/(\d{4})$/);
  if (slashPattern) {
    return {
      cnpj: slashPattern[1],
      ano: normalizeYear(slashPattern[4]),
      sequencial: normalizeSequential(slashPattern[3])
    };
  }

  return {
    cnpj: "",
    ano: normalizeYear(item.anoCompra || item.ano || item.anoCompraPncp),
    sequencial: normalizeSequential(item.numero_sequencial || item.sequencialCompra || item.numero)
  };
}

function buildPncpDirectEditalUrl(cnpj, ano, sequencial) {
  const safeCnpj = onlyDigits(cnpj);
  const safeAno = normalizeYear(ano);
  const safeSeq = normalizeSequential(sequencial);
  if (safeCnpj.length === 14 && safeAno && safeSeq) {
    return `${PNCP_BASE_URL}/app/editais/${safeCnpj}/${safeAno}/${safeSeq}`;
  }
  return "";
}

function normalizePayload(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.itens)) return payload.itens;
  if (Array.isArray(payload?.resultado)) return payload.resultado;
  return [];
}

function buildPncpSearchFallbackUrl(orgaoCnpj, organizationName) {
  if (orgaoCnpj && String(orgaoCnpj).length === 14) {
    return `${PNCP_BASE_URL}/app/editais?q=${orgaoCnpj}&pagina=1`;
  }
  const orgTerm = String(organizationName || "").trim();
  if (orgTerm) {
    return `${PNCP_BASE_URL}/app/editais?q=${encodeURIComponent(orgTerm)}&pagina=1`;
  }
  return `${PNCP_BASE_URL}/app/editais?pagina=1`;
}

function normalizePncpItem(item) {
  const title = item.title || item.objetoCompra || item.objeto || item.titulo || "Sem titulo";
  const description = item.description || item.descricao || item.objetoCompra || item.objeto || item.resumo || null;
  const organizationName =
    item.orgao_nome || item.orgaoEntidade?.razaoSocial || item.unidadeOrgao?.nomeUnidade || "Orgao nao informado";

  const sourcePath = item.item_url || item.linkSistemaOrigem || item.linkProcessoEletronico || item.url || "";
  const orgaoCnpj = extractOrgaoCnpj(item, sourcePath);
  const directIds = parseDirectIdentifiers(item, sourcePath);
  const directCnpj = directIds.cnpj || orgaoCnpj || "";
  const directUrl = buildPncpDirectEditalUrl(directCnpj, directIds.ano, directIds.sequencial);
  const normalizedPath =
    sourcePath && sourcePath.startsWith("/compras/")
      ? `/app/contratacoes${sourcePath.replace(/^\/compras/, "")}`
      : sourcePath;

  const sourceUrl = directUrl || (normalizedPath
    ? normalizedPath.startsWith("http")
      ? normalizedPath
      : `${PNCP_BASE_URL}${normalizedPath}`
    : buildPncpSearchFallbackUrl(orgaoCnpj, organizationName));

  const publishedDate =
    item.data_publicacao_pncp || item.dataPublicacaoPncp || item.dataPublicacao || item.createdAt || new Date().toISOString();
  const closingDate = item.data_fim_vigencia || item.dataEncerramentoProposta || null;
  const pncpControl = item.numero_controle_pncp || item.numeroControlePNCP;
  const sequence = item.numero_sequencial || item.sequencialCompra;

  return {
    title,
    description,
    organization_name: organizationName,
    orgao_cnpj: orgaoCnpj,
    edital_ano: directIds.ano || null,
    edital_sequencial: directIds.sequencial || null,
    source_url: sourceUrl,
    pncp_id: String(pncpControl || sequence || ""),
    modality: item.modalidade_licitacao_nome || item.modalidadeNome || item.modalidade || null,
    published_date: publishedDate,
    closing_date: closingDate,
    source: "PNCP",
    status: "em_analise"
  };
}

async function updateBid(supabase, bidId, patch) {
  const result = await supabase.from("bids").update(patch).eq("id", bidId);
  if (result.error) {
    throw new Error(result.error.message);
  }
}

async function fetchByPncpId(pncpId) {
  const statuses = ["recebendo_proposta", "1", "2", "3", "4", "5"]; // defensivo
  for (const status of statuses) {
    const query = new URLSearchParams({
      tipos_documento: "edital",
      status,
      q: pncpId,
      pagina: "1",
      tamanhoPagina: "1"
    });

    const url = `${PNCP_SEARCH_URL}?${query.toString()}`;
    const resp = await fetch(url);
    if (!resp.ok) continue;
    const payload = await resp.json().catch(() => null);
    const items = normalizePayload(payload);
    if (items.length > 0) return items[0];
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { bidId, pncpId } = req.body || {};
  if (!bidId || !pncpId) {
    return res.status(400).json({ error: "bidId e pncpId sao obrigatorios" });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const rawItem = await fetchByPncpId(pncpId);
    if (!rawItem) {
      return res.status(404).json({ error: "Edital nao encontrado no PNCP para este pncpId" });
    }

    const normalized = normalizePncpItem(rawItem);

    await updateBid(supabase, bidId, {
      title: normalized.title,
      description: normalized.description,
      organization_name: normalized.organization_name,
      orgao_cnpj: normalized.orgao_cnpj,
      edital_ano: normalized.edital_ano,
      edital_sequencial: normalized.edital_sequencial,
      source_url: normalized.source_url,
      modality: normalized.modality,
      published_date: normalized.published_date,
      closing_date: normalized.closing_date
    });

    return res.status(200).json({ updated: true, bid: normalized });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Falha ao enriquecer edital" });
  }
}
