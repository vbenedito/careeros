/**
 * PST-22, PST-22.1, PST-23: the daily token checks. Instagram (`debug_token` with the app token),
 * YouTube (refresh, scopes, `channels.list`) and the secret-writing PAT (expiry header). Every value
 * that grants access is masked before use (PST-20); results hold the expiry date or a verdict only,
 * never a value, a header or a URL with a query string.
 */

import { GRAPH_BASE, GRAPH_VERSION } from "./instagram.ts";
import { ApiError, type FetchLike, mask, type Out, readErrorCode, timeoutSignal } from "./mask.ts";
import { TOKEN_URL } from "./youtube.ts";

export const YT_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;
export const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";
export const PAT_EXPIRY_HEADER = "github-authentication-token-expiration";
const DAY_MS = 86_400_000;

export interface TokenVerdict {
  /** Problems that need an alert (empty when the token is fine). */
  problems: string[];
  /** Expiry date `YYYY-MM-DD` or null when there is none. Never a value. */
  expiresOn: string | null;
  /** The check could not give a verdict (network error, 5xx): logged, no alert. */
  unknown?: boolean;
}

const dateOf = (epochSeconds: number): string =>
  new Date(epochSeconds * 1000).toISOString().slice(0, 10);

/** PST-22.1: Instagram system-user token, checked with the app token. */
export async function checkInstagramToken(input: {
  fetch: FetchLike;
  accessToken: string;
  appId: string;
  appSecret: string;
  now: Date;
  warnDays: number;
  out: Out;
}): Promise<TokenVerdict> {
  // PST-20: the three values and the joined app token are masked before the call.
  mask(input.accessToken, input.out);
  mask(input.appId, input.out);
  mask(input.appSecret, input.out);
  const appToken = mask(`${input.appId}|${input.appSecret}`, input.out);
  const query = new URLSearchParams({ input_token: input.accessToken });
  let response: Response;
  try {
    response = await input.fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/debug_token?${query}`, {
      method: "GET",
      signal: timeoutSignal(),
      headers: { Authorization: `Bearer ${appToken}` },
    });
  } catch {
    return { problems: [], expiresOn: null, unknown: true };
  }
  if (!response.ok) {
    const code = await readErrorCode(response);
    const error = new ApiError("Instagram", response.status, code);
    if (response.status >= 500) return { problems: [], expiresOn: null, unknown: true };
    return {
      problems: [
        `The token check was refused (http_status=${error.http_status}, code=${code ?? "none"}).`,
      ],
      expiresOn: null,
    };
  }
  const body = (await response.json().catch(() => null)) as {
    data?: Record<string, unknown>;
  } | null;
  const data = body?.data ?? {};
  const problems: string[] = [];
  if (data.is_valid !== true) problems.push("The Instagram token is no longer valid.");
  const times = [data.expires_at, data.data_access_expires_at].filter(
    (v): v is number => typeof v === "number" && v > 0,
  );
  const expiry = times.length > 0 ? Math.min(...times) : null;
  if (expiry !== null) {
    const days = (expiry * 1000 - input.now.getTime()) / DAY_MS;
    if (days < input.warnDays) {
      problems.push(
        `The Instagram token has an expiry date (${dateOf(expiry)}), less than ${input.warnDays} days away.`,
      );
    }
  }
  const scopes = Array.isArray(data.scopes) ? data.scopes : [];
  if (!scopes.includes("instagram_content_publish")) {
    problems.push("The Instagram token lacks the permission instagram_content_publish.");
  }
  return { problems, expiresOn: expiry === null ? null : dateOf(expiry) };
}

/** PST-22 step 3: refresh, scopes, and a 200 from `channels.list?part=id&mine=true`. */
export async function checkYoutubeToken(input: {
  fetch: FetchLike;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  out: Out;
}): Promise<TokenVerdict> {
  mask(input.clientSecret, input.out);
  mask(input.refreshToken, input.out);
  let refresh: Response;
  try {
    refresh = await input.fetch(TOKEN_URL, {
      method: "POST",
      signal: timeoutSignal(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        refresh_token: input.refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
  } catch {
    return { problems: [], expiresOn: null, unknown: true };
  }
  if (!refresh.ok) {
    if (refresh.status >= 500) return { problems: [], expiresOn: null, unknown: true };
    const code = await readErrorCode(refresh);
    return {
      problems: [
        `The YouTube refresh was refused (http_status=${refresh.status}, code=${code ?? "none"}).`,
      ],
      expiresOn: null,
    };
  }
  const body = (await refresh.json().catch(() => null)) as {
    access_token?: unknown;
    scope?: unknown;
  } | null;
  if (typeof body?.access_token !== "string" || body.access_token === "") {
    return { problems: ["The YouTube refresh returned no access token."], expiresOn: null };
  }
  const access = mask(body.access_token, input.out);
  const granted = typeof body.scope === "string" ? body.scope.split(/\s+/) : [];
  const problems = YT_SCOPES.filter((s) => !granted.includes(s)).map(
    (s) => `The YouTube token lacks the scope ${s.split("/").pop()}.`,
  );
  try {
    const channels = await input.fetch(`${CHANNELS_URL}?part=id&mine=true`, {
      method: "GET",
      signal: timeoutSignal(),
      headers: { Authorization: `Bearer ${access}` },
    });
    if (channels.status !== 200) {
      problems.push(`channels.list answered http_status=${channels.status} instead of 200.`);
    }
  } catch {
    return { problems, expiresOn: null, unknown: problems.length === 0 };
  }
  return { problems, expiresOn: null };
}

/** The expiry date of the PAT from the response header of a GitHub call made with it. */
export function parsePatExpiry(header: string | null): string | null {
  if (!header) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T]\d{2}:\d{2}:\d{2}/.exec(header.trim());
  return m ? (m[1] as string) : null;
}

export async function checkOpsPat(input: {
  fetch: FetchLike;
  token: string;
  repo: string;
  now: Date;
  warnDays: number;
  out: Out;
}): Promise<TokenVerdict> {
  mask(input.token, input.out);
  let response: Response;
  try {
    response = await input.fetch(
      `https://api.github.com/repos/${input.repo}/actions/secrets/public-key`,
      {
        method: "GET",
        signal: timeoutSignal(),
        headers: {
          Authorization: `Bearer ${input.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "careeros-posts",
        },
      },
    );
  } catch {
    return { problems: [], expiresOn: null, unknown: true };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      problems: [
        `OPS_SECRETS_PAT was refused (http_status=${response.status}); it may have expired.`,
      ],
      expiresOn: null,
    };
  }
  if (!response.ok) return { problems: [], expiresOn: null, unknown: true };
  const expiresOn = parsePatExpiry(response.headers.get(PAT_EXPIRY_HEADER));
  const problems: string[] = [];
  if (expiresOn !== null) {
    const days = (new Date(`${expiresOn}T00:00:00Z`).getTime() - input.now.getTime()) / DAY_MS;
    if (days < input.warnDays) {
      problems.push(
        `OPS_SECRETS_PAT expires on ${expiresOn}, less than ${input.warnDays} days away.`,
      );
    }
  }
  return { problems, expiresOn };
}
