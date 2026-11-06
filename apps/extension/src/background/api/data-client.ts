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
    // No token (not connected, or refresh temporarily unavailable): fail the request instead of
    // sending it anonymously — an anonymous 401 would look like a revoked session (AUTH-11).
    accessToken: async () => {
      const token = await config.accessToken();
      if (!token) throw new Error("NO_ACCESS_TOKEN");
      return token;
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
