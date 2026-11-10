/**
 * Engine environment for this install (TRK-09/10): a stable random device id, created once and
 * kept in storage, plus the UUID generator and the local-midnight calendar.
 */
import { type EngineEnv, localMidnightAfter } from "../../engine/engine";
import type { KeyValueArea } from "../auth/storage";
import { DEVICE_ID_KEY } from "./keys";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function createEngineEnv(
  area: KeyValueArea,
  newId: () => string = () => crypto.randomUUID(),
) {
  let cached: EngineEnv | null = null;
  const env = async function env(): Promise<EngineEnv> {
    if (cached) return cached;
    const stored = (await area.get(DEVICE_ID_KEY))[DEVICE_ID_KEY];
    let deviceId = typeof stored === "string" && UUID.test(stored) ? stored : null;
    if (!deviceId) {
      deviceId = newId();
      await area.set({ [DEVICE_ID_KEY]: deviceId });
    }
    cached = { deviceId, newId, nextLocalMidnight: localMidnightAfter };
    return cached;
  };
  return Object.assign(env, {
    /**
     * Security audit #113: when the account's local data is cleared, the next account on this
     * profile gets a new device id, so two accounts can never be linked through it.
     */
    async forget(): Promise<void> {
      cached = null;
      await area.remove(DEVICE_ID_KEY);
    },
  });
}
