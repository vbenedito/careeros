/**
 * #60: imported first by the popup and the service worker. Zod's JIT probes `new Function`,
 * which the extension CSP (`script-src 'self'`, SEC-04) blocks: the probe is caught, but Chrome
 * still reports a `securitypolicyviolation` (seen in the popup). Jitless parsing never probes.
 */
import { z } from "zod";

z.config({ jitless: true });
