import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the secret key.
 * Shares the same Supabase project as the sumobots site.
 * Never import this into a Client Component.
 */
export function getSupabaseSecretClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(url, key);
}
