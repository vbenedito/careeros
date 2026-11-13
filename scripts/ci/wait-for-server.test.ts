import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve(import.meta.dirname, "wait-for-server.sh");
const run = (args: string[], env: Record<string, string> = {}) =>
  new Promise<{ status: number | null; stderr: string }>((done) => {
    const child = spawn("bash", [script, ...args], { env: { ...process.env, ...env } });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => done({ status, stderr }));
  });

describe("wait-for-server.sh", () => {
  it("TEST-06 fails clearly when nothing ever listens", async () => {
    const { status, stderr } = await run(["http://127.0.0.1:1/never"], {
      WAIT_ATTEMPTS: "3",
      WAIT_DELAY: "0",
    });
    expect(status).toBe(1);
    expect(stderr).toContain("did not answer after 3 attempts");
  });

  it("TEST-06 fails at once, with the server log, when the server process died", async () => {
    // A process that has already exited: its pid is no longer alive.
    const child = spawn("bash", ["-c", "exit 0"]);
    await new Promise((done) => child.on("close", done));
    const { status, stderr } = await run(
      ["http://127.0.0.1:1/never", String(child.pid), "/dev/null"],
      { WAIT_ATTEMPTS: "50", WAIT_DELAY: "0" },
    );
    expect(status).toBe(1);
    expect(stderr).toContain("exited before");
  });

  it("TEST-06 succeeds as soon as the server answers", async () => {
    const server = createServer((_req, res) => res.end("ok"));
    await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
    const { port } = server.address() as { port: number };
    try {
      const { status } = await run([`http://127.0.0.1:${port}/`], { WAIT_DELAY: "0" });
      expect(status).toBe(0);
    } finally {
      server.close();
    }
  });
});
