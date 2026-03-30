import { createClient } from "@supabase/supabase-js";
// Carregue suas variáveis de ambiente conforme seu setup (.env)

const API_URL = "https://compras.dados.gov.br/licitacoes/v1/licitacoes.json?situacao=1"; // 1 = ABERTA
const KEYWORDS = ["socioambiental", "clpi", "quilombola", "diagnostico", "indigena"];

async function sync() {
  console.log("Iniciando captura profissional...");
  
  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    const licitacoes = data._embedded?.licitacoes || [];

    // Filtro de Especialista: Só entra o que é do nicho da ExSA
    const filtered = licitacoes.filter(bid => 
      KEYWORDS.some(key => bid.objeto.toLowerCase().includes(key))
    ).map(bid => ({
      pncp_id: `compras-${bid.uasg}-${bid.numero_licitacao}`,
      title: `Licitação ${bid.numero_licitacao}`,
      objeto_descricao: bid.objeto, // Nome correto da coluna
      orgao_nome: `UASG: ${bid.uasg}`,
      portal_origin: 'Compras.gov.br',
      status: 'aberto',
      aderencia_score: 10, // Garante que apareça na Dashboard
      alta_aderencia: true
    }));

    console.log(`Encontrados ${filtered.length} editais relevantes.`);
    // Lógica de salvamento no Supabase aqui...
    
  } catch (err) {
    console.error("Erro crítico no fetcher:", err.message);
  }
}

sync();