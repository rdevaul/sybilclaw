import { describe, expect, it, beforeEach } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { AgentSkillsConfig } from "../../config/types.agents.js";
import {
  resolveAgentSkillSet,
  resolveSystemDefaults,
  resetDefaultsWarningFlag,
  type ResolvedSkillSet,
} from "./defaults.js";

describe("resolveSystemDefaults", () => {
  it("returns empty array when skills.defaults is not configured", () => {
    expect(resolveSystemDefaults({})).toEqual([]);
    expect(resolveSystemDefaults({ skills: {} })).toEqual([]);
    expect(resolveSystemDefaults({ skills: { defaults: undefined } })).toEqual([]);
  });

  it("returns configured defaults", () => {
    const config: OpenClawConfig = {
      skills: {
        defaults: ["weather", "github", "discord"],
      },
    };
    expect(resolveSystemDefaults(config)).toEqual(["weather", "github", "discord"]);
  });

  it("trims and filters empty strings", () => {
    const config: OpenClawConfig = {
      skills: {
        defaults: [" weather ", "", "  ", "github"],
      },
    };
    expect(resolveSystemDefaults(config)).toEqual(["weather", "github"]);
  });
});

describe("resolveAgentSkillSet", () => {
  beforeEach(() => {
    resetDefaultsWarningFlag();
  });

  describe("backward compatibility", () => {
    it("legacy string[] works unchanged (strict allowlist)", () => {
      const result = resolveAgentSkillSet(["weather", "github"], ["discord", "slack"]);
      expect(result.isUnrestricted).toBe(false);
      expect(result.names).toEqual(new Set(["weather", "github"]));
      expect(result.denied).toEqual(new Set());
    });

    it("empty defaults + no agent config → all skills (unrestricted)", () => {
      const result = resolveAgentSkillSet(undefined, []);
      expect(result.isUnrestricted).toBe(true);
      expect(result.names).toEqual(new Set());
      expect(result.denied).toEqual(new Set());
    });

    it("legacy empty string[] means no skills", () => {
      const result = resolveAgentSkillSet([], ["weather"]);
      expect(result.isUnrestricted).toBe(false);
      expect(result.names).toEqual(new Set());
    });
  });

  describe("system defaults with no per-agent config", () => {
    it("returns only default skills when agent has no skills config", () => {
      const result = resolveAgentSkillSet(undefined, ["weather", "github"]);
      expect(result.isUnrestricted).toBe(false);
      expect(result.names).toEqual(new Set(["weather", "github"]));
      expect(result.denied).toEqual(new Set());
    });
  });

  describe("allow adds to defaults", () => {
    it("adds allowed skills beyond system defaults", () => {
      const config: AgentSkillsConfig = {
        allow: ["rocket-design", "print-farm"],
      };
      const result = resolveAgentSkillSet(config, ["weather", "github"]);
      expect(result.isUnrestricted).toBe(false);
      expect(result.names).toEqual(new Set(["weather", "github", "rocket-design", "print-farm"]));
    });

    it("allow with empty defaults starts from empty base", () => {
      const config: AgentSkillsConfig = {
        allow: ["weather"],
      };
      const result = resolveAgentSkillSet(config, []);
      expect(result.isUnrestricted).toBe(false);
      expect(result.names).toEqual(new Set(["weather"]));
    });
  });

  describe("deny removes from defaults", () => {
    it("removes denied skills from defaults", () => {
      const config: AgentSkillsConfig = {
        deny: ["github"],
      };
      const result = resolveAgentSkillSet(config, ["weather", "github", "discord"]);
      expect(result.isUnrestricted).toBe(false);
      expect(result.names).toEqual(new Set(["weather", "discord"]));
      expect(result.denied).toEqual(new Set(["github"]));
    });

    it("deny of non-existent skill is harmless", () => {
      const config: AgentSkillsConfig = {
        deny: ["nonexistent"],
      };
      const result = resolveAgentSkillSet(config, ["weather"]);
      expect(result.names).toEqual(new Set(["weather"]));
      expect(result.denied).toEqual(new Set(["nonexistent"]));
    });
  });

  describe("allow + deny combined", () => {
    it("both allow and deny apply correctly", () => {
      const config: AgentSkillsConfig = {
        allow: ["rocket-design"],
        deny: ["github"],
      };
      const result = resolveAgentSkillSet(config, ["weather", "github"]);
      expect(result.names).toEqual(new Set(["weather", "rocket-design"]));
      expect(result.denied).toEqual(new Set(["github"]));
    });
  });

  describe("noDefaults: true with allow", () => {
    it("starts from empty and only uses allowed", () => {
      const config: AgentSkillsConfig = {
        noDefaults: true,
        allow: ["weather", "web-search"],
      };
      const result = resolveAgentSkillSet(config, ["github", "discord", "slack"]);
      expect(result.isUnrestricted).toBe(false);
      expect(result.names).toEqual(new Set(["weather", "web-search"]));
    });

    it("noDefaults with no allow yields empty set", () => {
      const config: AgentSkillsConfig = {
        noDefaults: true,
      };
      const result = resolveAgentSkillSet(config, ["weather", "github"]);
      expect(result.isUnrestricted).toBe(false);
      expect(result.names).toEqual(new Set());
    });
  });

  describe("deny overlapping with allow → deny wins", () => {
    it("skill in both allow and deny is excluded", () => {
      const config: AgentSkillsConfig = {
        allow: ["rocket-design", "print-farm"],
        deny: ["rocket-design"],
      };
      const result = resolveAgentSkillSet(config, ["weather"]);
      expect(result.names).toEqual(new Set(["weather", "print-farm"]));
      expect(result.denied).toEqual(new Set(["rocket-design"]));
      // rocket-design is NOT in the names set because deny wins
      expect(result.names.has("rocket-design")).toBe(false);
    });

    it("deny wins over allow even for defaults", () => {
      const config: AgentSkillsConfig = {
        allow: ["extra-skill"],
        deny: ["weather"],
      };
      const result = resolveAgentSkillSet(config, ["weather", "github"]);
      expect(result.names).toEqual(new Set(["github", "extra-skill"]));
      expect(result.names.has("weather")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles whitespace in skill names", () => {
      const config: AgentSkillsConfig = {
        allow: [" rocket-design ", ""],
        deny: [" github "],
      };
      const result = resolveAgentSkillSet(config, ["weather", "github"]);
      expect(result.names).toEqual(new Set(["weather", "rocket-design"]));
      expect(result.denied).toEqual(new Set(["github"]));
    });

    it("handles duplicate entries", () => {
      const config: AgentSkillsConfig = {
        allow: ["rocket-design", "rocket-design"],
      };
      const result = resolveAgentSkillSet(config, ["weather", "weather"]);
      expect(result.names).toEqual(new Set(["weather", "rocket-design"]));
    });

    it("handles empty AgentSkillsConfig object", () => {
      const config: AgentSkillsConfig = {};
      const result = resolveAgentSkillSet(config, ["weather", "github"]);
      // Empty config with no allow/deny → defaults pass through
      expect(result.names).toEqual(new Set(["weather", "github"]));
      expect(result.isUnrestricted).toBe(false);
    });

    it("legacy string[] ignores system defaults entirely", () => {
      const result = resolveAgentSkillSet(["custom-skill"], ["weather", "github"]);
      expect(result.names).toEqual(new Set(["custom-skill"]));
      // System defaults are completely ignored
      expect(result.names.has("weather")).toBe(false);
      expect(result.names.has("github")).toBe(false);
    });
  });
});
