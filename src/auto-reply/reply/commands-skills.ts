import {
  resolveSessionAgentId,
  resolveAgentResolvedSkillSet,
  resolveAgentConfig,
} from "../../agents/agent-scope.js";
import {
  loadWorkspaceSkillEntries,
  filterWorkspaceSkillEntries,
  type SkillEntry,
} from "../../agents/skills.js";
import { resolveSystemDefaults, type ResolvedSkillSet } from "../../agents/skills/defaults.js";
import { logVerbose } from "../../globals.js";
import type { CommandHandler } from "./commands-types.js";

function formatSkillList(names: string[], indent = "  "): string {
  if (names.length === 0) {
    return `${indent}(none)`;
  }
  // Wrap at ~60 chars per line
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

function buildSkillsListReply(params: {
  agentId: string;
  resolved: ResolvedSkillSet;
  systemDefaults: string[];
  agentDeny: string[];
  allEntries: SkillEntry[];
}): string {
  const { agentId, resolved, systemDefaults, agentDeny, allEntries } = params;

  if (resolved.isUnrestricted) {
    const eligibleNames = allEntries.map((e) => e.skill.name).toSorted();
    const lines = [
      `📋 Active Skills for ${agentId}`,
      "",
      "Mode: unrestricted (no skill filtering configured)",
      "",
      `All eligible skills (${eligibleNames.length}):`,
      formatSkillList(eligibleNames),
    ];
    if (agentDeny.length > 0) {
      lines.push("", `Denied (${agentDeny.length}):`, formatSkillList(agentDeny));
    }
    lines.push("", `Total: ${eligibleNames.length} active skills`);
    return lines.join("\n");
  }

  // Categorize active skills
  const defaultSet = new Set(systemDefaults);
  const activeNames = Array.from(resolved.names).toSorted();
  const defaultActive = activeNames.filter((n) => defaultSet.has(n));
  const agentAdditions = activeNames.filter((n) => !defaultSet.has(n));

  const lines = [`📋 Active Skills for ${agentId}`, ""];

  if (defaultActive.length > 0) {
    lines.push(`System defaults (${defaultActive.length}):`, formatSkillList(defaultActive), "");
  }

  if (agentAdditions.length > 0) {
    lines.push(`Agent additions (${agentAdditions.length}):`, formatSkillList(agentAdditions), "");
  }

  if (agentDeny.length > 0) {
    lines.push(`Denied (${agentDeny.length}):`, formatSkillList(agentDeny), "");
  } else {
    lines.push("Denied: (none)", "");
  }

  lines.push(`Total: ${activeNames.length} active skills`);
  return lines.join("\n");
}

function buildSkillsAllReply(params: {
  agentId: string;
  resolved: ResolvedSkillSet;
  systemDefaults: string[];
  allEntries: SkillEntry[];
}): string {
  const { agentId, resolved, systemDefaults, allEntries } = params;
  const defaultSet = new Set(systemDefaults);
  const allNames = allEntries.map((e) => e.skill.name).toSorted();

  const activeCount = resolved.isUnrestricted
    ? allNames.length
    : allNames.filter((n) => resolved.names.has(n)).length;

  const lines = [
    `📋 All Installed Skills (${allNames.length} total, ${activeCount} active for ${agentId})`,
    "",
  ];

  for (const name of allNames) {
    const isActive = resolved.isUnrestricted || resolved.names.has(name);
    const isDenied = resolved.denied.has(name);
    const isDefault = defaultSet.has(name);

    if (isDenied) {
      lines.push(`❌ ${name} (denied)`);
    } else if (isActive && isDefault) {
      lines.push(`✅ ${name} (default)`);
    } else if (isActive) {
      lines.push(`✅ ${name} (agent allow)`);
    } else {
      lines.push(`❌ ${name} (not in allow list)`);
    }
  }

  return lines.join("\n");
}

export const handleSkillsCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const normalized = params.command.commandBodyNormalized;
  if (
    normalized !== "/skills" &&
    normalized !== "/skills list" &&
    normalized !== "/skills all" &&
    !normalized.startsWith("/skills ")
  ) {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /skills from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  // Parse mode
  const args = normalized.slice("/skills".length).trim();
  if (args && args !== "list" && args !== "all") {
    return {
      shouldContinue: false,
      reply: { text: "Usage: /skills [list|all]" },
    };
  }
  const showAll = args === "all";

  try {
    const agentId =
      params.agentId ??
      resolveSessionAgentId({ sessionKey: params.sessionKey, config: params.cfg });

    const systemDefaults = resolveSystemDefaults(params.cfg);
    const resolved = resolveAgentResolvedSkillSet(params.cfg, agentId);

    // Load all eligible workspace skill entries (unfiltered by agent)
    const allEntries = filterWorkspaceSkillEntries(
      loadWorkspaceSkillEntries(params.workspaceDir, { config: params.cfg }),
      params.cfg,
    );

    // Extract agent deny from config
    const agentConfig = resolveAgentConfig(params.cfg, agentId);
    const agentSkills = agentConfig?.skills;
    const agentDeny: string[] =
      agentSkills && !Array.isArray(agentSkills)
        ? (agentSkills.deny ?? []).filter((s): s is string => typeof s === "string")
        : [];

    const text = showAll
      ? buildSkillsAllReply({ agentId, resolved, systemDefaults, allEntries })
      : buildSkillsListReply({
          agentId,
          resolved,
          systemDefaults,
          agentDeny,
          allEntries,
        });

    return { shouldContinue: false, reply: { text } };
  } catch (err) {
    const message = String(err);
    return {
      shouldContinue: false,
      reply: { text: `❌ Failed to resolve skills: ${message}` },
    };
  }
};
