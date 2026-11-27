/** Reads the record files of an ops checkout (`posts/YYYY/*.json`). */
import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RecordFile } from "./scheduler.ts";

export async function readRecords(opsDir: string): Promise<RecordFile[]> {
  const files: RecordFile[] = [];
  const root = join(opsDir, "posts");
  let years: Dirent[];
  try {
    years = await readdir(root, { withFileTypes: true });
  } catch (error) {
    // No posts/ directory yet: no records.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return files;
    throw error;
  }
  for (const year of years) {
    if (!year.isDirectory()) continue;
    for (const name of await readdir(join(root, year.name))) {
      if (!name.endsWith(".json")) continue;
      files.push({
        path: `posts/${year.name}/${name}`,
        text: await readFile(join(root, year.name, name), "utf8"),
      });
    }
  }
  return files;
}
