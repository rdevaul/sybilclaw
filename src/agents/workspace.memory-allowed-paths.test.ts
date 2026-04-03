import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempWorkspace, writeWorkspaceFile } from "../test-helpers/workspace.js";
import { DEFAULT_MEMORY_FILENAME, loadWorkspaceBootstrapFiles } from "./workspace.js";

describe("loadWorkspaceBootstrapFiles with memoryAllowedPaths", () => {
  it("should load memory file when path is in allowlist", async () => {
    const tmp = await makeTempWorkspace();
    await fs.mkdir(path.join(tmp, "memory/personal/dana"), { recursive: true });
    await writeWorkspaceFile({
      dir: tmp,
      name: "memory/personal/dana/MEMORY.md",
      content: "# Dana's Memory",
    });

    const files = await loadWorkspaceBootstrapFiles(
      tmp,
      ["memory/personal/dana/MEMORY.md"],
      ["memory/personal/dana/"],
    );

    const memoryFile = files.find((f) => f.path.includes("dana/MEMORY.md"));
    expect(memoryFile).toBeDefined();
    expect(memoryFile?.missing).toBe(false);
    expect(memoryFile?.content).toBe("# Dana's Memory");
  });

  it("should skip memory file when path is not in allowlist", async () => {
    const tmp = await makeTempWorkspace();
    await fs.mkdir(path.join(tmp, "memory/personal/terry"), { recursive: true });
    await writeWorkspaceFile({
      dir: tmp,
      name: "memory/personal/terry/MEMORY.md",
      content: "# Terry's Memory",
    });

    const files = await loadWorkspaceBootstrapFiles(
      tmp,
      ["memory/personal/terry/MEMORY.md"],
      ["memory/personal/dana/"], // Dana's allowlist - shouldn't allow Terry's path
    );

    const memoryFile = files.find((f) => f.path.includes("terry/MEMORY.md"));
    expect(memoryFile).toBeUndefined();
  });

  it("should allow memory file when path matches any allowlist prefix", async () => {
    const tmp = await makeTempWorkspace();
    await fs.mkdir(path.join(tmp, "memory/shared/household"), { recursive: true });
    await writeWorkspaceFile({
      dir: tmp,
      name: "memory/shared/household/MEMORY.md",
      content: "# Shared Memory",
    });

    const files = await loadWorkspaceBootstrapFiles(
      tmp,
      ["memory/shared/household/MEMORY.md"],
      ["memory/personal/dana/", "memory/shared/"], // Multiple allowed prefixes
    );

    const memoryFile = files.find((f) => f.path.includes("shared/household/MEMORY.md"));
    expect(memoryFile).toBeDefined();
    expect(memoryFile?.missing).toBe(false);
    expect(memoryFile?.content).toBe("# Shared Memory");
  });

  it("should load all allowed memory files and skip disallowed ones", async () => {
    const tmp = await makeTempWorkspace();
    await fs.mkdir(path.join(tmp, "memory/personal/dana"), { recursive: true });
    await fs.mkdir(path.join(tmp, "memory/personal/terry"), { recursive: true });
    await fs.mkdir(path.join(tmp, "memory/shared/household"), { recursive: true });
    await writeWorkspaceFile({
      dir: tmp,
      name: "memory/personal/dana/MEMORY.md",
      content: "# Dana's Memory",
    });
    await writeWorkspaceFile({
      dir: tmp,
      name: "memory/personal/terry/MEMORY.md",
      content: "# Terry's Memory",
    });
    await writeWorkspaceFile({
      dir: tmp,
      name: "memory/shared/household/MEMORY.md",
      content: "# Shared Memory",
    });

    const files = await loadWorkspaceBootstrapFiles(
      tmp,
      [
        "memory/personal/dana/MEMORY.md",
        "memory/personal/terry/MEMORY.md",
        "memory/shared/household/MEMORY.md",
      ],
      ["memory/personal/dana/", "memory/shared/"], // Only Dana and shared allowed
    );

    const danaFile = files.find((f) => f.path.includes("dana/MEMORY.md"));
    const terryFile = files.find((f) => f.path.includes("terry/MEMORY.md"));
    const sharedFile = files.find((f) => f.path.includes("shared/household/MEMORY.md"));

    expect(danaFile).toBeDefined();
    expect(danaFile?.missing).toBe(false);

    expect(terryFile).toBeUndefined(); // Terry's file should be filtered out

    expect(sharedFile).toBeDefined();
    expect(sharedFile?.missing).toBe(false);
  });

  it("should not filter when memoryAllowedPaths is undefined", async () => {
    const tmp = await makeTempWorkspace();
    await fs.mkdir(path.join(tmp, "memory/personal/dana"), { recursive: true });
    await writeWorkspaceFile({
      dir: tmp,
      name: "memory/personal/dana/MEMORY.md",
      content: "# Dana's Memory",
    });

    const files = await loadWorkspaceBootstrapFiles(
      tmp,
      ["memory/personal/dana/MEMORY.md"],
      undefined, // No path filtering
    );

    const memoryFile = files.find((f) => f.path.includes("dana/MEMORY.md"));
    expect(memoryFile).toBeDefined();
    expect(memoryFile?.missing).toBe(false);
  });

  it("should not filter when memoryAllowedPaths is empty array", async () => {
    const tmp = await makeTempWorkspace();
    await fs.mkdir(path.join(tmp, "memory/personal/dana"), { recursive: true });
    await writeWorkspaceFile({
      dir: tmp,
      name: "memory/personal/dana/MEMORY.md",
      content: "# Dana's Memory",
    });

    const files = await loadWorkspaceBootstrapFiles(
      tmp,
      ["memory/personal/dana/MEMORY.md"],
      [], // Empty allowlist - no filtering
    );

    const memoryFile = files.find((f) => f.path.includes("dana/MEMORY.md"));
    expect(memoryFile).toBeDefined();
    expect(memoryFile?.missing).toBe(false);
  });

  it("should handle default MEMORY.md when no agent memory files specified", async () => {
    const tmp = await makeTempWorkspace();
    await writeWorkspaceFile({
      dir: tmp,
      name: DEFAULT_MEMORY_FILENAME,
      content: "# Default Memory",
    });

    // No agentMemoryFiles specified, should fall back to default MEMORY.md
    // memoryAllowedPaths should not affect this fallback behavior
    const files = await loadWorkspaceBootstrapFiles(
      tmp,
      undefined,
      ["memory/personal/dana/"], // This shouldn't affect default MEMORY.md
    );

    const memoryFile = files.find((f) => f.name === DEFAULT_MEMORY_FILENAME);
    expect(memoryFile).toBeDefined();
    expect(memoryFile?.missing).toBe(false);
    expect(memoryFile?.content).toBe("# Default Memory");
  });
});
