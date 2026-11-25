/** PST-09: width, height and length of the video, read with `ffprobe` (a file in a temp folder). */
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VideoProbe } from "./approval.ts";

/** Pure: the numbers from `ffprobe -print_format json -show_streams -show_format`. */
export function parseFfprobe(json: string): { width: number; height: number; durationS: number } {
  const data = JSON.parse(json) as {
    streams?: { codec_type?: string; width?: number; height?: number }[];
    format?: { duration?: string };
  };
  const video = data.streams?.find((s) => s.codec_type === "video");
  const duration = Number(data.format?.duration);
  if (!video?.width || !video.height || !Number.isFinite(duration)) {
    throw new Error("ffprobe: no video stream or duration");
  }
  return { width: video.width, height: video.height, durationS: duration };
}

export const ffprobeVideo: VideoProbe = async (bytes) => {
  const dir = await mkdtemp(join(tmpdir(), "posts-probe-"));
  try {
    const file = join(dir, "video.mp4");
    await writeFile(file, bytes);
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        "ffprobe",
        ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file],
        { maxBuffer: 10 * 1024 * 1024 },
        (error, out) => (error ? reject(new Error("ffprobe failed")) : resolve(out)),
      );
    });
    return parseFfprobe(stdout);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
