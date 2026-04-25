import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null when URL/key missing so the app can show a config message instead of a blank window. */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;
