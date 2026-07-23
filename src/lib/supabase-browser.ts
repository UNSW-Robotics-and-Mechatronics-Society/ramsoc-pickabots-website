import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser-safe Supabase client, used ONLY for Realtime subscriptions on the
// public page (e.g. live voting open/close). It uses the publishable/anon key
// (safe to expose) and relies on the table's public-read RLS policy — never the
// secret key. Returns null when the anon key isn't configured, so callers can
// fall back to polling.
let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 2 } },
    });
  }
  return client;
}
