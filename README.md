# Portal Licita-E

Estrutura inicial do portal para monitoramento de licitacoes com foco socioambiental.

## Stack

- Frontend: React + Tailwind CSS
- Backend/DB/Auth: Supabase
- IA: Gemini 1.5 Flash (Google AI Studio)
- Deploy: Vercel

## Setup local

1. Instale dependencias:

```bash
npm install
```

2. Crie `.env` a partir de `.env.example` e preencha as chaves.

Variavel obrigatoria para busca federal no Compras.gov:

```bash
COMPRAS_GOV_API_BASE_URL=https://api.compras.gov.br/licitacoes/v1/licitacoes
```

Variaveis obrigatorias para busca via Google Custom Search:

```bash
GOOGLE_CSE_API_KEY=...
GOOGLE_CSE_ID=...
```

3. Rode em desenvolvimento:

```bash
npm run dev
```

## Estrutura principal

- `src/pages/DashboardPage.jsx`: dashboard com editais encontrados hoje
- `src/services/pncpService.js`: chamada ao endpoint serverless de sincronizacao PNCP
- `src/services/geminiService.js`: chamada ao endpoint serverless de analise IA
- `api/pncp-search.js`: integracao PNCP + persistencia no Supabase
- `api/analyze-edital.js`: analise de viabilidade com Gemini
- `supabase/schema.sql`: tabelas `bids`, `documents`, `bid_filters`, `notifications`

## Observacoes

- O endpoint do PNCP pode variar o formato de resposta; o service foi preparado para `data`, `itens` ou array direto.
- Em producao na Vercel, configure as variaveis de ambiente no painel do projeto em `Project Settings > Environment Variables`.
- Em ambiente local, adicione as mesmas variaveis no arquivo `.env` na raiz do projeto.

## Configuracao Google CSE

1. Acesse [console.cloud.google.com](https://console.cloud.google.com/) e crie (ou selecione) um projeto.
2. No menu `APIs e servicos > Biblioteca`, habilite `Custom Search API`.
3. Em `APIs e servicos > Credenciais`, clique em `Criar credenciais > Chave de API`.
4. Restrinja a chave para a API `Custom Search API` e salve como `GOOGLE_CSE_API_KEY`.
5. Acesse o painel de Programmable Search Engine: [programmablesearchengine.google.com](https://programmablesearchengine.google.com/).
6. Crie um novo mecanismo de busca e inclua sites base, por exemplo: `gov.br`, `*.gov.br`, `bll.org.br`, `licitanet.com.br`, `bnc.org.br`.
7. No painel do mecanismo, copie o `Search engine ID` e salve como `GOOGLE_CSE_ID`.
8. Configure `GOOGLE_CSE_API_KEY` e `GOOGLE_CSE_ID` no `.env` local e na Vercel (`Project Settings > Environment Variables`).
9. Teste localmente executando o fluxo de busca para confirmar retorno da fonte `google`.