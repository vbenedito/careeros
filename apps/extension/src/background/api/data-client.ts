/**
 * Supabase data client for the worker (AUTH-10). It never stores or refreshes a session itself:
 * every request asks AuthService for a valid access token.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createDataClient(config: {
  supabaseUrl: string;
  publishableKey: string;
  accessToken: () => Promise<string | null>;
}): SupabaseClient {
  return createClient(config.supabaseUrl, config.publishableKey, {
    accessToken: async () => (await config.accessToken()) ?? "",
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
