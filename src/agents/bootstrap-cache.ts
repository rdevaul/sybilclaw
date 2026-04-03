import { loadWorkspaceBootstrapFiles, type WorkspaceBootstrapFile } from "./workspace.js";

const cache = new Map<string, WorkspaceBootstrapFile[]>();

export async function getOrLoadBootstrapFiles(params: {
  workspaceDir: string;
  sessionKey: string;
  agentMemoryFiles?: string[];
  agentMemoryAllowedPaths?: string[];
}): Promise<WorkspaceBootstrapFile[]> {
  // When per-agent memory files or allowed paths are specified, bypass the cache to ensure
  // the correct memory files are resolved for this agent.
  if (!params.agentMemoryFiles && !params.agentMemoryAllowedPaths) {
    const existing = cache.get(params.sessionKey);
    if (existing) {
      return existing;
    }
  }

  const files = await loadWorkspaceBootstrapFiles(
    params.workspaceDir,
    params.agentMemoryFiles,
    params.agentMemoryAllowedPaths,
  );
  if (!params.agentMemoryFiles && !params.agentMemoryAllowedPaths) {
    cache.set(params.sessionKey, files);
  }
  return files;
}

export function clearBootstrapSnapshot(sessionKey: string): void {
  cache.delete(sessionKey);
}

export function clearBootstrapSnapshotOnSessionRollover(params: {
  sessionKey?: string;
  previousSessionId?: string;
}): void {
  if (!params.sessionKey || !params.previousSessionId) {
    return;
  }

  clearBootstrapSnapshot(params.sessionKey);
}

export function clearAllBootstrapSnapshots(): void {
  cache.clear();
}
