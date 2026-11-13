import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "./constants";
import {
  DomainSchema,
  ExtensionAckReplySchema,
  ExtensionErrorSchema,
  ExtensionRequestSchema,
  ExtensionStatusReplySchema,
  IntervalSchema,
  ProtocolEnvelopeSchema,
} from "./schemas";

const valid = {
  id: "3b241101-e2bb-4255-8caf-4136c566a962",
  device_id: "9f1c3f2e-1d1b-4a8e-9a37-6a7d9c1b2e10",
  domain: "leetcode.com",
  started_at: "2026-11-05T09:00:00Z",
  ended_at: "2026-11-05T09:30:00Z",
};

describe("IntervalSchema", () => {
  it("TRK-10 accepts a well-formed interval", () => {
    expect(IntervalSchema.safeParse(valid).success).toBe(true);
  });

  it("DATA-02 accepts up to MAX_INTERVAL_S + 30 s tolerance", () => {
    expect(IntervalSchema.safeParse({ ...valid, ended_at: "2026-11-05T09:30:30Z" }).success).toBe(
      true,
    );
    expect(IntervalSchema.safeParse({ ...valid, ended_at: "2026-11-05T09:30:31Z" }).success).toBe(
      false,
    );
  });

  it("DATA-02 rejects zero or negative durations", () => {
    expect(IntervalSchema.safeParse({ ...valid, ended_at: valid.started_at }).success).toBe(false);
    expect(IntervalSchema.safeParse({ ...valid, ended_at: "2026-11-05T08:59:59Z" }).success).toBe(
      false,
    );
  });

  it.each([
    ["non-v4 id", { id: "3b241101-e2bb-1255-8caf-4136c566a962" }],
    ["bad device id", { device_id: "device-1" }],
    ["non-normalized domain", { domain: "www.leetcode.com" }],
    ["fractional seconds", { started_at: "2026-11-05T09:00:00.123Z" }],
    ["local offset", { started_at: "2026-11-05T06:00:00-03:00" }],
    ["date only", { ended_at: "2026-11-05" }],
  ])("TRK-10 rejects %s", (_name, patch) => {
    expect(IntervalSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("SEC-01 rejects unknown fields such as a URL or title", () => {
    expect(IntervalSchema.safeParse({ ...valid, url: "https://leetcode.com/x" }).success).toBe(
      false,
    );
    expect(IntervalSchema.safeParse({ ...valid, title: "Two Sum" }).success).toBe(false);
  });
});

describe("DomainSchema", () => {
  it("accepts normalized domains only", () => {
    expect(DomainSchema.safeParse("neetcode.io").success).toBe(true);
    expect(DomainSchema.safeParse("NeetCode.io").success).toBe(false);
  });
});

describe("ExtensionRequestSchema", () => {
  it("AUTH-07 accepts the four message types with a protocol version", () => {
    for (const type of ["PING", "STATUS", "DISCONNECT"] as const) {
      expect(ExtensionRequestSchema.safeParse({ type, protocolVersion: 1 }).success).toBe(true);
    }
    expect(
      ExtensionRequestSchema.safeParse({
        type: "CONNECT",
        protocolVersion: PROTOCOL_VERSION,
        tokenHash: "a".repeat(56),
      }).success,
    ).toBe(true);
  });

  it.each([
    ["unknown type", { type: "EXPORT_DATA", protocolVersion: 1 }],
    ["missing protocol version", { type: "PING" }],
    ["protocol version 0", { type: "PING", protocolVersion: 0 }],
    ["CONNECT without token", { type: "CONNECT", protocolVersion: 1 }],
    ["CONNECT with short token", { type: "CONNECT", protocolVersion: 1, tokenHash: "abc" }],
    ["extra fields", { type: "PING", protocolVersion: 1, session: "x" }],
    ["not an object", "PING"],
  ])("AUTH-07 rejects %s", (_name, message) => {
    expect(ExtensionRequestSchema.safeParse(message).success).toBe(false);
  });
});

describe("extension replies", () => {
  it("AUTH-07a status reply includes versions; email only as a valid address", () => {
    const reply = { ok: true, protocolVersion: 1, extensionVersion: "0.1.0", connected: false };
    expect(ExtensionStatusReplySchema.safeParse(reply).success).toBe(true);
    expect(
      ExtensionStatusReplySchema.safeParse({ ...reply, connected: true, email: "a@b.co" }).success,
    ).toBe(true);
    expect(ExtensionStatusReplySchema.safeParse({ ...reply, email: "nope" }).success).toBe(false);
  });

  it("AUTH-07b error replies use known codes", () => {
    expect(
      ExtensionErrorSchema.safeParse({ ok: false, code: "ALREADY_CONNECTED", protocolVersion: 1 })
        .success,
    ).toBe(true);
    expect(
      ExtensionErrorSchema.safeParse({ ok: false, code: "SOMETHING", protocolVersion: 1 }).success,
    ).toBe(false);
  });

  it("ack reply", () => {
    expect(ExtensionAckReplySchema.safeParse({ ok: true, protocolVersion: 1 }).success).toBe(true);
  });

  it("AUTH-07c replies ignore fields a newer extension adds, but still check the known ones", () => {
    const status = { ok: true, protocolVersion: 1, extensionVersion: "0.3.0", connected: false };
    const parsed = ExtensionStatusReplySchema.safeParse({ ...status, plan: "pro", limits: {} });
    expect(parsed.success && parsed.data).toEqual(status);
    expect(ExtensionStatusReplySchema.safeParse({ ...status, connected: "yes" }).success).toBe(
      false,
    );
    expect(
      ExtensionAckReplySchema.safeParse({ ok: true, protocolVersion: 1, extra: 1 }).success,
    ).toBe(true);
    expect(
      ExtensionErrorSchema.safeParse({
        ok: false,
        code: "UNSYNCED_DATA",
        protocolVersion: 1,
        limit: 12,
      }).success,
    ).toBe(true);
  });

  it("AUTH-07c the protocol version is read on its own, whatever else the object holds", () => {
    expect(ProtocolEnvelopeSchema.safeParse({ protocolVersion: 2, anything: [1] }).success).toBe(
      true,
    );
    expect(ProtocolEnvelopeSchema.safeParse({ protocolVersion: "1" }).success).toBe(false);
    expect(ProtocolEnvelopeSchema.safeParse({}).success).toBe(false);
    expect(ProtocolEnvelopeSchema.safeParse("PING").success).toBe(false);
  });
});
