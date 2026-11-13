import { ExtensionErrorSchema, ExtensionStatusReplySchema } from "@careeros/shared";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../lib/log";
import { fakeBackend, fakeLocalData, fakeStorage, session } from "../../test/fakes";
import { createAuthService } from "../auth/auth-service";
import { createExternalMessageHandler } from "./external";

const DASHBOARD = "http://localhost:3000";
const fromDashboard = { origin: DASHBOARD };
const TOKEN = "t".repeat(56);

function setup(pending = 0, uploadStillRunning = false) {
  const fb = fakeBackend({ [TOKEN]: session("alice") });
  const localData = fakeLocalData(pending).localData;
  if (uploadStillRunning) localData.waitForUpload = async () => false;
  const auth = createAuthService({
    backend: fb.backend,
    storage: fakeStorage(),
    localData,
    now: () => 0,
  });
  const handle = createExternalMessageHandler({
    auth,
    dashboardOrigin: DASHBOARD,
    extensionVersion: "0.1.0",
  });
  return { handle, fb };
}

describe("external messages", () => {
  it.each([
    ["another origin", { origin: "https://evil.example" }],
    ["no origin", {}],
    ["a lookalike origin", { origin: "http://localhost:3000.evil.example" }],
    ["another extension", { origin: DASHBOARD, id: "abcdefghijklmnopabcdefghijklmnop" }],
  ])("AUTH-07 SEC-05 ignores a message from %s", async (_name, sender) => {
    const { handle, fb } = setup();
    expect(
      await handle({ type: "CONNECT", protocolVersion: 1, tokenHash: TOKEN }, sender),
    ).toBeNull();
    expect(fb.calls).toEqual([]);
  });

  it.each([
    ["an unknown type", { type: "EXPORT", protocolVersion: 1 }],
    ["a missing protocol version", { type: "PING" }],
    ["extra fields", { type: "PING", protocolVersion: 1, session: "x" }],
    ["a non-object", "PING"],
  ])("AUTH-07 ignores %s", async (_name, message) => {
    expect(await setup().handle(message, fromDashboard)).toBeNull();
  });

  it("AUTH-07a rejects a protocol version this build does not support", async () => {
    const reply = await setup().handle({ type: "PING", protocolVersion: 2 }, fromDashboard);
    expect(reply).toEqual({ ok: false, code: "UNSUPPORTED_PROTOCOL", protocolVersion: 1 });
  });

  it.each([
    ["a new message type", { type: "ENTITLEMENTS", protocolVersion: 2 }],
    ["new fields", { type: "PING", protocolVersion: 2, client: { plan: "pro" } }],
  ])(
    "AUTH-07c a newer protocol with %s is answered UNSUPPORTED_PROTOCOL, not ignored",
    async (_n, m) => {
      const { handle, fb } = setup();
      expect(await handle(m, fromDashboard)).toEqual({
        ok: false,
        code: "UNSUPPORTED_PROTOCOL",
        protocolVersion: 1,
      });
      expect(fb.calls).toEqual([]);
    },
  );

  it("AUTH-07c replies keep exactly the protocol-1 fields (released 0.2.x dashboards parse them)", async () => {
    const { handle } = setup();
    const reply = await handle({ type: "PING", protocolVersion: 1 }, fromDashboard);
    expect(Object.keys(reply ?? {}).sort()).toEqual([
      "connected",
      "extensionVersion",
      "ok",
      "protocolVersion",
    ]);
  });

  it("SYNC-06b an unexpected error is logged by kind only and answered INTERNAL", async () => {
    const lines: string[] = [];
    const fb = fakeBackend();
    fb.backend.currentSession = async () => {
      throw new TypeError("a@example.test");
    };
    const auth = createAuthService({
      backend: fb.backend,
      storage: fakeStorage(),
      localData: fakeLocalData().localData,
      now: () => 0,
    });
    const handle = createExternalMessageHandler({
      auth,
      dashboardOrigin: DASHBOARD,
      extensionVersion: "0.1.0",
      log: createLogger({ debug: false, sink: (_l, line) => lines.push(line) }),
    });
    expect(await handle({ type: "STATUS", protocolVersion: 1 }, fromDashboard)).toEqual({
      ok: false,
      code: "INTERNAL",
      protocolVersion: 1,
    });
    expect(lines).toEqual([
      '[careeros] warn external.request_failed {"type":"STATUS","kind":"TypeError"}',
    ]);
  });

  it("AUTH-07a PING/STATUS report versions and connection state", async () => {
    const { handle } = setup();
    const before = await handle({ type: "PING", protocolVersion: 1 }, fromDashboard);
    expect(ExtensionStatusReplySchema.parse(before)).toEqual({
      ok: true,
      protocolVersion: 1,
      extensionVersion: "0.1.0",
      connected: false,
    });
    await handle({ type: "CONNECT", protocolVersion: 1, tokenHash: TOKEN }, fromDashboard);
    const after = await handle({ type: "STATUS", protocolVersion: 1 }, fromDashboard);
    expect(ExtensionStatusReplySchema.parse(after)).toMatchObject({
      connected: true,
      email: "alice@example.test",
    });
  });

  it("CONNECT with a valid token connects; an invalid one reports INVALID_TOKEN", async () => {
    const { handle } = setup();
    expect(
      await handle({ type: "CONNECT", protocolVersion: 1, tokenHash: TOKEN }, fromDashboard),
    ).toEqual({
      ok: true,
      protocolVersion: 1,
      email: "alice@example.test",
    });
    const { handle: other } = setup();
    const bad = await other(
      { type: "CONNECT", protocolVersion: 1, tokenHash: "x".repeat(56) },
      fromDashboard,
    );
    expect(ExtensionErrorSchema.parse(bad).code).toBe("INVALID_TOKEN");
  });

  it("AUTH-12 DISCONNECT from the dashboard never discards unsynced data", async () => {
    const { handle, fb } = setup(3);
    fb.setCurrent(session("alice"));
    expect(await handle({ type: "DISCONNECT", protocolVersion: 1 }, fromDashboard)).toEqual({
      ok: false,
      code: "UNSYNCED_DATA",
      protocolVersion: 1,
    });
    expect(fb.calls).not.toContain("signOut");
  });

  it("AUTH-12b an upload still running maps to UNSYNCED_DATA for protocol 1 (no new code)", async () => {
    const { handle, fb } = setup(0, true);
    fb.setCurrent(session("alice"));
    const reply = await handle({ type: "DISCONNECT", protocolVersion: 1 }, fromDashboard);
    expect(ExtensionErrorSchema.parse(reply).code).toBe("UNSYNCED_DATA");
    expect(fb.calls).not.toContain("signOut");
  });

  it("unexpected failures reply INTERNAL without details", async () => {
    const { handle, fb } = setup();
    fb.backend.currentSession = async () => {
      throw new Error("storage exploded: secret details");
    };
    expect(await handle({ type: "STATUS", protocolVersion: 1 }, fromDashboard)).toEqual({
      ok: false,
      code: "INTERNAL",
      protocolVersion: 1,
    });
  });
});
