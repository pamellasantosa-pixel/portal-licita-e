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