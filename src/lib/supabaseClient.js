import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // O projeto sobe sem quebrar em dev, mas indica variaveis ausentes.
  // eslint-disable-next-line no-console
  console.warn("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env");
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");
