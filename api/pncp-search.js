import { createClient } from "@supabase/supabase-js";
import { CNAES, KEYWORDS, TARGET_ORGS } from "./_shared/filters.js";

const PNCP_URL = "https://pncp.gov.br/api/pncp/v1/contratacoes";

function hasAnyKeyword(text, words) {
  const normalized = (text || "").toLowerCase();
  return words.some((word) => normalized.includes(word.toLowerCase()));
}

function normalizePncpItem(item) {
  const title = item.objetoCompra || item.objeto || item.titulo || "Sem titulo";
  const organizationName = item.orgaoEntidade?.razaoSocial || item.unidadeOrgao?.nomeUnidade || "Orgao nao informado";
  const sourceUrl = item.linkSistemaOrigem || item.linkProcessoEletronico || item.url;
  const publishedDate = item.dataPublicacaoPncp || item.dataPublicacao || new Date().toISOString();
  const closingDate = item.dataEncerramentoProposta || null;

  return {
    title,
    organization_name: organizationName,
    source_url: sourceUrl,
    pncp_id: String(item.sequencialCompra || item.numeroControlePNCP || Math.random()),
    modality: item.modalidadeNome || item.modalidade || null,
    published_date: publishedDate,
    closing_date: closingDate,
    status: "em_analise",
    source: "PNCP"
  };
}

async function fetchPncpByKeyword(keyword) {
  const url = `${PNCP_URL}?q=${encodeURIComponent(keyword)}&pagina=1&tamanhoPagina=50`;
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
    if (Array.isArray(payload)) {
      return { keyword, items: payload };
    }

    if (Array.isArray(payload.data)) {
      return { keyword, items: payload.data };
    }

    if (Array.isArray(payload.itens)) {
      return { keyword, items: payload.itens };
    }

    return { keyword, items: [] };
  } catch {
    return {
      keyword,
      items: [],
      warning: `PNCP indisponivel para keyword ${keyword}`
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const keywords = req.body?.keywords?.length ? req.body.keywords : KEYWORDS;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const allResults = await Promise.all(keywords.map((keyword) => fetchPncpByKeyword(keyword)));
    const warnings = allResults.filter((result) => result.warning).map((result) => result.warning);
    const flattened = allResults.flatMap((result) => result.items).map(normalizePncpItem);

    const filtered = flattened.filter((bid) => {
      const text = `${bid.title} ${bid.organization_name}`;
      return hasAnyKeyword(text, KEYWORDS) && hasAnyKeyword(text, TARGET_ORGS.concat(CNAES));
    });

    if (filtered.length === 0) {
      return res.status(200).json({
        inserted: 0,
        warnings,
        message: "Nenhum edital aderente encontrado."
      });
    }

    const { error } = await supabase.from("bids").upsert(filtered, { onConflict: "pncp_id" });
    if (error) {
      throw new Error(error.message);
    }

    return res.status(200).json({ inserted: filtered.length, warnings });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Erro ao consultar PNCP" });
  }
}
