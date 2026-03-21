# 🚀 Guia de Configuração - Portal Licita-E

**Data:** 20 de março de 2026  
**Status:** Passo a passo para ambiente local

---

## 📋 Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Passo 1: Configurar Supabase](#passo-1-configurar-supabase)
3. [Passo 2: Obter Chave Gemini API](#passo-2-obter-chave-gemini-api)
4. [Passo 3: Criar Arquivo .env](#passo-3-criar-arquivo-env)
5. [Passo 4: Validar Dependências](#passo-4-validar-dependências)
6. [Passo 5: Testar Servidor Local](#passo-5-testar-servidor-local)
7. [Passo 6: Deploy em Produção (Vercel)](#passo-6-deploy-em-produção-vercel)

---

## ✅ Pré-requisitos

Verificar o que você já tem:

```powershell
# Verificar Node.js (deve ser v20+)
node --version
# Esperado: v22.20.0 ✅

# Verificar npm (deve ser v10+)
npm --version
# Esperado: 10.9.3 ✅

# Dependências já instaladas?
npm list --depth=0
# Deve listar: react, vite, tailwindcss, @supabase/supabase-js
```

---

## **Passo 1: Configurar Supabase**

### 1.1 Criar conta no Supabase (se não tiver)

1. Acesse: https://supabase.com
2. Clique em **"Sign Up"**
3. Crie uma conta com Google, GitHub ou Email
4. Confirme seu email

### 1.2 Criar novo projeto

1. No dashboard Supabase, clique em **"New Project"**
2. Preencha:
   - **Project name**: `Licita-E`
   - **Database password**: Crie uma senha forte (salve em local seguro)
   - **Region**: Selecione mais próximo do Brasil (ex: `us-east-1`)
3. Clique em **"Create new project"**
4. **Aguarde** 1-2 minutos para o projeto ser criado

### 1.3 Obter as credenciais

1. No projeto Supabase, vá para **Settings → API**
2. Copie as seguintes informações:

   - **Project URL** → salve como `VITE_SUPABASE_URL`
   - **anon key** → salve como `VITE_SUPABASE_ANON_KEY`
   - **service_role key** → salve como `SUPABASE_SERVICE_ROLE_KEY`
   - **Project URL** (novamente) → salve como `SUPABASE_URL`

### 1.4 Criar estrutura do banco (SQL)

1. Em Supabase, vá para **SQL Editor**
2. Clique em **"New Query"**
3. Copie todo o conteúdo de `supabase/schema.sql` deste projeto
4. Cole no editor SQL Supabase
5. Clique em **"Run"**
6. O banco de dados agora tem as tabelas necessárias ✅

---

## **Passo 2: Obter Chave Gemini API**

### 2.1 Acessar Google AI Studio

1. Acesse: https://aistudio.google.com/app/apikey
2. Clique em **"Create API Key"**
3. Selecione o projeto do Google Cloud (ou deixe a opção padrão)
4. Clique em **"Create API Key"**
5. A chave será exibida - **copie-a** (será algo como `AIzaSyC...`)

### 2.2 Salve a chave

- Salve como `GEMINI_API_KEY` no seu `.env`

---

## **Passo 3: Criar Arquivo .env**

### 3.1 Criar o arquivo

1. Na raiz do projeto (`Licita-E vscode/`), crie um arquivo chamado `.env`
2. Copie o conteúdo abaixo:

```env
# Supabase - Cliente Frontend
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Supabase - Backend/APIs (Vercel)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Google Gemini API
GEMINI_API_KEY=AIzaSyC...
```

### 3.2 Preencher as credenciais

Cole as credenciais que você copiou nos passos anteriores:

| Variável | Aonde encontrar |
|----------|-----------------|
| `VITE_SUPABASE_URL` | Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Settings → API → anon key |
| `SUPABASE_URL` | Settings → API → Project URL (mesma coisa) |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role key |
| `GEMINI_API_KEY` | Google AI Studio → Create API Key |

**Exemplo preenchido:**
```env
VITE_SUPABASE_URL=https://xyzabc.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3N1cGFiYXNlLmlvIiwicmVmIjoieHl6YWJjIiwicm9sZSI6ImFub24ifQ.ABC_123xyz
SUPABASE_URL=https://xyzabc.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3N1cGFiYXNlLmlvIiwicmVmIjoieHl6YWJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSJ9.XYZ_789abc
GEMINI_API_KEY=AIzaSyDqmL9pN8vHjK2xWqRsTzI9oL4pQ5rV2sT
```

### 3.3 Salvar o arquivo

- **Não commite este arquivo no Git!** Ele contém credenciais sensíveis
- `.gitignore` já deve ter `.env` na lista

---

## **Passo 4: Validar Dependências**

Toda vez que puxa código novo, execute:

```powershell
# Ir para o diretório do projeto
cd "c:\Users\lf\Downloads\Apostilas Ponto ExSA\Licita-E vscode"

# Instalar/atualizar dependências
npm install

# Verificar se tudo está OK
npm list --depth=0
```

**Esperado:**
```
portal-licita-e@0.1.0
├── @supabase/supabase-js@2.99.2 ✅
├── react@18.3.1 ✅
├── react-dom@18.3.1 ✅
├── react-router-dom@6.30.3 ✅
├── vite@6.4.1 ✅
└── (outras dependências...)
```

---

## **Passo 5: Testar Servidor Local**

### 5.1 Iniciar o servidor

```powershell
# No diretório do projeto
npm run dev
```

**Esperado:**
```
VITE v6.4.1  local:   http://localhost:5173/
             press h + enter to show help
```

### 5.2 Abrir no navegador

1. Abra seu navegador
2. Acesse: http://localhost:5173
3. Você deve ver a tela de **LoginPage** com as cores da marca

### 5.3 Verificar console

Abra as DevTools (F12) e verifique:

- **✅ Sem erros** de credenciais Supabase
- **✅ Console limpo** (sem erros em vermelho)
- **✅ Network**: Requisições para `/api/*` funcionando

### 5.4 Parar o servidor

```powershell
# No terminal, pressione:
Ctrl + C
```

---

## **Passo 6: Deploy em Produção (Vercel)**

### 6.1 Preparar para deploy

```powershell
# Testar build
npm run build

# Isso gera a pasta `dist/` com seu app minificado
```

### 6.2 Conectar ao Vercel

1. Acesse: https://vercel.com/new
2. Clique em **"Import Git Repository"**
3. Selecione seu repositório (GitHub, GitLab, etc.)
4. Configure:
   - **Project name**: `portal-licita-e`
   - **Framework**: Vite → React
5. Em **"Environment Variables"**, adicione:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   GEMINI_API_KEY=...
   ```

### 6.3 Deploy

1. Clique em **"Deploy"**
2. Aguarde (2-5 minutos)
3. Seu app estará em: `https://seu-projeto.vercel.app`

---

## 🗂️ Estrutura Final

```
Licita-E vscode/
├── .env ...................... Variables (não commitar!)
├── .env.example .............. Template
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── index.css
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   └── DashboardPage.jsx
│   ├── services/
│   │   ├── pncpService.js
│   │   ├── geminiService.js
│   │   └── bidsService.js
│   ├── lib/
│   │   └── supabaseClient.js
│   └── config/
│       └── constants.js
├── api/
│   ├── pncp-search.js ........ Sincronização PNCP + Supabase
│   ├── analyze-edital.js ..... Análise IA (Gemini)
│   └── _shared/
│       └── filters.js ........ Configurações de busca
├── supabase/
│   └── schema.sql ............ Estrutura do banco
├── package.json
├── vite.config.js
├── tailwind.config.js
└── vercel.json
```

---

## ✅ Checklist Final

Use esta lista para garantir tudo está configurado:

- [ ] Node.js v20+ instalado
- [ ] npm v10+ instalado
- [ ] Conta Supabase criada
- [ ] Projeto Supabase criado
- [ ] SQL schema implementado no Supabase
- [ ] Credenciais Supabase copiadas
- [ ] Chave Gemini API obtida
- [ ] Arquivo `.env` criado e preenchido
- [ ] `npm install` executado com sucesso
- [ ] `npm run dev` funciona sem erros
- [ ] Página LoginPage acessível em http://localhost:5173
- [ ] Console do navegador sem erros
- [ ] (Opcional) `npm run build` gera `dist/` sem erros
- [ ] (Opcional) Deploy em Vercel com variáveis configuradas

---

## 🆘 Troubleshooting

### "Cannot find module" ou imports falhando
```powershell
rm -r node_modules
npm install
```

### "VITE_SUPABASE_URL is not defined"
- Verificar se `.env` existe na raiz do projeto
- Reiniciar o servidor: `npm run dev`

### "API key is invalid" (Gemini)
- Gerar nova chave em https://aistudio.google.com/app/apikey
- Verificar espaços em branco no `.env`

### Porta 5173 já em uso
```powershell
npm run dev -- --port 3000
# Ou mude a porta no vite.config.js
```

---

**Pronto para começar? Vamos lá! 🎯**
