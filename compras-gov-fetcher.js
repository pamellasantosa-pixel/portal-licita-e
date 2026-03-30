import { createClient } from "@supabase/supabase-js";

const COMPRAS_GOV_URLS = [
  "https://compras.dados.gov.br/licitacoes/v1/licitacoes.json?situacao=1", // '1' é o código para Aberta
  "https://compras.dados.gov.br/licitacoes/v1/licitacoes.json?item_material_servico=servico&situacao=1"
];

// Palavras-chave da Expressão Socioambiental
const EXSA_KEYWORDS = ["diagnostico", "socioambiental", "clpi", "quilombola", "meio ambiente"];

async function fetchAndSync() {
  console.log("Iniciando busca no Compras.gov.br...");
  
  for (const url of COMPRAS_GOV_URLS) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue; // Pula se der erro 404/500

      const data = await response.json();
      const licitacoes = data._embedded?.licitacoes || [];

      const filtered = licitacoes.filter(bid => 
        EXSA_KEYWORDS.some(key => bid.objeto.toLowerCase().includes(key))
      ).map(bid => ({
        pncp_id: `compras-${bid.uasg}-${bid.numero_licitacao}`,
        title: `Licitação ${bid.numero_licitacao}`,
        description: bid.objeto,
        portal_origin: 'Compras.gov.br',
        orgao_nome: `UASG: ${bid.uasg}`,
        status: 'aberto',
        aderencia_score: 10, // Define score alto para aparecer na Dashboard
        alta_aderencia: true
      }));

      // Aqui você faz o upsert no Supabase (mesma lógica que você já tem)
      console.log(`Sucesso: ${filtered.length} editais encontrados.`);
      if (filtered.length > 0) break; 
    } catch (err) {
      console.error("Erro no fetcher:", err.message);
    }
  }
}