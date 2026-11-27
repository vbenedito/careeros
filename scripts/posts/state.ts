/**
 * PST-07, PST-13: pipeline state per post, committed and pushed to the ops repository before the
 * step that makes a post public. A push that fails after one `pull --rebase` throws
 * `StatePushError`: the run stops before any further publish step.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type PostState,
  PostStateSchema,
  type PostTokens,
  PostTokensSchema,
} from "../../packages/shared/src/posts.ts";

export class StatePushError extends Error {
  constructor() {
    super("the state commit could not be pushed");
    this.name = "StatePushError";
  }
}

export interface StateStore {
  /** `null` when the post has no state file. */
  read(stem: string): Promise<PostState | null>;
  write(stem: string, state: PostState): Promise<void>;
  /** PST-22 step 5: expiry dates of the tokens (never a value); `null` when there is no file. */
  readTokens(): Promise<PostTokens | null>;
  writeTokens(tokens: PostTokens): Promise<void>;
  /** Commits what was written and pushes it; throws `StatePushError` when the push fails. */
  commitAndPush(message: string): Promise<void>;
}

export const TOKENS_PATH = "posts-state/tokens.json";

export const emptyState = (): PostState => ({ schema: 1, platforms: {} });

/** `posts-state/YYYY/<stem>.json` */
export const statePath = (stem: string): string => `posts-state/${stem.slice(0, 4)}/${stem}.json`;

export function parseState(text: string): PostState {
  return PostStateSchema.parse(JSON.parse(text));
}

export class MemoryStateStore implements StateStore {
  readonly files = new Map<string, string>();
  readonly commits: string[] = [];
  /** Test hook: how many following pushes fail. */
  failPushes = 0;

  async read(stem: string): Promise<PostState | null> {
    const text = this.files.get(stem);
    return text === undefined ? null : parseState(text);
  }
  async write(stem: string, state: PostState): Promise<void> {
    this.files.set(stem, `${JSON.stringify(PostStateSchema.parse(state), null, 2)}\n`);
  }
  tokensText: string | null = null;
  async readTokens(): Promise<PostTokens | null> {
    return this.tokensText === null ? null : PostTokensSchema.parse(JSON.parse(this.tokensText));
  }
  async writeTokens(tokens: PostTokens): Promise<void> {
    this.tokensText = `${JSON.stringify(PostTokensSchema.parse(tokens), null, 2)}\n`;
  }
  async commitAndPush(message: string): Promise<void> {
    if (this.failPushes > 0) {
      this.failPushes--;
      throw new StatePushError();
    }
    this.commits.push(message);
  }
}

export interface ExecResult {
  code: number;
}
/** Runs a command without a shell; the output is never returned (it could hold a URL). */
export type Exec = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<ExecResult>;

export const nodeExec: Exec = (command, args, options) =>
  new Promise((resolve) => {
    execFile(command, args, { cwd: options.cwd, maxBuffer: 10 * 1024 * 1024 }, (error) => {
      const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
      resolve({ code });
    });
  });

const GIT_IDENTITY = [
  "-c",
  "user.name=github-actions[bot]",
  "-c",
  "user.email=41898282+github-actions[bot]@users.noreply.github.com",
];

/** State files in a checkout of the ops repository, committed with git. */
export class GitStateStore implements StateStore {
  readonly #dir: string;
  readonly #exec: Exec;

  constructor(dir: string, exec: Exec = nodeExec) {
    this.#dir = dir;
    this.#exec = exec;
  }

  async read(stem: string): Promise<PostState | null> {
    try {
      return parseState(await readFile(join(this.#dir, statePath(stem)), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async write(stem: string, state: PostState): Promise<void> {
    const file = join(this.#dir, statePath(stem));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(PostStateSchema.parse(state), null, 2)}\n`);
  }

  async readTokens(): Promise<PostTokens | null> {
    try {
      return PostTokensSchema.parse(
        JSON.parse(await readFile(join(this.#dir, TOKENS_PATH), "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async writeTokens(tokens: PostTokens): Promise<void> {
    const file = join(this.#dir, TOKENS_PATH);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(PostTokensSchema.parse(tokens), null, 2)}\n`);
  }

  async commitAndPush(message: string): Promise<void> {
    const git = (...args: string[]) => this.#exec("git", args, { cwd: this.#dir });
    if ((await git("add", "--", "posts-state")).code !== 0) throw new StatePushError();
    if ((await git("diff", "--cached", "--quiet")).code === 0) return; // nothing to commit
    if ((await git(...GIT_IDENTITY, "commit", "-m", message)).code !== 0)
      throw new StatePushError();
    if ((await git("push")).code === 0) return;
    if ((await git(...GIT_IDENTITY, "pull", "--rebase")).code !== 0) {
      await git("rebase", "--abort");
      throw new StatePushError();
    }
    if ((await git("push")).code !== 0) throw new StatePushError();
  }
}
