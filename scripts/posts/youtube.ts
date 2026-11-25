/**
 * PST-14a: YouTube Shorts through a resumable `videos.insert`. The access token is made from the
 * refresh token on each run and never stored; the upload-session URI works like a bearer link, so
 * the caller masks it and keeps it in memory only. No `publishAt`; `containsSyntheticMedia` is not
 * sent (the PST-15 guard keeps `ai_label: true` posts away from this client).
 */
import { ApiError, type FetchLike, readErrorCode } from "./mask.ts";

export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
export const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
/** "People & Blogs"; the API wants a category on insert. Not in the spec: to confirm at the first post. */
export const YT_CATEGORY_ID = "22";

export interface YoutubeVideoStatus {
  privacyStatus: string;
  uploadStatus: string | null;
  rejected: boolean;
}

export interface YoutubeApi {
  /** An access token from the refresh token. The caller masks it before any use. */
  accessToken(): Promise<string>;
  /** Starts the resumable upload; returns the session URI. The caller masks it. */
  startUpload(
    token: string,
    input: { title: string; description: string; size: number },
  ): Promise<string>;
  /** Sends the bytes to the session URI; returns the video id. */
  upload(sessionUri: string, bytes: Uint8Array): Promise<string>;
  /** `null` when the video is not found. */
  videoStatus(token: string, videoId: string): Promise<YoutubeVideoStatus | null>;
}

export interface YoutubeOptions {
  fetch: FetchLike;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/** Description = caption, hashtags and the text version (PST-14a). */
export function youtubeDescription(entry: {
  caption: string;
  hashtags: readonly string[];
  text_version: string;
}): string {
  const parts = [entry.caption];
  if (entry.hashtags.length > 0) parts.push(entry.hashtags.join(" "));
  if (entry.text_version.trim() !== "") parts.push(entry.text_version);
  return parts.join("\n\n");
}

export class YoutubeClient implements YoutubeApi {
  readonly #o: YoutubeOptions;
  constructor(options: YoutubeOptions) {
    this.#o = options;
  }

  async accessToken(): Promise<string> {
    const response = await this.#o.fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.#o.clientId,
        client_secret: this.#o.clientSecret,
        refresh_token: this.#o.refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
    if (!response.ok) throw new ApiError("YouTube", response.status, await readErrorCode(response));
    const body = (await response.json()) as { access_token?: unknown };
    if (typeof body.access_token !== "string" || body.access_token === "") {
      throw new ApiError("YouTube", 200, "no_access_token");
    }
    return body.access_token;
  }

  async startUpload(
    token: string,
    input: { title: string; description: string; size: number },
  ): Promise<string> {
    const response = await this.#o.fetch(`${UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(input.size),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify({
        snippet: { title: input.title, description: input.description, categoryId: YT_CATEGORY_ID },
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      }),
    });
    if (!response.ok) throw new ApiError("YouTube", response.status, await readErrorCode(response));
    const location = response.headers.get("location");
    if (!location) throw new ApiError("YouTube", response.status, "no_session_uri");
    return location;
  }

  async upload(sessionUri: string, bytes: Uint8Array): Promise<string> {
    const response = await this.#o.fetch(sessionUri, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.byteLength) },
      body: bytes as unknown as NonNullable<RequestInit["body"]>,
    });
    if (!response.ok) throw new ApiError("YouTube", response.status, await readErrorCode(response));
    const body = (await response.json()) as { id?: unknown };
    if (typeof body.id !== "string" || body.id === "")
      throw new ApiError("YouTube", response.status, "no_video_id");
    return body.id;
  }

  async videoStatus(token: string, videoId: string): Promise<YoutubeVideoStatus | null> {
    const query = new URLSearchParams({ part: "status", id: videoId });
    const response = await this.#o.fetch(`${VIDEOS_URL}?${query}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new ApiError("YouTube", response.status, await readErrorCode(response));
    const body = (await response.json()) as { items?: { status?: Record<string, unknown> }[] };
    const status = body.items?.[0]?.status;
    if (!status) return null;
    const upload = typeof status.uploadStatus === "string" ? status.uploadStatus : null;
    return {
      privacyStatus: typeof status.privacyStatus === "string" ? status.privacyStatus : "unknown",
      uploadStatus: upload,
      rejected:
        upload === "rejected" || upload === "failed" || typeof status.rejectionReason === "string",
    };
  }
}
