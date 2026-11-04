import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "./index";

describe("@careeros/shared", () => {
  it("AUTH-07a protocol version starts at 1", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});
