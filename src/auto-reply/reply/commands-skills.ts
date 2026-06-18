import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { resolveEffectiveAgentSkillFilter } from "../../agents/skills/agent-filter.js";
import {
  filterWorkspaceSkillEntries,
  loadWorkspaceSkillEntries,
  type SkillEntry,
} from "../../agents/skills.js";
import { mutateConfigFile } from "../../config/config.js";
import { logVerbose } from "../../globals.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import type { CommandHandler } from "./commands-types.js";

/**
 * Port of the legacy SybilClaw `/skills` operator command, adapted to the
 * native upstream skill-filtering API.
 *
 * Native model (see src/config/types.agents.ts): an agent's `skills` field is a
 * simple `string[]` allowlist. When present it REPLACES `agents.defaults.skills`
 * (it does not merge). When absent the agent inherits `agents.defaults.skills`.
 * `resolveEffectiveAgentSkillFilter` returns the effective allowlist, or
 * `undefined` when no filter is configured at any level (unrestricted: every
 * eligible workspace skill is active).
 *
 * The old command modeled skills as an `AgentSkillsConfig` with separate
 * `allow`/`deny` arrays plus a notion of "system defaults". The base has no
 * allow/deny split and no `resolveSystemDefaults`. So enable/disable here
 * operate purely on the single allowlist: to enable/disable a skill when the
 * agent is currently unrestricted (or inheriting defaults), we first
 * MATERIALIZE the effective set, then add/remove the named skill and persist it
 * as the per-agent `skills` array.
 */

function skillEntryName(entry: SkillEntry): string {
  return entry.skill.name;
}

function formatSkillList(names: string[], indent = "  "): string {
  if (names.length === 0) {
    return `${indent}(none)`;
  }
  const lines: string[] = [];
  let currentLine = indent;
  for (let i = 0; i < names.length; i++) {
    const separator = i > 0 ? ", " : "";
    const candidate = currentLine + separator + names[i];
    if (candidate.length > 70 && currentLine !== indent) {
      lines.push(currentLine);
      currentLine = indent + names[i];
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine !== indent) {
    lines.push(currentLine);
  }
  return lines.join("\n");
}

function loadAllEntries(workspaceDir: string, cfg: unknown): SkillEntry[] {
  // Eligible workspace skills, unfiltered by the per-agent allowlist.
  return filterWorkspaceSkillEntries(
    loadWorkspaceSkillEntries(workspaceDir, {
      config: cfg as never,
    }),
    cfg as never,
  );
}

function buildSkillsListReply(params: {
  agentId: string;
  effectiveFilter: string[] | undefined;
  hasAgentOverride: boolean;
  allNames: string[];
}): string {
  const { agentId, effectiveFilter, hasAgentOverride, allNames } = params;

  if (effectiveFilter === undefined) {
    const lines = [
      `📋 Active Skills for ${agentId}`,
      "",
      "Mode: unrestricted (no skill filter configured)",
      "",
      `All eligible skills (${allNames.length}):`,
      formatSkillList(allNames),
      "",
      `Total: ${allNames.length} active skills`,
    ];
    return lines.join("\n");
  }

  const allowSet = new Set(effectiveFilter);
  const active = allNames.filter((n) => allowSet.has(n));
  // Names in the filter that don't correspond to an installed skill.
  const missing = effectiveFilter.filter((n) => !allNames.includes(n)).toSorted();

  const source = hasAgentOverride
    ? "agent override (agents.list[].skills)"
    : "inherited from agents.defaults.skills";

  const lines = [
    `📋 Active Skills for ${agentId}`,
    "",
    `Mode: filtered — ${source}`,
    "",
    `Active (${active.length}):`,
    formatSkillList(active.toSorted()),
  ];
  if (missing.length > 0) {
    lines.push("", `In filter but not installed (${missing.length}):`, formatSkillList(missing));
  }
  lines.push("", `Total: ${active.length} active skills`);
  return lines.join("\n");
}

function buildSkillsAllReply(params: {
  agentId: string;
  effectiveFilter: string[] | undefined;
  allNames: string[];
}): string {
  const { agentId, effectiveFilter, allNames } = params;
  const sorted = allNames.toSorted();
  const allowSet = effectiveFilter === undefined ? undefined : new Set(effectiveFilter);

  const activeCount =
    allowSet === undefined ? sorted.length : sorted.filter((n) => allowSet.has(n)).length;

  const lines = [
    `📋 All Installed Skills (${sorted.length} total, ${activeCount} active for ${agentId})`,
    "",
  ];

  for (const name of sorted) {
    const isActive = allowSet === undefined || allowSet.has(name);
    if (isActive) {
      lines.push(`✅ ${name} (enabled)`);
    } else {
      lines.push(`❌ ${name} (disabled)`);
    }
  }

  return lines.join("\n");
}

/**
 * Materialize the effective allowlist for an agent into a concrete `string[]`.
 * If the agent is unrestricted (no filter at any level), the effective set is
 * every eligible workspace skill name.
 */
function materializeEffectiveSet(
  effectiveFilter: string[] | undefined,
  allNames: string[],
): string[] {
  if (effectiveFilter === undefined) {
    return [...allNames];
  }
  return [...effectiveFilter];
}

async function handleSkillEnable(params: {
  agentId: string;
  skillName: string;
  effectiveFilter: string[] | undefined;
  allNames: string[];
}): Promise<string> {
  const { agentId, skillName, effectiveFilter, allNames } = params;
  if (!allNames.includes(skillName)) {
    return `❌ Unknown skill: **${skillName}** — run /skills all to see available skills`;
  }

  const base = materializeEffectiveSet(effectiveFilter, allNames);
  if (effectiveFilter !== undefined && base.includes(skillName)) {
    return `ℹ️ Skill **${skillName}** is already enabled for ${agentId}`;
  }

  const normalizedId = normalizeAgentId(agentId);
  await mutateConfigFile({
    mutate: (draft) => {
      const agents = draft.agents?.list;
      if (!Array.isArray(agents)) {
        return;
      }
      const agent = agents.find((a) => normalizeAgentId(a.id) === normalizedId);
      if (!agent) {
        return;
      }
      const next = new Set(materializeEffectiveSet(effectiveFilter, allNames));
      next.add(skillName);
      agent.skills = Array.from(next).toSorted();
    },
  });

  return `✅ Enabled skill **${skillName}** for ${agentId}`;
}

async function handleSkillDisable(params: {
  agentId: string;
  skillName: string;
  effectiveFilter: string[] | undefined;
  allNames: string[];
}): Promise<string> {
  const { agentId, skillName, effectiveFilter, allNames } = params;
  if (!allNames.includes(skillName)) {
    return `❌ Unknown skill: **${skillName}** — run /skills all to see available skills`;
  }

  const base = materializeEffectiveSet(effectiveFilter, allNames);
  if (!base.includes(skillName)) {
    return `ℹ️ Skill **${skillName}** is already disabled for ${agentId}`;
  }

  const normalizedId = normalizeAgentId(agentId);
  await mutateConfigFile({
    mutate: (draft) => {
      const agents = draft.agents?.list;
      if (!Array.isArray(agents)) {
        return;
      }
      const agent = agents.find((a) => normalizeAgentId(a.id) === normalizedId);
      if (!agent) {
        return;
      }
      const next = materializeEffectiveSet(effectiveFilter, allNames).filter(
        (n) => n !== skillName,
      );
      agent.skills = next.toSorted();
    },
  });

  return `✅ Disabled skill **${skillName}** for ${agentId}`;
}

async function handleSkillReset(agentId: string): Promise<string> {
  const normalizedId = normalizeAgentId(agentId);
  await mutateConfigFile({
    mutate: (draft) => {
      const agents = draft.agents?.list;
      if (!Array.isArray(agents)) {
        return;
      }
      const agent = agents.find((a) => normalizeAgentId(a.id) === normalizedId);
      if (!agent) {
        return;
      }
      delete agent.skills;
    },
  });

  return `✅ Reset skills for **${agentId}** — now inherits agents.defaults.skills`;
}

export const handleSkillsCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const normalized = params.command.commandBodyNormalized;
  if (normalized !== "/skills" && !normalized.startsWith("/skills ")) {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /skills from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  const args = normalized.slice("/skills".length).trim();
  const subcommand = args.split(/\s+/)[0] ?? "";

  try {
    const agentId =
      params.agentId ??
      resolveSessionAgentId({ sessionKey: params.sessionKey, config: params.cfg });

    // enable/disable/reset subcommands mutate config.
    if (subcommand === "enable" || subcommand === "disable" || subcommand === "reset") {
      if (subcommand === "reset") {
        const text = await handleSkillReset(agentId);
        return { shouldContinue: false, reply: { text } };
      }

      const skillName = args.slice(subcommand.length).trim();
      if (!skillName) {
        return {
          shouldContinue: false,
          reply: { text: `Usage: /skills ${subcommand} <name>` },
        };
      }

      const effectiveFilter = resolveEffectiveAgentSkillFilter(params.cfg, agentId);
      const allNames = loadAllEntries(params.workspaceDir, params.cfg)
        .map(skillEntryName)
        .toSorted();

      const text =
        subcommand === "enable"
          ? await handleSkillEnable({ agentId, skillName, effectiveFilter, allNames })
          : await handleSkillDisable({ agentId, skillName, effectiveFilter, allNames });

      return { shouldContinue: false, reply: { text } };
    }

    // list/all read-only views.
    if (args && args !== "list" && args !== "all") {
      return {
        shouldContinue: false,
        reply: {
          text: "Usage: /skills [list|all|enable <name>|disable <name>|reset]",
        },
      };
    }

    const showAll = args === "all";
    const effectiveFilter = resolveEffectiveAgentSkillFilter(params.cfg, agentId);
    // Read the RAW agent list entry (not resolveAgentConfig, which always
    // materializes a `skills` key) to detect a genuine per-agent override.
    const normalizedId = normalizeAgentId(agentId);
    const agentEntry = params.cfg.agents?.list?.find(
      (a) => normalizeAgentId(a.id) === normalizedId,
    );
    const hasAgentOverride = Boolean(
      agentEntry && Object.hasOwn(agentEntry, "skills") && agentEntry.skills !== undefined,
    );
    const allNames = loadAllEntries(params.workspaceDir, params.cfg)
      .map(skillEntryName)
      .toSorted();

    const text = showAll
      ? buildSkillsAllReply({ agentId, effectiveFilter, allNames })
      : buildSkillsListReply({ agentId, effectiveFilter, hasAgentOverride, allNames });

    return { shouldContinue: false, reply: { text } };
  } catch (err) {
    const message = String(err);
    return {
      shouldContinue: false,
      reply: { text: `❌ Failed to process /skills: ${message}` },
    };
  }
};
