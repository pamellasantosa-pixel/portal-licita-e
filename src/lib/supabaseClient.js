import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente de build.");
} else {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Falha ao inicializar Supabase:", error);
  }
}

export { supabase };

export function getSupabaseClientOrThrow() {
  if (!supabase) {
    throw new Error("Supabase nao configurado no ambiente. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no Vercel e faca um redeploy.");
  }

  return supabase;
}
