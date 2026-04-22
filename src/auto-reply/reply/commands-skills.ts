import { resolveSessionAgentId, resolveAgentConfig } from "../../agents/agent-scope.js";
import {
  loadWorkspaceSkillEntries,
  filterWorkspaceSkillEntries,
  type SkillEntry,
} from "../../agents/skills.js";
import { resolveSystemDefaults, type ResolvedSkillSet } from "../../agents/skills/defaults.js";
import { mutateConfigFile } from "../../config/config.js";
import type { AgentSkillsConfig } from "../../config/types.agents.js";
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

/**
 * Normalize an agent's `skills` field to `AgentSkillsConfig`, handling the legacy `string[]` format.
 */
function toSkillsConfig(skills: AgentSkillsConfig | string[] | undefined): AgentSkillsConfig {
  if (!skills) {
    return {};
  }
  if (Array.isArray(skills)) {
    return { allow: [...skills] };
  }
  return skills;
}

async function handleSkillEnable(
  agentId: string,
  skillName: string,
  allEntries: SkillEntry[],
): Promise<string> {
  const exists = allEntries.some((e) => e.skill.name === skillName);
  if (!exists) {
    return `❌ Unknown skill: **${skillName}** — run /skills all to see available skills`;
  }

  await mutateConfigFile({
    mutate: (draft) => {
      const agents = draft.agents?.list;
      if (!Array.isArray(agents)) {
        return;
      }
      const agent = agents.find((a) => a.id === agentId);
      if (!agent) {
        return;
      }

      const cfg = toSkillsConfig(agent.skills);

      // Add to allow if not already present
      if (!cfg.allow) {
        cfg.allow = [];
      }
      if (!cfg.allow.includes(skillName)) {
        cfg.allow.push(skillName);
      }

      // Remove from deny if present
      if (cfg.deny) {
        cfg.deny = cfg.deny.filter((s) => s !== skillName);
        if (cfg.deny.length === 0) {
          delete cfg.deny;
        }
      }

      agent.skills = cfg;
    },
  });

  return `✅ Enabled skill **${skillName}** for ${agentId}`;
}

async function handleSkillDisable(
  agentId: string,
  skillName: string,
  allEntries: SkillEntry[],
): Promise<string> {
  const exists = allEntries.some((e) => e.skill.name === skillName);
  if (!exists) {
    return `❌ Unknown skill: **${skillName}** — run /skills all to see available skills`;
  }

  await mutateConfigFile({
    mutate: (draft) => {
      const agents = draft.agents?.list;
      if (!Array.isArray(agents)) {
        return;
      }
      const agent = agents.find((a) => a.id === agentId);
      if (!agent) {
        return;
      }

      const cfg = toSkillsConfig(agent.skills);

      // Add to deny if not already present
      if (!cfg.deny) {
        cfg.deny = [];
      }
      if (!cfg.deny.includes(skillName)) {
        cfg.deny.push(skillName);
      }

      // Remove from allow if present
      if (cfg.allow) {
        cfg.allow = cfg.allow.filter((s) => s !== skillName);
        if (cfg.allow.length === 0) {
          delete cfg.allow;
        }
      }

      agent.skills = cfg;
    },
  });

  return `✅ Disabled skill **${skillName}** for ${agentId}`;
}

async function handleSkillReset(agentId: string): Promise<string> {
  await mutateConfigFile({
    mutate: (draft) => {
      const agents = draft.agents?.list;
      if (!Array.isArray(agents)) {
        return;
      }
      const agent = agents.find((a) => a.id === agentId);
      if (!agent) {
        return;
      }

      delete agent.skills;
    },
  });

  return `✅ Reset skills for **${agentId}** to system defaults`;
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
    normalized !== "/skills reset" &&
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
  const subcommand = args.split(/\s+/)[0] ?? "";

  // Route enable/disable/reset subcommands
  if (subcommand === "enable" || subcommand === "disable" || subcommand === "reset") {
    try {
      const agentId =
        params.agentId ??
        resolveSessionAgentId({ sessionKey: params.sessionKey, config: params.cfg });

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

      // Load all eligible workspace skill entries (unfiltered by agent)
      const allEntries = filterWorkspaceSkillEntries(
        loadWorkspaceSkillEntries(params.workspaceDir, { config: params.cfg }),
        params.cfg,
      );

      const text =
        subcommand === "enable"
          ? await handleSkillEnable(agentId, skillName, allEntries)
          : await handleSkillDisable(agentId, skillName, allEntries);

      return { shouldContinue: false, reply: { text } };
    } catch (err) {
      const message = String(err);
      return {
        shouldContinue: false,
        reply: { text: `❌ Failed to update skills: ${message}` },
      };
    }
  }

  // Original list/all handling
  if (args && args !== "list" && args !== "all") {
    return {
      shouldContinue: false,
      reply: { text: "Usage: /skills [list|all|enable <name>|disable <name>|reset]" },
    };
  }
  const showAll = args === "all";

  try {
    const agentId =
      params.agentId ??
      resolveSessionAgentId({ sessionKey: params.sessionKey, config: params.cfg });

    const systemDefaults = resolveSystemDefaults(params.cfg);
    const agentConfig = resolveAgentConfig(params.cfg, agentId);
    const agentSkillsRaw: string[] | AgentSkillsConfig | undefined = agentConfig?.skills;

    // Inline resolveAgentResolvedSkillSet logic
    const names = new Set<string>();
    const denied = new Set<string>();
    let isUnrestricted: boolean;
    if (!agentSkillsRaw || Array.isArray(agentSkillsRaw)) {
      isUnrestricted = true;
      if (Array.isArray(agentSkillsRaw)) {
        for (const n of agentSkillsRaw) {
          names.add(n);
        }
      } else {
        for (const n of systemDefaults) {
          names.add(n);
        }
      }
    } else {
      isUnrestricted = false;
      // agentSkillsRaw is AgentSkillsConfig here
      const allowList = agentSkillsRaw.allow ?? [];
      const denyList = agentSkillsRaw.deny ?? [];
      const base: string[] = allowList.length > 0 ? allowList : [...systemDefaults];
      for (const n of base) {
        if (!denyList.includes(n)) {
          names.add(n);
        }
      }
      for (const n of denyList) {
        denied.add(n);
      }
    }
    const resolved: ResolvedSkillSet = { names, denied, isUnrestricted };

    const agentDeny: string[] = Array.from(denied);

    // Load all eligible workspace skill entries (unfiltered by agent)
    const allEntries = filterWorkspaceSkillEntries(
      loadWorkspaceSkillEntries(params.workspaceDir, { config: params.cfg }),
      params.cfg,
    );

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
