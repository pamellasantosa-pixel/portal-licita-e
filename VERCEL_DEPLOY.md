# 🚀 Guia Completo: Deploy em Vercel

**Status:** Pronto para produção  
**Data:** 20 de março de 2026

---

## 📋 Pré-requisitos para Vercel

Você precisará de:
- ✅ Conta GitHub (seu código)
- ✅ Conta Vercel (grátis em https://vercel.com)
- ✅ As 6 variáveis de ambiente prontas

---

## **PASSO 1: Preparar Repositório GitHub**

### 1.1 Criar repositório no GitHub

1. Acesse https://github.com/new
2. Preencha:
   - **Repository name**: `portal-licita-e`
   - **Description**: `Portal de monitoramento de licitações com foco socioambiental`
   - **Public or Private**: Escolha sua preferência
3. Clique em **"Create repository"**

### 1.2 Fazer push do código para GitHub

```powershell
# Navegar para seu projeto
cd "c:\Users\lf\Downloads\Apostilas Ponto ExSA\Licita-E vscode"

# Inicializar git (se não estiver)
git init

# Adicionar todos os arquivos
git add .

# Fazer commit
git commit -m "Initial commit: Portal Licita-E setup completo"

# Adicionar remote (substitua seu-usuario/portal-licita-e)
git remote add origin https://github.com/seu-usuario/portal-licita-e.git

# Fazer push para main
git branch -M main
git push -u origin main
```

**Resultado esperado:**
- Seu repositório estará em: `https://github.com/seu-usuario/portal-licita-e`
- Código visível no GitHub

---

## **PASSO 2: Deploy em Vercel**

### 2.1 Conectar repositório

1. Acesse https://vercel.com/new
2. Clique em **"Import Git Repository"**
3. Cole o endereço: `https://github.com/seu-usuario/portal-licita-e`
4. Clique em **"Continue"**
5. Autorize Vercel a acessar seu GitHub

### 2.2 Configurar projeto

Na próxima tela, preencha:

- **Project name**: `portal-licita-e`
- **Framework**: Deixe como **"Vite"** (auto-detectado)
- **Root Directory**: `./` (padrão)
- **Build Command**: `npm run build` (padrão)
- **Output Directory**: `dist` (padrão)

### 2.3 Configurar variáveis de ambiente

Clique em **"Environment Variables"** e adicione as **6 variáveis**:

| Variável | Valor | Onde encontrar |
|----------|-------|-----------------|
| `VITE_SUPABASE_URL` | `https://pwrlgducyxzqwabhdnhh.supabase.co` | Seu `.env` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | Seu `.env` |
| `SUPABASE_URL` | `https://pwrlgducyxzqwabhdnhh.supabase.co` | Seu `.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_TNB3msOCfCZUg06...` | Seu `.env` |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_RINsvX9EYqB6...` | Seu `.env` |
| `GEMINI_API_KEY` | `AIzaSyBJ2e9CRwAttexCC...` | Seu `.env` |

**Como adicionar:**
1. Digite o nome da variável em **"Key"**
2. Cole o valor em **"Value"**
3. Clique em **"Save"**
4. Repita para todas as 6 variáveis

### 2.4 Deploy

Clique em **"Deploy"** e aguarde 2-5 minutos.

**Resultado:**
- Seu app estará em: `https://portal-licita-e.vercel.app`
- (ou um nome customizado que você escolher)

---

## **PASSO 3: Habilitar Deploy Automático**

Após o primeiro deploy, o Vercel já **automatiza** assim:

```
Você faz um push para GitHub
  ↓
Vercel recebe notificação
  ↓
Vercel executa: npm run build
  ↓
App automaticamente atualizado em produção
```

**Não precisa fazer mais nada!** Toda mudança em `main` atualiza o site.

---

## **PASSO 4: Verificar Domínio Customizado (Opcional)**

Se quiser um domínio próprio como `licita-e.com.br`:

1. Em Vercel, vá para **Settings → Domains**
2. Clique em **"Add Domain"**
3. Digite seu domínio
4. Configure os registros DNS do seu registrador

---

## 🔒 Segurança: Proteção de Credenciais

✅ **Feito corretamente:**

1. `.env` está no `.gitignore` (não vai pra GitHub)
2. Variáveis configuradas apenas no painel Vercel
3. Cada ambiente (dev, staging, prod) pode ter valores diferentes

⚠️ **NUNCA fazer:**
- Fazer push de `.env` para GitHub
- Colocar credenciais no código
- Compartilhar URLs com credenciais

---

## 📊 Checklist Vercel

- [ ] Repositório criado no GitHub
- [ ] Código feito push com `git push`
- [ ] Conta Vercel criada
- [ ] Repositório importado em Vercel
- [ ] Projeto nomeado como `portal-licita-e`
- [ ] **6 variáveis de ambiente adicionadas:**
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `SUPABASE_PUBLISHABLE_KEY`
  - [ ] `GEMINI_API_KEY`
- [ ] Deploy clicado e aguardado (2-5 min)
- [ ] App acessível em `https://portal-licita-e.vercel.app`
- [ ] DevTools (F12) abertos para verificar erros

---

## 🆘 Troubleshooting Vercel

### "Build failed"
1. Verifique se `npm run build` funciona localmente
2. Todas as 6 variáveis foram adicionadas?
3. `.gitignore` inclui `node_modules/`?

### "VITE_SUPABASE_URL is undefined"
- Confirme que as variáveis estão exatamente nomeadas
- Redeploy após adicionar variáveis (às vezes não pega na primeira)

### "Conexão recusada ao Supabase"
- Verifique se URL e chaves estão corretas
- Teste localmente com `npm run dev`

### App carrega mas páginas em branco
- Abra DevTools (F12)
- Console pode ter erros de autenticação
- Verifique `VITE_SUPABASE_ANON_KEY`

---

## ✅ Pronto para Produção?

Depois de fazer deploy em Vercel:

1. **Teste a análise PNCP:**
   - Clique em "Sincronizar Editais"
   - Verifique se novos dados aparecem

2. **Teste a IA:**
   - Abra um edital
   - Clique em "Analisar com IA"
   - Veja o resumo gerado

3. **Monitore em Vercel:**
   - Settings → Logs
   - Veja requisições em tempo real

4. **Configure domínio próprio** (opcional)

---

**Pronto! Seu sistema estará em produção global! 🌍**
