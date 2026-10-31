import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

function manifestPlugin(): Plugin {
  return {
    name: "steam-sale-helper-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: readFileSync(resolve(rootDir, "manifest.json"), "utf-8")
      });
    }
  };
}

function extensionOutputPlugin(): Plugin {
  return {
    name: "steam-sale-helper-extension-output",
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== "asset") continue;
        if (item.fileName === "src/options/options.html") {
          item.fileName = "options/options.html";
        }
        if (item.fileName.startsWith("assets/index-") && item.fileName.endsWith(".css")) {
          item.fileName = "styles/cart.css";
        }
      }
    },
    writeBundle() {
      const from = resolve(rootDir, "dist/src/options/options.html");
      const to = resolve(rootDir, "dist/options/options.html");
      if (existsSync(from)) {
        mkdirSync(resolve(rootDir, "dist/options"), { recursive: true });
        renameSync(from, to);
      }
      const contentScript = resolve(rootDir, "dist/content/index.js");
      if (existsSync(contentScript)) {
        const firstBytes = readFileSync(contentScript, "utf-8").slice(0, 64).trimStart();
        if (firstBytes.startsWith("import")) {
          throw new Error("Content script must be bundled without ESM imports for Chrome content_scripts.");
        }
      }
    }
  };
}

export default defineConfig({
  plugins: [manifestPlugin(), extensionOutputPlugin()],
  publicDir: "public",
  build: {
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        "content/index": resolve(rootDir, "src/content/index.ts"),
        "background/index": resolve(rootDir, "src/background/index.ts"),
        "options/options": resolve(rootDir, "src/options/options.html")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "cart.css") return "styles/cart.css";
          if (assetInfo.name === "options.css") return "options/options.css";
          return "assets/[name]-[hash][extname]";
        }
      }
    }
  }
});
