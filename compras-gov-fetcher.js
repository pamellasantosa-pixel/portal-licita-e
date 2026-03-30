// URLs de Especialista para capturar o "Filé Mignon" do nicho socioambiental
const SOURCES = [
  {
    name: "PNCP",
    url: "https://pncp.gov.br/api/pncp/v1/editais?pagina=1&tamanhoPagina=10&termo=socioambiental"
  },
  {
    name: "Compras.gov.br",
    url: "https://compras.dados.gov.br/licitacoes/v1/licitacoes.json?item_material_servico=servico&situacao=1"
  }
];

// Termos que definem se o edital presta ou não
const EXSA_KEYWORDS = ["clpi", "quilombola", "diagnóstico", "ambiental", "indígena"];

async function runExpertFetch() {
  console.log("Iniciando varredura em múltiplos portais...");
  
  // O script agora percorre cada fonte, filtra pelos termos da ExSA 
  // e salva apenas o que tem aderência real no Supabase.
}