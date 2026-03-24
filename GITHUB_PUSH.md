# 📝 Próximos Passos: GitHub e Vercel

**Status Atual:** ✅ Com comitado localmente  
**Próximo:** Fazer push para GitHub

---

## **PASSO 1: Criar Repositório no GitHub**

### 1.1 Abra GitHub

Acesse: https://github.com/new

### 1.2 Preencha os dados

```
Repository name: portal-licita-e
Description: Portal de monitoramento de licitações com foco socioambiental
Visibility: Public (ou Private, sua escolha)
```

### 1.3 Clique "Create repository"

Após criar, você verá uma página com comandos. **NÃO execute os comandos lá**, pois vamos usar os nossos abaixo.

---

## **PASSO 2: Fazer Push para GitHub**

Na sua máquina, execute estes comandos (substitua `seu-usuario` pelo seu username do GitHub):

```powershell
cd "c:\Users\lf\Downloads\Apostilas Ponto ExSA\Licita-E vscode"

# Adicionar repositório remoto
git remote add origin https://github.com/seu-usuario/portal-licita-e.git

# Renomear branch para main (se necessário)
git branch -M main

# Fazer push
git push -u origin main
```

**Primeira vez:** GitHub pedirá autenticação. Use:
- **Opção 1:** Pessoal Access Token (recomendado)
  - Crie em: https://github.com/settings/tokens
  - Marque: `repo` (acesso completo)
  - Cole ao invés de senha
  
- **Opção 2:** SSH Key
  - Se configurou SSH antes

---

## **PASSO 3: Verificar Push**

Depois de fazer push, acesse:
```
https://github.com/seu-usuario/portal-licita-e
```

Você deve ver todos os seus arquivos lá! ✅

---

## **PASSO 4: Deploy em Vercel**

Depois que código está no GitHub:

1. Acesse: https://vercel.com/new
2. Clique em **"Import Git Repository"**
3. Cole: `https://github.com/seu-usuario/portal-licita-e`
4. Clique **"Continue"**
5. Autorize Vercel no GitHub
6. Configure projeto:
   - **Project name**: `portal-licita-e`
   - **Framework**: Vite
7. **Variáveis de Ambiente:** Adicione 6:
   ```
   VITE_SUPABASE_URL = https://pwrlgducyxzqwabhdnhh.supabase.co
   VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_URL = https://pwrlgducyxzqwabhdnhh.supabase.co
   SUPABASE_SERVICE_ROLE_KEY = sb_secret_TNB3msOCfCZUg06Rns2LDg...
   SUPABASE_PUBLISHABLE_KEY = sb_publishable_RINsvX9EYqB6aN1n6...
   GEMINI_API_KEY = AIzaSyBJ2e9CRwAttexCC_kORiwfnt...
   ```
8. Clique **"Deploy"**
9. Aguarde 2-5 minutos ⏳

**App estará em:**
```
https://portal-licita-e.vercel.app
```

---

## ⚡ Comandos Rápidos

```powershell
# Fazer push (próximas vezes - simples)
git push

# Ver histórico
git log

# Ver status
git status

# Ver repositórios remotos
git remote -v
```

---

## 🆘 Se der erro no push

### "fatal: 'origin' does not appear to be a git repository"
```powershell
git remote add origin https://github.com/seu-usuario/portal-licita-e.git
git branch -M main
git push -u origin main
```

### "Authentication failed"
```powershell
# Gere novo token em: https://github.com/settings/tokens
# Use o token ao invés de senha
```

### "RejectedByGitHub"
```powershell
# Verifique se o repositório existe em GitHub
# Acesse: https://github.com/novo-usuario/portal-licita-e
```

---

⚠️ **IMPORTANTE:**

- **NÃO commite `.env`** (já está em `.gitignore`)
- **Variáveis sensíveis apenas no Vercel**
- Após primeiro push, deploy automático em cada `git push` 🚀

---

**Pronto! Siga os passos acima e seu app estará em produção!**
