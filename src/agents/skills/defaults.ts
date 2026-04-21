import type { OpenClawConfig } from "../../config/config.js";
import type { AgentSkillsConfig } from "../../config/types.agents.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

let log: ReturnType<typeof createSubsystemLogger> | null = null;

function getLog(): ReturnType<typeof createSubsystemLogger> {
  log ??= createSubsystemLogger("skills");
  return log;
}

/**
 * Resolved per-agent skill set used by the filtering pipeline.
 *
 * - `names`: skill names the agent should receive.
 * - `isUnrestricted`: when true, no filtering is applied (all eligible skills pass through).
 * - `denied`: explicitly denied skill names (used for deny-list enforcement even in
 *   unrestricted mode — not currently needed but available for future use).
 */
export type ResolvedSkillSet = {
  names: Set<string>;
  isUnrestricted: boolean;
  denied: Set<string>;
};

/**
 * Resolve the system-level default skill set from global config.
 * Returns an empty array when `skills.defaults` is not configured.
 */
export function resolveSystemDefaults(config: OpenClawConfig): string[] {
  const defaults = config.skills?.defaults;
  if (!Array.isArray(defaults)) {
    return [];
  }
  return defaults.map((s) => (typeof s === "string" ? s.trim() : "")).filter((s) => s.length > 0);
}

/**
 * Resolve the effective skill set for a single agent.
 *
 * Algorithm (from design doc §3.3.1):
 *
 * 1. `skills: undefined` + empty systemDefaults → unrestricted (all skills)
 * 2. `skills: undefined` + non-empty systemDefaults → only default skills
 * 3. `skills: string[]` (legacy) → strict allowlist (backward compat)
 * 4. `skills: AgentSkillsConfig`:
 *    a. `noDefaults: true` → start from empty
 *    b. Add allowed skills to base
 *    c. Remove denied skills (deny always wins)
 */
export function resolveAgentSkillSet(
  agentSkills: AgentSkillsConfig | string[] | undefined,
  systemDefaults: string[],
): ResolvedSkillSet {
  // Case 1: No agent skills config
  if (agentSkills === undefined) {
    if (systemDefaults.length === 0) {
      return { names: new Set(), isUnrestricted: true, denied: new Set() };
    }
    return { names: new Set(systemDefaults), isUnrestricted: false, denied: new Set() };
  }

  // Case 2: Legacy string[] (strict allowlist)
  if (Array.isArray(agentSkills)) {
    const names = new Set(
      agentSkills
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    );
    return { names, isUnrestricted: false, denied: new Set() };
  }

  // Case 3: AgentSkillsConfig object
  const config = agentSkills;
  const base = config.noDefaults ? [] : systemDefaults;
  const allow = (config.allow ?? [])
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const deny = new Set(
    (config.deny ?? [])
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );

  const candidates = new Set([...base, ...allow]);
  for (const d of deny) {
    candidates.delete(d);
  }

  // Log debug if deny overlaps with allow
  const overlap = allow.filter((s) => deny.has(s));
  if (overlap.length > 0) {
    getLog().debug(`Skill deny overrides allow for: ${overlap.join(", ")}`);
  }

  return { names: candidates, isUnrestricted: false, denied: deny };
}

let defaultsWarningEmitted = false;

/**
 * Emit a one-time warning if `skills.defaults` is not configured.
 * Call this during startup / first skill resolution.
 */
export function warnIfDefaultsNotConfigured(config: OpenClawConfig): void {
  if (defaultsWarningEmitted) {
    return;
  }
  if (config.skills?.defaults === undefined) {
    getLog().warn(
      "skills.defaults is not configured. All agents will receive all eligible skills. " +
        "Set skills.defaults to explicitly control which skills are available by default.",
    );
    defaultsWarningEmitted = true;
  }
}

/**
 * Reset the warning flag (for testing purposes only).
 * @internal
 */
export function resetDefaultsWarningFlag(): void {
  defaultsWarningEmitted = false;
}
