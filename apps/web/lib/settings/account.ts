/** What the user types to confirm account deletion (DASH-14). */
export const DELETE_CONFIRMATION = "DELETE";

const PROVIDERS: Record<string, string> = { github: "GitHub", google: "Google" };

/** "GitHub", "Google", or null when unknown. */
export function providerLabel(provider: unknown): string | null {
  return typeof provider === "string" ? (PROVIDERS[provider] ?? null) : null;
}
