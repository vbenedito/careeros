import { afterEach, describe, expect, it, vi } from "vitest";
import { sendToExtension } from "./messenger";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A runtime whose extension answers after `delayMs`. */
function extensionAnsweringAfter(delayMs: number) {
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: (_id: string, _msg: unknown, cb: (reply: unknown) => void) =>
        setTimeout(() => cb({ ok: true, protocolVersion: 1 }), delayMs),
    },
  });
}

describe("sendToExtension", () => {
  it("no extension → undefined", async () => {
    expect(await sendToExtension("id", { type: "PING" })).toBeUndefined();
  });

  it("quick messages give up after 2 s", async () => {
    vi.useFakeTimers();
    extensionAnsweringAfter(5000);
    const reply = sendToExtension("id", { type: "PING" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await reply).toBeUndefined();
  });

  it("AUTH-12 DISCONNECT waits for the final sync and revoke", async () => {
    vi.useFakeTimers();
    extensionAnsweringAfter(8000);
    const reply = sendToExtension("id", { type: "DISCONNECT" });
    await vi.advanceTimersByTimeAsync(8000);
    expect(await reply).toEqual({ ok: true, protocolVersion: 1 });
  });
});
