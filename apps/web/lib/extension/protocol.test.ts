import { describe, expect, it } from "vitest";
import { interpretConnect, interpretStatus } from "./protocol";

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

  it("treats a malformed reply as not installed", () => {
    expect(interpretStatus({ hello: "world" })).toEqual({ kind: "not-installed" });
    expect(interpretStatus(status({ extra: 1 }))).toEqual({ kind: "not-installed" });
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
