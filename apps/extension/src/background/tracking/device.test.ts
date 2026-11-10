import { describe, expect, it } from "vitest";
import { fakeStorage } from "../../test/fakes";
import { createEngineEnv } from "./device";
import { DEVICE_ID_KEY } from "./keys";

describe("engine env (TRK-10 device_id)", () => {
  it("TRK-10 creates a device id once and keeps it", async () => {
    const storage = fakeStorage();
    const env = await createEngineEnv(storage)();
    expect(env.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(storage.data.get(DEVICE_ID_KEY)).toBe(env.deviceId);
    expect((await createEngineEnv(storage)()).deviceId).toBe(env.deviceId);
  });

  it("TRK-10 replaces an invalid stored device id", async () => {
    const storage = fakeStorage({ [DEVICE_ID_KEY]: "not-a-uuid" });
    const env = await createEngineEnv(storage)();
    expect(env.deviceId).not.toBe("not-a-uuid");
    expect(env.nextLocalMidnight(1000)).toBeGreaterThan(1000);
  });

  it("#113 forget(): the next account on this profile gets a new device id", async () => {
    const area = fakeStorage();
    let n = 0;
    const env = createEngineEnv(area, () => `00000000-0000-4000-8000-00000000000${++n}`);
    const first = (await env()).deviceId;
    await env.forget();
    expect(area.data.has(DEVICE_ID_KEY)).toBe(false);
    const second = (await env()).deviceId;
    expect(second).not.toBe(first);
  });
});
