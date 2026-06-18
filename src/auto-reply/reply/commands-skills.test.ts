import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { handleSkillsCommand } from "./commands-skills.js";
import { buildCommandTestParams } from "./commands.test-harness.js";
import type { HandleCommandsParams } from "./commands-types.js";

const mutateConfigFileMock = vi.hoisted(() => vi.fn());
const loadWorkspaceSkillEntriesMock = vi.hoisted(() => vi.fn());
const filterWorkspaceSkillEntriesMock = vi.hoisted(() => vi.fn());

vi.mock("../../config/config.js", () => ({
  mutateConfigFile: mutateConfigFileMock,
}));

vi.mock("../../agents/skills.js", () => ({
  loadWorkspaceSkillEntries: loadWorkspaceSkillEntriesMock,
  filterWorkspaceSkillEntries: filterWorkspaceSkillEntriesMock,
}));

const ALL_SKILL_NAMES = ["alpha", "bravo", "charlie", "delta"];

function makeEntry(name: string) {
  return { skill: { name } };
}

function buildParams(commandBody: string, cfg: OpenClawConfig): HandleCommandsParams {
  const params = buildCommandTestParams(commandBody, cfg);
  // Drive agent resolution deterministically.
  params.agentId = "main";
  return params;
}

/**
 * Apply a captured mutateConfigFile mutation against a draft config and return
 * the resulting per-agent skills array.
 */
async function applyMutation(cfg: OpenClawConfig): Promise<string[] | undefined> {
  expect(mutateConfigFileMock).toHaveBeenCalledTimes(1);
  const arg = mutateConfigFileMock.mock.calls[0][0] as {
    mutate: (draft: OpenClawConfig) => unknown;
  };
  const draft = structuredClone(cfg);
  await arg.mutate(draft);
  return draft.agents?.list?.find((a) => a.id === "main")?.skills;
}

beforeEach(() => {
  vi.clearAllMocks();
  loadWorkspaceSkillEntriesMock.mockReturnValue(ALL_SKILL_NAMES.map(makeEntry));
  // filterWorkspaceSkillEntries is called with (entries, cfg); pass through.
  filterWorkspaceSkillEntriesMock.mockImplementation((entries: unknown) => entries);
  mutateConfigFileMock.mockResolvedValue({});
});

describe("handleSkillsCommand", () => {
  it("ignores unrelated commands and unauthorized senders", async () => {
    const cfg = { commands: { text: true } } as OpenClawConfig;

    expect(await handleSkillsCommand(buildParams("/tools", cfg), true)).toBeNull();
    expect(await handleSkillsCommand(buildParams("/skills", cfg), false)).toBeNull();

    const unauthorized = buildParams("/skills", cfg);
    unauthorized.command.isAuthorizedSender = false;
    const res = await handleSkillsCommand(unauthorized, true);
    expect(res).toEqual({ shouldContinue: false });
  });

  it("lists active (filtered) skills for the agent", async () => {
    const cfg = {
      commands: { text: true },
      agents: { list: [{ id: "main", skills: ["alpha", "charlie"] }] },
    } as unknown as OpenClawConfig;

    const res = await handleSkillsCommand(buildParams("/skills", cfg), true);
    expect(res?.shouldContinue).toBe(false);
    const text = res?.reply?.text ?? "";
    expect(text).toContain("Active Skills for main");
    expect(text).toContain("Mode: filtered");
    expect(text).toContain("agent override");
    expect(text).toContain("alpha");
    expect(text).toContain("charlie");
    expect(text).not.toContain("bravo,");
    expect(text).toContain("Total: 2 active skills");
  });

  it("reports unrestricted mode when no filter is configured", async () => {
    const cfg = {
      commands: { text: true },
      agents: { list: [{ id: "main" }] },
    } as unknown as OpenClawConfig;

    const res = await handleSkillsCommand(buildParams("/skills list", cfg), true);
    const text = res?.reply?.text ?? "";
    expect(text).toContain("Mode: unrestricted");
    expect(text).toContain(`Total: ${ALL_SKILL_NAMES.length} active skills`);
  });

  it("marks enabled/disabled skills in /skills all", async () => {
    const cfg = {
      commands: { text: true },
      agents: { list: [{ id: "main", skills: ["alpha", "delta"] }] },
    } as unknown as OpenClawConfig;

    const res = await handleSkillsCommand(buildParams("/skills all", cfg), true);
    const text = res?.reply?.text ?? "";
    expect(text).toContain("✅ alpha (enabled)");
    expect(text).toContain("✅ delta (enabled)");
    expect(text).toContain("❌ bravo (disabled)");
    expect(text).toContain("❌ charlie (disabled)");
    expect(text).toContain("4 total, 2 active");
  });

  it("enable adds a skill to the agent allowlist (mutates config)", async () => {
    const cfg = {
      commands: { text: true },
      agents: { list: [{ id: "main", skills: ["alpha"] }] },
    } as unknown as OpenClawConfig;

    const res = await handleSkillsCommand(buildParams("/skills enable bravo", cfg), true);
    expect(res?.reply?.text).toContain("Enabled skill **bravo**");
    const skills = await applyMutation(cfg);
    expect(skills).toEqual(["alpha", "bravo"]);
  });

  it("enable on an unrestricted agent materializes the full set first", async () => {
    const cfg = {
      commands: { text: true },
      agents: { list: [{ id: "main" }] },
    } as unknown as OpenClawConfig;

    // Enabling an already-present skill still materializes (unrestricted -> explicit).
    const res = await handleSkillsCommand(buildParams("/skills enable alpha", cfg), true);
    expect(res?.reply?.text).toContain("Enabled skill **alpha**");
    const skills = await applyMutation(cfg);
    expect(skills).toEqual([...ALL_SKILL_NAMES].sort());
  });

  it("rejects enabling an unknown skill without mutating config", async () => {
    const cfg = {
      commands: { text: true },
      agents: { list: [{ id: "main", skills: ["alpha"] }] },
    } as unknown as OpenClawConfig;

    const res = await handleSkillsCommand(buildParams("/skills enable nope", cfg), true);
    expect(res?.reply?.text).toContain("Unknown skill");
    expect(mutateConfigFileMock).not.toHaveBeenCalled();
  });

  it("disable removes a skill from the agent allowlist (mutates config)", async () => {
    const cfg = {
      commands: { text: true },
      agents: { list: [{ id: "main", skills: ["alpha", "bravo", "charlie"] }] },
    } as unknown as OpenClawConfig;

    const res = await handleSkillsCommand(buildParams("/skills disable bravo", cfg), true);
    expect(res?.reply?.text).toContain("Disabled skill **bravo**");
    const skills = await applyMutation(cfg);
    expect(skills).toEqual(["alpha", "charlie"]);
  });

  it("disable on an unrestricted agent materializes the full set minus the skill", async () => {
    const cfg = {
      commands: { text: true },
      agents: { list: [{ id: "main" }] },
    } as unknown as OpenClawConfig;

    const res = await handleSkillsCommand(buildParams("/skills disable charlie", cfg), true);
    expect(res?.reply?.text).toContain("Disabled skill **charlie**");
    const skills = await applyMutation(cfg);
    expect(skills).toEqual(["alpha", "bravo", "delta"]);
  });

  it("reset clears the per-agent skills override (mutates config)", async () => {
    const cfg = {
      commands: { text: true },
      agents: { list: [{ id: "main", skills: ["alpha"] }] },
    } as unknown as OpenClawConfig;

    const res = await handleSkillsCommand(buildParams("/skills reset", cfg), true);
    expect(res?.reply?.text).toContain("Reset skills for **main**");
    const skills = await applyMutation(cfg);
    expect(skills).toBeUndefined();
  });

  it("returns usage text for an unknown subcommand", async () => {
    const cfg = {
      commands: { text: true },
      agents: { list: [{ id: "main" }] },
    } as unknown as OpenClawConfig;

    const res = await handleSkillsCommand(buildParams("/skills wat", cfg), true);
    expect(res?.reply?.text).toContain("Usage: /skills");
    expect(mutateConfigFileMock).not.toHaveBeenCalled();
  });
});
