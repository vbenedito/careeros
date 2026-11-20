/**
 * ENV-05c (#242): dashboard features that need a newer extension than the one in the store.
 * Each such feature declares the minimum extension version here; the dashboard shows it only
 * when the version live in the Chrome Web Store (server env `EXTENSION_STORE_VERSION`) is at
 * least that. Pure; no dependency.
 */

/** Feature → minimum extension version (strict `major.minor.patch`). */
export const EXTENSION_FEATURES = {
  /** PRB-01..23: the extension reads the setting and attaches problem slugs (#179, 0.3.0). */
  problemTracking: "0.3.0",
  // NC-b/NC-c (#233, #237): NeetCode support needs 0.3.1; the NeetCode issues add its own minimum
  // here (for example `problemTrackingNeetCode: "0.3.1"`) and gate their copy and UI with it.
} as const;

export type ExtensionFeature = keyof typeof EXTENSION_FEATURES;

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/** `[major, minor, patch]`, or null when the text is not a strict three-part version. */
export function parseExtensionVersion(
  text: string | null | undefined,
): [number, number, number] | null {
  const match = VERSION.exec((text ?? "").trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** True when `version` is at least `minimum`; false when either is not a valid version. */
export function versionAtLeast(version: string | null | undefined, minimum: string): boolean {
  const have = parseExtensionVersion(version);
  const need = parseExtensionVersion(minimum);
  if (!have || !need) return false;
  for (let i = 0; i < 3; i++) {
    const a = have[i] as number;
    const b = need[i] as number;
    if (a !== b) return a > b;
  }
  return true;
}

/**
 * Is the feature live for users of the store version? A missing or invalid version hides every
 * gated feature (safe default).
 */
export function isExtensionFeatureLive(
  feature: ExtensionFeature,
  storeVersion: string | null | undefined,
): boolean {
  return versionAtLeast(storeVersion, EXTENSION_FEATURES[feature]);
}
