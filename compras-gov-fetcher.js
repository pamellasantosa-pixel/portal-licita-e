import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const COMPRAS_GOV_URL = "https://compras.dados.gov.br/licitacoes/v1/licitacoes.json?situacao=aberta";
const EXSA_KEYWORDS = ["diagnostico", "estudo ambiental", "clpi", "quilombola"];

function loadEnvFile(path = ".env") {
  if (!fs.existsSync(path)) return;
  const content = fs.readFileSync(path, "utf-8");

  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasExsaKeyword(text = "") {
  const normalized = normalizeText(text);
  return EXSA_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword)));
}

function normalizeComprasBid(bid = {}, index = 0) {
  const objeto = String(bid.objeto || "").trim();
  const uasg = String(bid.uasg || bid.codigo_uasg || "").trim();
  const orgaoNome = uasg ? `UASG: ${uasg}` : "Orgao nao informado";
  const dataAbertura = bid.data_abertura || bid.data_entrega_proposta || bid.dataPublicacao || new Date().toISOString();
  const ano = String(new Date(dataAbertura).getFullYear());
  const numero = String(bid.numero_licitacao || bid.numero || index + 1).replace(/[^0-9A-Za-z]/g, "");
  const cnpj = String(bid.cnpj_orgao || "").replace(/\D/g, "");

  return {
    pncp_id: `comprasgov-${ano}-${uasg || "sem-uasg"}-${numero || index + 1}`,
    title: `Licitacao ${numero || "sem-numero"}`,
    description: objeto,
    source: "Compras.gov.br",
    source_system: "COMPRAS_GOV",
    source_priority: 1,
    status: "aberto",
    published_date: dataAbertura,
    data_abertura: dataAbertura,
    organization_name: orgaoNome,
    orgao_nome: orgaoNome,
    orgao_cnpj: cnpj.length === 14 ? cnpj : null,
    objeto_descricao: objeto,
    source_url: bid._links?.self?.href || COMPRAS_GOV_URL,
    portal_origin: "Compras.gov.br",
    edital_ano: /^\d{4}$/.test(ano) ? ano : null,
    edital_sequencial: numero || null
  };
}

async function fetchComprasGovBids() {
  const response = await fetch(COMPRAS_GOV_URL, {
    headers: {
      "User-Agent": "Licita-E/1.0 (ComprasGov Fetcher)"
    }
  });

  if (!response.ok) {
    throw new Error(`Erro na API Compras.gov.br: HTTP ${response.status}`);
  }

  const data = await response.json().catch(() => ({}));
  const licitacoes = Array.isArray(data?._embedded?.licitacoes) ? data._embedded.licitacoes : [];

  const normalized = licitacoes.map((bid, index) => normalizeComprasBid(bid, index));
  const filtered = normalized.filter((bid) => hasExsaKeyword(bid.objeto_descricao));

  return {
    fetched: licitacoes.length,
    filtered
  };
}

async function saveToSupabase(rows) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios no ambiente");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  if (rows.length === 0) {
    return { inserted: 0 };
  }

  const { error } = await supabase.from("bids").insert(rows);
  if (!error) {
    return { inserted: rows.length };
  }

  // Fallback para evitar falha por duplicidade em execucoes repetidas.
  if (String(error.message || "").toLowerCase().includes("duplicate")) {
    const { error: upsertError } = await supabase.from("bids").upsert(rows, { onConflict: "pncp_id" });
    if (upsertError) throw upsertError;
    return { inserted: rows.length };
  }

  throw error;
}

async function run() {
  loadEnvFile();

  const { fetched, filtered } = await fetchComprasGovBids();
  const result = await saveToSupabase(filtered);

  console.log(`COMPRAS_GOV_FETCHED=${fetched}`);
  console.log(`COMPRAS_GOV_FILTERED=${filtered.length}`);
  console.log(`SUPABASE_INSERTED=${result.inserted}`);
}

run().catch((error) => {
  console.error("FETCHER_ERROR", error?.message || error);
  process.exit(1);
});
