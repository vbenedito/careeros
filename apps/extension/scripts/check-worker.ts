/**
 * Smoke check after the development build (#16, review of #36): the service worker and every
 * chunk it imports must not contain popup/DOM modules. Service workers have no `document`; our
 * own DOM code lives only under src/popup (libraries such as supabase-js guard their `window`
 * access). Reads the source maps, so it runs on the development build, which has them.
 */
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const dist = resolve(import.meta.dirname, "..", "dist", "development");
const IMPORT = /(?:\bimport\s*\(?|\bfrom)\s*["']([^"']+\.js)["']/g;

const seen = new Set<string>();
const offenders: string[] = [];
let modules = 0;
function visit(file: string) {
  if (seen.has(file)) return;
  seen.add(file);
  const { sources } = JSON.parse(readFileSync(`${file}.map`, "utf8")) as { sources: string[] };
  modules += sources.length;
  for (const s of sources) {
    if (/(^|\/)src\/popup\//.test(s) || /\.(css|html)$/.test(s)) {
      offenders.push(`${relative(dist, file)} ← ${s}`);
    }
  }
  for (const [, spec] of readFileSync(file, "utf8").matchAll(IMPORT)) {
    if (spec?.startsWith(".")) visit(resolve(dirname(file), spec));
  }
}
visit(resolve(dist, "background.js"));
if (offenders.length > 0) {
  console.error(`Popup/DOM modules in the service worker graph:\n  ${offenders.join("\n  ")}`);
  process.exit(1);
}
console.warn(
  `service worker graph OK: ${seen.size} file(s), ${modules} modules, no popup/DOM code`,
);
