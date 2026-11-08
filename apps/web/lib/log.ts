/**
 * Server-side error log for Vercel runtime logs (ENV-11). One JSON line per event, with error
 * codes and short technical messages only: never emails, tokens, cookies, URLs or user input
 * (SEC-06 spirit).
 */
export function logServerError(event: string, fields: Record<string, string | number | null>) {
  console.error(JSON.stringify({ level: "error", event, ...fields }));
}

/** The non-personal parts of a Supabase/PostgREST or Auth error. */
export function errorFields(error: { code?: unknown; status?: unknown; message?: unknown }) {
  return {
    code: typeof error.code === "string" ? error.code : null,
    status: typeof error.status === "number" ? error.status : null,
    // Database and API error messages name functions and constraints, not user data; cap them.
    message: typeof error.message === "string" ? error.message.slice(0, 200) : null,
  };
}
