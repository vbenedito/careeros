import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Supabase admin client with the SECRET key (SEC-07). Server-only: import it exclusively from
 * route handlers, never from a client component (the key must never reach the browser);
 * the `server-only` import turns such an import into a build error.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("Missing environment variable SUPABASE_SECRET_KEY");
  return createClient(publicEnv().supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
