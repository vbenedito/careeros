import { describe, expect, it } from "vitest";
import { interpretConnect, interpretDisconnect, interpretStatus } from "./protocol";

const PROTOCOL_VERSION = 1;

const status = (over: Record<string, unknown> = {}) => ({
  ok: true,
  protocolVersion: 1,
  extensionVersion: "0.1.0",
  connected: false,
  ...over,
});
const error = (code: string) => ({ ok: false, code, protocolVersion: 1 });

describe("interpretStatus (AUTH-07a)", () => {
  it("treats no reply as not installed", () => {
    expect(interpretStatus(undefined)).toEqual({ kind: "not-installed" });
    expect(interpretStatus(null)).toEqual({ kind: "not-installed" });
  });

  it("treats a reply without a protocol version as not installed", () => {
    expect(interpretStatus({ hello: "world" })).toEqual({ kind: "not-installed" });
    expect(interpretStatus("pong")).toEqual({ kind: "not-installed" });
  });

  it("reports not connected and connected", () => {
    expect(interpretStatus(status())).toEqual({ kind: "not-connected", extensionVersion: "0.1.0" });
    expect(interpretStatus(status({ connected: true, email: "a@example.com" }))).toEqual({
      kind: "connected",
      extensionVersion: "0.1.0",
      email: "a@example.com",
    });
  });

  it("does not report success when the extension holds a different account", () => {
    const reply = status({ connected: true, email: "Bob@example.com" });
    expect(interpretStatus(reply, "alice@example.com")).toEqual({
      kind: "other-account",
      email: "Bob@example.com",
    });
    expect(interpretStatus(reply, "bob@example.com")).toMatchObject({ kind: "connected" });
  });

  it("asks for an update when the protocol is not supported", () => {
    expect(interpretStatus(status({ protocolVersion: 99 }))).toEqual({
      kind: "outdated",
      extensionVersion: "0.1.0",
    });
    expect(interpretStatus(error("UNSUPPORTED_PROTOCOL"))).toEqual({
      kind: "outdated",
      extensionVersion: null,
    });
  });
});

describe("forward-compatible replies (AUTH-07c, grill A3)", () => {
  it("AUTH-07c fields a newer extension adds are ignored", () => {
    expect(interpretStatus(status({ plan: "pro", limits: { domains: 12 } }))).toEqual({
      kind: "not-connected",
      extensionVersion: "0.1.0",
    });
    expect(
      interpretConnect({ ok: true, protocolVersion: 1, email: "a@example.com", plan: "pro" }),
    ).toEqual({ kind: "connected", email: "a@example.com" });
    expect(interpretDisconnect({ ok: true, protocolVersion: 1, extra: true })).toBe("disconnected");
  });

  it("AUTH-07c a newer protocol version is outdated, whatever else the reply holds", () => {
    expect(
      interpretStatus({ protocolVersion: 2, extensionVersion: "1.0.0", shape: "new" }),
    ).toEqual({ kind: "outdated", extensionVersion: "1.0.0" });
    expect(interpretStatus({ protocolVersion: 2 })).toEqual({
      kind: "outdated",
      extensionVersion: null,
    });
    expect(interpretConnect({ ok: true, protocolVersion: 2 })).toEqual({ kind: "outdated" });
  });

  it("AUTH-07c a versioned reply that cannot be read is outdated, not not-installed", () => {
    expect(interpretStatus(status({ connected: "yes" }))).toEqual({
      kind: "outdated",
      extensionVersion: "0.1.0",
    });
    expect(interpretStatus(error("SOME_NEW_CODE"))).toEqual({
      kind: "outdated",
      extensionVersion: null,
    });
    expect(interpretConnect(error("SOME_NEW_CODE"))).toEqual({ kind: "outdated" });
  });

  it("AUTH-07c a version string that is not a version is not shown", () => {
    expect(
      interpretStatus({ protocolVersion: 2, extensionVersion: "<b>a@example.com</b>" }),
    ).toEqual({ kind: "outdated", extensionVersion: null });
  });

  it("AUTH-07c released 0.2.x replies (protocol 1, exact fields) read as before", () => {
    expect(interpretStatus(status({ extensionVersion: "0.2.3" }))).toEqual({
      kind: "not-connected",
      extensionVersion: "0.2.3",
    });
    expect(interpretConnect(error("ALREADY_CONNECTED"))).toEqual({ kind: "already-connected" });
    expect(interpretDisconnect(error("UNSYNCED_DATA"))).toBe("unsynced-data");
  });
});

describe("interpretConnect (AUTH-07b)", () => {
  it("reports success with the email", () => {
    expect(interpretConnect({ ok: true, protocolVersion: 1, email: "a@example.com" })).toEqual({
      kind: "connected",
      email: "a@example.com",
    });
  });

  it("maps the error codes", () => {
    expect(interpretConnect(error("ALREADY_CONNECTED"))).toEqual({ kind: "already-connected" });
    expect(interpretConnect(error("UNSYNCED_DATA"))).toEqual({ kind: "unsynced-data" });
    expect(interpretConnect(error("UNSUPPORTED_PROTOCOL"))).toEqual({ kind: "outdated" });
    expect(interpretConnect(error("INVALID_TOKEN"))).toEqual({ kind: "failed" });
    expect(interpretConnect(error("INTERNAL"))).toEqual({ kind: "failed" });
  });

  it("treats no reply or garbage as a failure", () => {
    expect(interpretConnect(undefined)).toEqual({ kind: "failed" });
    expect(interpretConnect({ ok: true })).toEqual({ kind: "failed" });
  });
});

describe("interpretDisconnect (AUTH-12, DASH-13)", () => {
  it("ack → disconnected; UNSYNCED_DATA → unsynced-data; anything else → failed", () => {
    expect(interpretDisconnect({ ok: true, protocolVersion: PROTOCOL_VERSION })).toBe(
      "disconnected",
    );
    expect(
      interpretDisconnect({ ok: false, protocolVersion: PROTOCOL_VERSION, code: "UNSYNCED_DATA" }),
    ).toBe("unsynced-data");
    expect(
      interpretDisconnect({ ok: false, protocolVersion: PROTOCOL_VERSION, code: "INTERNAL" }),
    ).toBe("failed");
    expect(interpretDisconnect(undefined)).toBe("failed");
  });
});
