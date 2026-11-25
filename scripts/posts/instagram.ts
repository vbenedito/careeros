/**
 * PST-14: Instagram Reels on graph.facebook.com (Unified Login token, spike 0004). The token
 * goes only in the `Authorization` header; bodies are form-encoded so no URL carries a query
 * with a secret. Errors carry the HTTP status and the API error code only.
 */
import { ApiError, type FetchLike, readErrorCode, timeoutSignal } from "./mask.ts";

export const GRAPH_BASE = "https://graph.facebook.com";
export const GRAPH_VERSION = "v23.0";

export type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "PUBLISHED" | "ERROR" | "EXPIRED";

export interface InstagramApi {
  createReelContainer(input: { videoUrl: string; caption: string }): Promise<string>;
  containerStatus(containerId: string): Promise<ContainerStatus>;
  /** Polls until `FINISHED`/`PUBLISHED`; throws `ContainerFailedError` on ERROR or EXPIRED. */
  waitUntilReady(containerId: string): Promise<ContainerStatus>;
  publish(containerId: string): Promise<string>;
  permalink(mediaId: string): Promise<string | null>;
}

/** The container ended as `ERROR` or `EXPIRED` (the second one can be retried with a new URL). */
export class ContainerFailedError extends Error {
  readonly status: "ERROR" | "EXPIRED";
  constructor(status: "ERROR" | "EXPIRED") {
    super(`Instagram container ended as ${status}`);
    this.name = "ContainerFailedError";
    this.status = status;
  }
}

/** The container did not finish inside the polling budget: an unknown state, not a failure. */
export class ContainerPendingError extends Error {
  constructor() {
    super("Instagram container is still processing");
    this.name = "ContainerPendingError";
  }
}

export interface InstagramOptions {
  fetch: FetchLike;
  token: string;
  userId: string;
  baseUrl?: string;
  /** Poll budget; the spike saw FINISHED after about 22 s. */
  pollIntervalMs?: number;
  maxPolls?: number;
  sleep?: (ms: number) => Promise<void>;
}

const STATUSES: readonly string[] = ["IN_PROGRESS", "FINISHED", "PUBLISHED", "ERROR", "EXPIRED"];

/** Caption with the hashtags after a blank line (PST-14). */
export function instagramCaption(entry: { caption: string; hashtags: readonly string[] }): string {
  return entry.hashtags.length === 0
    ? entry.caption
    : `${entry.caption}\n\n${entry.hashtags.join(" ")}`;
}

export class InstagramClient implements InstagramApi {
  readonly #o: Required<Omit<InstagramOptions, "baseUrl">> & { baseUrl: string };

  constructor(options: InstagramOptions) {
    if (!/^\d+$/.test(options.userId)) throw new Error("IG_USER_ID must be digits");
    this.#o = {
      pollIntervalMs: 5000,
      maxPolls: 60,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      ...options,
      baseUrl: (options.baseUrl ?? GRAPH_BASE).replace(/\/$/, ""),
    };
  }

  async #call(
    method: "GET" | "POST",
    path: string,
    form?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const init: RequestInit = {
      method,
      signal: timeoutSignal(),
      headers: {
        Authorization: `Bearer ${this.#o.token}`,
        ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
    };
    if (form) init.body = new URLSearchParams(form).toString();
    const response = await this.#o.fetch(`${this.#o.baseUrl}/${GRAPH_VERSION}/${path}`, init);
    if (!response.ok)
      throw new ApiError("Instagram", response.status, await readErrorCode(response));
    const body: unknown = await response.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  }

  async #idOf(body: Record<string, unknown>): Promise<string> {
    if (typeof body.id !== "string" || body.id === "")
      throw new ApiError("Instagram", 200, "no_id");
    return body.id;
  }

  async createReelContainer(input: { videoUrl: string; caption: string }): Promise<string> {
    const body = await this.#call("POST", `${this.#o.userId}/media`, {
      media_type: "REELS",
      video_url: input.videoUrl,
      caption: input.caption,
      share_to_feed: "true",
    });
    return this.#idOf(body);
  }

  async containerStatus(containerId: string): Promise<ContainerStatus> {
    const body = await this.#call("GET", `${encodeURIComponent(containerId)}?fields=status_code`);
    const code = body.status_code;
    if (typeof code !== "string" || !STATUSES.includes(code))
      throw new ApiError("Instagram", 200, "bad_status");
    return code as ContainerStatus;
  }

  async waitUntilReady(containerId: string): Promise<ContainerStatus> {
    for (let i = 0; i < this.#o.maxPolls; i++) {
      const status = await this.containerStatus(containerId);
      if (status === "FINISHED" || status === "PUBLISHED") return status;
      if (status === "ERROR" || status === "EXPIRED") throw new ContainerFailedError(status);
      await this.#o.sleep(this.#o.pollIntervalMs);
    }
    throw new ContainerPendingError();
  }

  async publish(containerId: string): Promise<string> {
    const body = await this.#call("POST", `${this.#o.userId}/media_publish`, {
      creation_id: containerId,
    });
    return this.#idOf(body);
  }

  async permalink(mediaId: string): Promise<string | null> {
    const body = await this.#call("GET", `${encodeURIComponent(mediaId)}?fields=permalink`);
    return typeof body.permalink === "string" ? body.permalink : null;
  }
}
