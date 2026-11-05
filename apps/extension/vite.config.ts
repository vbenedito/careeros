import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import {
  assertNoSecrets,
  type BuildMode,
  buildManifest,
  parseDashboardOrigin,
} from "./manifest.config";

const DEV_DEFAULTS = { VITE_DASHBOARD_ORIGIN: "http://localhost:3000" };

function toBuildMode(mode: string): BuildMode {
  if (mode !== "development" && mode !== "production") {
    throw new Error(`Unknown extension build mode "${mode}" (use development or production)`);
  }
  return mode;
}

/** Emits manifest.json for the current mode (ENV-05). */
function manifestPlugin(mode: BuildMode, dashboardOrigin: string): Plugin {
  const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "package.json"), "utf8")) as {
    version: string;
  };
  return {
    name: "careeros-manifest",
    generateBundle() {
      const manifest = buildManifest(mode, { dashboardOrigin, version: pkg.version });
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const buildMode = toBuildMode(mode);
  const env = {
    ...(buildMode === "development" ? DEV_DEFAULTS : {}),
    ...loadEnv(mode, import.meta.dirname, "VITE_"),
  };
  assertNoSecrets(env);
  const dashboardOrigin = parseDashboardOrigin(env.VITE_DASHBOARD_ORIGIN, buildMode);

  return {
    plugins: [manifestPlugin(buildMode, dashboardOrigin)],
    build: {
      outDir: `dist/${buildMode}`,
      emptyOutDir: true,
      target: "chrome120",
      // Readable output in dev builds helps debugging the service worker.
      minify: buildMode === "production",
      sourcemap: buildMode === "development",
      modulePreload: false,
      rollupOptions: {
        input: {
          popup: resolve(import.meta.dirname, "popup.html"),
          background: resolve(import.meta.dirname, "src/background/index.ts"),
        },
        output: {
          // MV3 requires a stable service-worker path declared in the manifest.
          entryFileNames: (chunk) =>
            chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
        },
      },
    },
  };
});
