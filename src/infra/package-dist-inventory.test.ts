import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../test-helpers/temp-dir.js";
import {
  collectPackageDistInventoryErrors,
  PACKAGE_DIST_INVENTORY_RELATIVE_PATH,
  collectPackageDistInventory,
  writePackageDistInventory,
} from "./package-dist-inventory.js";

describe("package dist inventory", () => {
  it("tracks missing and stale dist files", async () => {
    await withTempDir({ prefix: "openclaw-dist-inventory-" }, async (packageRoot) => {
      const currentFile = path.join(packageRoot, "dist", "current-BR6xv1a1.js");
      await fs.mkdir(path.dirname(currentFile), { recursive: true });
      await fs.writeFile(currentFile, "export {};\n", "utf8");

      await expect(writePackageDistInventory(packageRoot)).resolves.toEqual([
        "dist/current-BR6xv1a1.js",
      ]);
      await expect(collectPackageDistInventoryErrors(packageRoot)).resolves.toEqual([]);

      await fs.rm(currentFile);
      await fs.writeFile(
        path.join(packageRoot, "dist", "stale-CJUAgRQR.js"),
        "export {};\n",
        "utf8",
      );

      await expect(collectPackageDistInventoryErrors(packageRoot)).resolves.toEqual([
        "missing packaged dist file dist/current-BR6xv1a1.js",
        "unexpected packaged dist file dist/stale-CJUAgRQR.js",
      ]);
    });
  });

  it("keeps npm-omitted dist artifacts out of the inventory", async () => {
    await withTempDir({ prefix: "openclaw-dist-inventory-pack-" }, async (packageRoot) => {
      const packagedQaChannelRuntime = path.join(
        packageRoot,
        "dist",
        "extensions",
        "qa-channel",
        "runtime-api.js",
      );
      const packagedQaLabRuntime = path.join(
        packageRoot,
        "dist",
        "extensions",
        "qa-lab",
        "runtime-api.js",
      );
      const omittedQaChunk = path.join(packageRoot, "dist", "extensions", "qa-channel", "cli.js");
      const omittedQaLabChunk = path.join(packageRoot, "dist", "extensions", "qa-lab", "cli.js");
      const omittedQaMatrixChunk = path.join(
        packageRoot,
        "dist",
        "extensions",
        "qa-matrix",
        "index.js",
      );
      const omittedQaLabPluginSdk = path.join(packageRoot, "dist", "plugin-sdk", "qa-lab.js");
      const omittedQaLabTypes = path.join(
        packageRoot,
        "dist",
        "plugin-sdk",
        "extensions",
        "qa-lab",
        "cli.d.ts",
      );
      const omittedQaRuntimeChunk = path.join(packageRoot, "dist", "qa-runtime-B9LDtssJ.js");
      const omittedExtensionNodeModuleSymlink = path.join(
        packageRoot,
        "dist",
        "extensions",
        "discord",
        "node_modules",
        ".bin",
        "color-support",
      );
      const omittedMap = path.join(packageRoot, "dist", "feature.runtime.js.map");
      await fs.mkdir(path.dirname(packagedQaChannelRuntime), { recursive: true });
      await fs.mkdir(path.dirname(packagedQaLabRuntime), { recursive: true });
      await fs.mkdir(path.dirname(omittedQaMatrixChunk), { recursive: true });
      await fs.mkdir(path.dirname(omittedQaLabTypes), { recursive: true });
      await fs.mkdir(path.dirname(omittedExtensionNodeModuleSymlink), { recursive: true });
      await fs.mkdir(path.join(packageRoot, "dist", "plugin-sdk"), { recursive: true });
      await fs.writeFile(path.join(packageRoot, "color-support.js"), "export {};\n", "utf8");
      await fs.writeFile(packagedQaChannelRuntime, "export {};\n", "utf8");
      await fs.writeFile(packagedQaLabRuntime, "export {};\n", "utf8");
      await fs.writeFile(omittedQaChunk, "export {};\n", "utf8");
      await fs.writeFile(omittedQaLabChunk, "export {};\n", "utf8");
      await fs.writeFile(omittedQaMatrixChunk, "export {};\n", "utf8");
      await fs.writeFile(omittedQaLabPluginSdk, "export {};\n", "utf8");
      await fs.writeFile(omittedQaLabTypes, "export {};\n", "utf8");
      await fs.writeFile(omittedQaRuntimeChunk, "export {};\n", "utf8");
      await fs.symlink(
        path.join(packageRoot, "color-support.js"),
        omittedExtensionNodeModuleSymlink,
      );
      await fs.writeFile(omittedMap, "{}", "utf8");

      await expect(writePackageDistInventory(packageRoot)).resolves.toEqual([
        "dist/extensions/qa-channel/runtime-api.js",
      ]);
    });
  });

  it("includes the openclaw -> plugin-sdk alias shim in the inventory", async () => {
    // Regression: the omit pattern for `dist/extensions/node_modules/` was
    // accidentally catching the legitimate openclaw alias shim. The shim
    // contains real wrapper JS files (not symlinks) that re-export from
    // `dist/plugin-sdk/`, and is required at install time for bundled
    // extension imports like `import "openclaw/plugin-sdk/routing"` to resolve.
    await withTempDir({ prefix: "openclaw-dist-inventory-shim-" }, async (packageRoot) => {
      const shimDir = path.join(
        packageRoot,
        "dist",
        "extensions",
        "node_modules",
        "openclaw",
        "plugin-sdk",
      );
      await fs.mkdir(shimDir, { recursive: true });
      await fs.writeFile(
        path.join(shimDir, "routing.js"),
        "export * from \"../../../../plugin-sdk/routing.js\";\n",
        "utf8",
      );
      await fs.writeFile(
        path.join(packageRoot, "dist", "extensions", "node_modules", "openclaw", "package.json"),
        JSON.stringify({
          name: "openclaw",
          type: "module",
          exports: {
            "./plugin-sdk": "./plugin-sdk/index.js",
            "./plugin-sdk/*": "./plugin-sdk/*.js",
          },
        }),
        "utf8",
      );

      const inventory = await writePackageDistInventory(packageRoot);
      expect(inventory).toContain(
        "dist/extensions/node_modules/openclaw/plugin-sdk/routing.js",
      );
      expect(inventory).toContain("dist/extensions/node_modules/openclaw/package.json");
    });
  });
  it("fails closed when the inventory is missing", async () => {
    await withTempDir({ prefix: "openclaw-dist-inventory-missing-" }, async (packageRoot) => {
      await fs.mkdir(path.join(packageRoot, "dist"), { recursive: true });
      await expect(collectPackageDistInventoryErrors(packageRoot)).resolves.toEqual([
        `missing package dist inventory ${PACKAGE_DIST_INVENTORY_RELATIVE_PATH}`,
      ]);
    });
  });

  it("rejects symlinked dist entries", async () => {
    await withTempDir({ prefix: "openclaw-dist-inventory-symlink-" }, async (packageRoot) => {
      const distDir = path.join(packageRoot, "dist");
      await fs.mkdir(distDir, { recursive: true });
      await fs.writeFile(path.join(packageRoot, "escape.js"), "export {};\n", "utf8");
      await fs.symlink(path.join(packageRoot, "escape.js"), path.join(distDir, "entry.js"));

      await expect(collectPackageDistInventory(packageRoot)).rejects.toThrow(
        "Unsafe package dist path: dist/entry.js",
      );
    });
  });
});
