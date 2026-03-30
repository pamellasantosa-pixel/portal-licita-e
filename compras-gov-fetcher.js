const axios = require('axios');

async function fetchComprasGov() {
  // URL estável para licitações abertas
  const url = 'https://compras.dados.gov.br/licitacoes/v1/licitacoes.json?situacao=1';
  
  console.log(`Tentando conectar em: ${url}`);

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    const licitacoes = response.data._embedded.licitacoes;
    console.log(`Sucesso! Encontrados ${licitacoes.length} editais brutos.`);

    // Aqui você filtraria pelos termos da Expressão Socioambiental antes de salvar no Supabase
    return licitacoes;

  } catch (error) {
    if (error.response) {
      console.error(`FETCHER_ERROR: Erro ${error.response.status} na API Compras.gov.br`);
    } else {
      console.error('FETCHER_ERROR:', error.message);
    }
  }
}

fetchComprasGov();