import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { resolveAgentMemoryAllowedPaths } from "./agent-scope.js";

describe("resolveAgentMemoryAllowedPaths", () => {
  it("should return undefined when no agents config exists", () => {
    const cfg: OpenClawConfig = {};
    const result = resolveAgentMemoryAllowedPaths(cfg, "main");
    expect(result).toBeUndefined();
  });

  it("should return undefined when agent id does not exist", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/openclaw" }],
      },
    };
    const result = resolveAgentMemoryAllowedPaths(cfg, "nonexistent");
    expect(result).toBeUndefined();
  });

  it("should return undefined when memoryAllowedPaths is not set", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          {
            id: "main",
            workspace: "~/openclaw",
          },
        ],
      },
    };
    const result = resolveAgentMemoryAllowedPaths(cfg, "main");
    expect(result).toBeUndefined();
  });

  it("should return undefined when memoryAllowedPaths is empty array", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          {
            id: "main",
            workspace: "~/openclaw",
            memoryAllowedPaths: [],
          },
        ],
      },
    };
    const result = resolveAgentMemoryAllowedPaths(cfg, "main");
    expect(result).toBeUndefined();
  });

  it("should return trimmed paths when memoryAllowedPaths is set", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          {
            id: "main",
            workspace: "~/openclaw",
            memoryAllowedPaths: ["memory/personal/dana/", "memory/shared/"],
          },
        ],
      },
    };
    const result = resolveAgentMemoryAllowedPaths(cfg, "main");
    expect(result).toEqual(["memory/personal/dana/", "memory/shared/"]);
  });

  it("should filter out empty strings after trimming", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          {
            id: "main",
            workspace: "~/openclaw",
            memoryAllowedPaths: ["memory/personal/dana/", "  ", "", "memory/shared/"],
          },
        ],
      },
    };
    const result = resolveAgentMemoryAllowedPaths(cfg, "main");
    expect(result).toEqual(["memory/personal/dana/", "memory/shared/"]);
  });

  it("should return undefined when all paths are empty after trimming", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          {
            id: "main",
            workspace: "~/openclaw",
            memoryAllowedPaths: ["  ", "", "   "],
          },
        ],
      },
    };
    const result = resolveAgentMemoryAllowedPaths(cfg, "main");
    expect(result).toBeUndefined();
  });

  it("should normalize agent id (case-insensitive)", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          {
            id: "main",
            workspace: "~/openclaw",
            memoryAllowedPaths: ["memory/personal/dana/"],
          },
        ],
      },
    };
    const result = resolveAgentMemoryAllowedPaths(cfg, "MAIN");
    expect(result).toEqual(["memory/personal/dana/"]);
  });
});
