import { createClient } from "@supabase/supabase-js";
import { CNAES, KEYWORDS, TARGET_ORGS } from "./_shared/filters.js";

const PNCP_SEARCH_URL = "https://pncp.gov.br/api/search";
const PNCP_BASE_URL = "https://pncp.gov.br";

function hasAnyKeyword(text, words) {
  const normalized = (text || "").toLowerCase();
  return words.some((word) => normalized.includes(word.toLowerCase()));
}

function normalizePncpItem(item) {
  const title = item.title || item.objetoCompra || item.objeto || item.titulo || "Sem titulo";
  const description =
    item.description ||
    item.descricao ||
    item.objetoCompra ||
    item.objeto ||
    item.resumo ||
    null;
  const organizationName = item.orgao_nome || item.orgaoEntidade?.razaoSocial || item.unidadeOrgao?.nomeUnidade || "Orgao nao informado";
  const sourcePath = item.item_url || item.linkSistemaOrigem || item.linkProcessoEletronico || item.url || "";

  // O payload do /api/search costuma trazer `item_url` no formato `/compras/<cnpj>/<ano>/<seq>`.
  // A URL pública navegável é `https://pncp.gov.br/app/compras/<cnpj>/<ano>/<seq>`.
  const normalizedPath =
    sourcePath && sourcePath.startsWith("/compras/") ? `/app${sourcePath}` : sourcePath;

  const sourceUrl = normalizedPath.startsWith("http") ? normalizedPath : `${PNCP_BASE_URL}${normalizedPath}`;
  const publishedDate = item.data_publicacao_pncp || item.dataPublicacaoPncp || item.dataPublicacao || item.createdAt || new Date().toISOString();
  const closingDate = item.data_fim_vigencia || item.dataEncerramentoProposta || null;
  const pncpControl = item.numero_controle_pncp || item.numeroControlePNCP;
  const sequence = item.numero_sequencial || item.sequencialCompra;

  return {
    title,
    description,
    organization_name: organizationName,
    source_url: sourceUrl,
    pncp_id: String(pncpControl || sequence || Math.random()),
    modality: item.modalidade_licitacao_nome || item.modalidadeNome || item.modalidade || null,
    published_date: publishedDate,
    closing_date: closingDate,
    status: "em_analise",
    source: "PNCP"
  };
}

function normalizePayload(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.itens)) return payload.itens;
  if (Array.isArray(payload?.resultado)) return payload.resultado;
  return [];
}

function scoreBid(text, keywordSet) {
  const lowered = (text || "").toLowerCase();
  const keywordHits = keywordSet.filter((keyword) => lowered.includes(keyword.toLowerCase())).length;
  const orgHits = TARGET_ORGS.filter((org) => lowered.includes(org.toLowerCase())).length;
  const cnaeHits = CNAES.filter((cnae) => lowered.includes(cnae.toLowerCase())).length;

  // Aceita resultado com pelo menos 1 keyword; org/cnae ajudam no ranking, mas nao bloqueiam.
  return {
    total: keywordHits * 2 + orgHits + cnaeHits,
    keywordHits
  };
}

function dedupeByPncpId(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.pncp_id;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

async function fetchPncpByKeyword(keyword) {
  const query = new URLSearchParams({
    tipos_documento: "edital",
    status: "recebendo_proposta",
    q: keyword,
    pagina: "1",
    tamanhoPagina: "50"
  });
  const url = `${PNCP_SEARCH_URL}?${query.toString()}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return {
        keyword,
        items: [],
        warning: `PNCP indisponivel para keyword ${keyword}`
      };
    }

    const payload = await response.json();
    return { keyword, items: normalizePayload(payload) };
  } catch {
    return {
      keyword,
      items: [],
      warning: `PNCP indisponivel para keyword ${keyword}`
    };
  }
}

async function fetchRecentPncpPages(totalPages = 2) {
  const pages = [];

  for (let page = 1; page <= totalPages; page += 1) {
    pages.push(page);
  }

  const responses = await Promise.all(
    pages.map(async (page) => {
      const query = new URLSearchParams({
        tipos_documento: "edital",
        status: "recebendo_proposta",
        pagina: String(page),
        tamanhoPagina: "50"
      });
      const url = `${PNCP_SEARCH_URL}?${query.toString()}`;

      try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const payload = await response.json();
        return normalizePayload(payload);
      } catch {
        return [];
      }
    })
  );

  return responses.flat();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const keywords = req.body?.keywords?.length ? req.body.keywords : KEYWORDS;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log(`[PNCP-SEARCH] Iniciando busca com ${keywords.length} keywords:`, keywords);

    const allResults = await Promise.all(keywords.map((keyword) => fetchPncpByKeyword(keyword)));
    const warnings = allResults.filter((result) => result.warning).map((result) => result.warning);
    let rawItems = allResults.flatMap((result) => result.items);

    console.log(`[PNCP-SEARCH] Itens brutos de busca por keyword: ${rawItems.length}`);
    console.log(`[PNCP-SEARCH] Warnings: ${warnings.join(" | ")}`);

    // Fallback quando API por termo retorna vazia/instavel: busca paginas recentes e filtra localmente.
    if (rawItems.length < 5) {
      console.log(`[PNCP-SEARCH] Poucos itens (${rawItems.length}), acionando fallback fetchRecentPncpPages...`);
      const recentItems = await fetchRecentPncpPages(3);
      console.log(`[PNCP-SEARCH] Itens recentes obtidos: ${recentItems.length}`);
      rawItems = [...rawItems, ...recentItems];
    }

    console.log(`[PNCP-SEARCH] Total de raw items após fallback: ${rawItems.length}`);

    const flattened = rawItems.map(normalizePncpItem);
    const deduped = dedupeByPncpId(flattened);

    console.log(`[PNCP-SEARCH] Após normalizar e deduplicar: ${deduped.length} itens`);

    // Log de alguns itens para debug
    if (deduped.length > 0) {
      console.log(`[PNCP-SEARCH] Amostra de itens:`, deduped.slice(0, 2).map(b => ({ title: b.title, org: b.organization_name })));
    }

    const filtered = deduped.filter((bid) => {
      const text = `${bid.title} ${bid.organization_name}`;
      const scored = scoreBid(text, keywords);
      return scored.keywordHits > 0;
    });

    console.log(`[PNCP-SEARCH] Após filtro de keywords: ${filtered.length} itens`);

    if (filtered.length === 0) {
      console.log(`[PNCP-SEARCH] Nenhum edital aderente (keywordHits > 0). Retornando todos os ${deduped.length} itens sem filtro de keyword.`);
      // Fallback final: retorna todos os itens sem exigir keyword hit (melhor ter algo que nada)
      const fallbackFiltered = deduped.slice(0, 50); // Limita a 50 para não sobrecarregar
      
      if (fallbackFiltered.length === 0) {
        return res.status(200).json({
          inserted: 0,
          warnings,
          message: "Nenhum edital encontrado na PNCP"
        });
      }

      const { error } = await supabase.from("bids").upsert(fallbackFiltered, { onConflict: "pncp_id" });
      if (error) {
        throw new Error(error.message);
      }

      console.log(`[PNCP-SEARCH] Sucesso: inseridos ${fallbackFiltered.length} editais (fallback sem keyword filter)`);
      return res.status(200).json({ inserted: fallbackFiltered.length, warnings, fallback: true });
    }

    const { error } = await supabase.from("bids").upsert(filtered, { onConflict: "pncp_id" });
    if (error) {
      throw new Error(error.message);
    }

    console.log(`[PNCP-SEARCH] Sucesso: inseridos ${filtered.length} editais`);
    return res.status(200).json({ inserted: filtered.length, warnings });
  } catch (error) {
    console.error(`[PNCP-SEARCH] Erro:`, error);
    return res.status(500).json({ error: error.message || "Erro ao consultar PNCP" });
  }
}
