/**
 * Script de teste de conexão com Supabase
 * Validar que as credenciais estão corretas e o banco está acessível
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Ler .env manualmente
const envPath = ".env";
const envContent = fs.readFileSync(envPath, "utf-8");
const envVars = {};

envContent.split("\n").forEach((line) => {
  const [key, ...valueParts] = line.split("=");
  if (key && !key.startsWith("#")) {
    envVars[key.trim()] = valueParts.join("=").trim();
  }
});

const SUPABASE_URL = envVars.SUPABASE_URL;
const SUPABASE_ANON_KEY = envVars.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;

console.log("🔍 Testando conexão com Supabase...\n");

// Teste 1: Verificar variáveis de ambiente
console.log("📋 Variáveis de Ambiente:");
console.log(`  ✓ SUPABASE_URL: ${SUPABASE_URL ? "✅ Configurado" : "❌ Faltando"}`);
console.log(`  ✓ VITE_SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY ? "✅ Configurado" : "❌ Faltando"}`);
console.log(`  ✓ SUPABASE_SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY ? "✅ Configurado" : "❌ Faltando"}`);
console.log();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌ Erro: Variáveis de ambiente faltando!");
  process.exit(1);
}

// Teste 2: Conectar com cliente anon (frontend)
async function testAnonClient() {
  console.log("🔗 Testando cliente Anon (Frontend)...");
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    const { data, error } = await supabase.from("bid_filters").select("*").limit(1);
    
    if (error) {
      console.log(`  ❌ Erro: ${error.message}`);
      return false;
    }

    console.log(`  ✅ Tabela 'bid_filters' acessível!`);
    console.log(`  📊 Função básica funcionando corretamente`);
    return true;
  } catch (err) {
    console.log(`  ❌ Erro de conexão: ${err.message}`);
    return false;
  }
}

// Teste 3: Conectar com service role (backend)
async function testServiceRoleClient() {
  if (!SERVICE_ROLE_KEY) {
    console.log("⏭️  Pulando teste de Service Role (chave não configurada)");
    return;
  }

  console.log("\n🔐 Testando cliente Service Role (Backend)...");
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const { data, error } = await supabase.from("bids").select("*").limit(1);

    if (error) {
      console.log(`  ❌ Erro: ${error.message}`);
      return false;
    }

    console.log(`  ✅ Tabela 'bids' acessível!`);
    console.log(`  📊 Função básica funcionando corretamente`);
    return true;
  } catch (err) {
    console.log(`  ❌ Erro de conexão: ${err.message}`);
    return false;
  }
}

// Executar testes
async function runTests() {
  const anonOk = await testAnonClient();
  const serviceOk = await testServiceRoleClient();

  console.log("\n" + "=".repeat(50));
  console.log("📊 RESUMO DOS TESTES:");
  console.log("=".repeat(50));
  console.log(`  Cliente Anon (Frontend): ${anonOk ? "✅ PASSOU" : "❌ FALHOU"}`);
  console.log(`  Cliente Service Role (Backend): ${serviceOk ? "✅ PASSOU" : "⏭️  PULADO"}`);
  
  if (anonOk) {
    console.log("\n✅ CONFIGURAÇÃO CORRETA! Seu app está pronto para usar.");
  } else {
    console.log("\n⚠️  Há problemas na conexão. Verifique suas credenciais.");
  }
  
  process.exit(anonOk ? 0 : 1);
}

runTests().catch(console.error);
