/** Argument parsing of `run.ts` (pure, so it can be tested). */
import { POST_TIME } from "../../packages/shared/src/posts.ts";

export interface Args {
  command: string;
  opsDir: string | null;
  opsRepo: string | null;
  dryRun: boolean;
  now: Date;
  postTime: string;
}

export function parseCli(argv: readonly string[], env: Record<string, string | undefined>): Args {
  const [command = "", ...rest] = argv;
  const args: Args = {
    command,
    opsDir: null,
    opsRepo: null,
    dryRun: false,
    now: new Date(),
    postTime: env.POST_TIME ?? POST_TIME,
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    const value = rest[++i];
    if (value === undefined) throw new Error(`${arg} needs a value`);
    if (arg === "--ops-dir") args.opsDir = value;
    else if (arg === "--ops-repo") args.opsRepo = value;
    else if (arg === "--post-time") args.postTime = value;
    else if (arg === "--now") {
      args.now = new Date(value);
      if (Number.isNaN(args.now.getTime())) throw new Error("--now must be an ISO 8601 date-time");
    } else throw new Error(`unknown option ${arg}`);
  }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(args.postTime))
    throw new Error("--post-time must be HH:MM");
  return args;
}
