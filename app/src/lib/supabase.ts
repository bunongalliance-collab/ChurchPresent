import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Set these in app/.env.local (not committed): VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
// Without them the app runs in browser-only mode, the same as lyrics.html without supabase-config.js.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;
