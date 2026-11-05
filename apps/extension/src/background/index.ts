/**
 * Service worker entry (MV3). Adapters, sync and auth are wired here in later issues
 * (#12, #16, #18). The build pipeline (#4) only needs a valid entry.
 */
import { IS_DEV_BUILD } from "../lib/env";

if (IS_DEV_BUILD) {
  console.warn("[careeros] service worker started (development build)");
}
