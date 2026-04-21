import { describe, expect, it } from "vitest";
import { OpenClawSchema } from "../../config/zod-schema.js";

describe("skills config schema validation", () => {
  it("accepts skills.defaults as string array", () => {
    const config = {
      skills: {
        defaults: ["weather", "github", "discord"],
      },
    };
    const result = OpenClawSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("accepts skills config without defaults (backward compat)", () => {
    const config = {
      skills: {
        allowBundled: ["weather"],
      },
    };
    const result = OpenClawSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("rejects skills.defaults with non-string values", () => {
    const config = {
      skills: {
        defaults: [42, true],
      },
    };
    const result = OpenClawSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe("agent skills config schema validation", () => {
  it("accepts legacy string[] format", () => {
    const config = {
      agents: {
        list: [
          {
            id: "test-agent",
            skills: ["weather", "github"],
          },
        ],
      },
    };
    const result = OpenClawSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("accepts AgentSkillsConfig with allow", () => {
    const config = {
      agents: {
        list: [
          {
            id: "test-agent",
            skills: {
              allow: ["rocket-design", "print-farm"],
            },
          },
        ],
      },
    };
    const result = OpenClawSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("accepts AgentSkillsConfig with deny", () => {
    const config = {
      agents: {
        list: [
          {
            id: "test-agent",
            skills: {
              deny: ["print-farm"],
            },
          },
        ],
      },
    };
    const result = OpenClawSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("accepts AgentSkillsConfig with allow + deny + noDefaults", () => {
    const config = {
      agents: {
        list: [
          {
            id: "test-agent",
            skills: {
              allow: ["weather"],
              deny: ["github"],
              noDefaults: true,
            },
          },
        ],
      },
    };
    const result = OpenClawSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("accepts empty AgentSkillsConfig object", () => {
    const config = {
      agents: {
        list: [
          {
            id: "test-agent",
            skills: {},
          },
        ],
      },
    };
    const result = OpenClawSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("accepts agent with no skills config (undefined)", () => {
    const config = {
      agents: {
        list: [
          {
            id: "test-agent",
          },
        ],
      },
    };
    const result = OpenClawSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("rejects unknown keys in AgentSkillsConfig (strict)", () => {
    const config = {
      agents: {
        list: [
          {
            id: "test-agent",
            skills: {
              allow: ["weather"],
              unknownField: true,
            },
          },
        ],
      },
    };
    const result = OpenClawSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("combined: skills.defaults + per-agent allow/deny parse together", () => {
    const config = {
      skills: {
        defaults: ["weather", "github", "discord"],
      },
      agents: {
        list: [
          {
            id: "agent-a",
            skills: {
              allow: ["rocket-design"],
              deny: ["discord"],
            },
          },
          {
            id: "agent-b",
            skills: ["weather", "github"],
          },
          {
            id: "agent-c",
          },
        ],
      },
    };
    const result = OpenClawSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
