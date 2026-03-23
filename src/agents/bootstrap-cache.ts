import { loadWorkspaceBootstrapFiles, type WorkspaceBootstrapFile } from "./workspace.js";

const cache = new Map<string, WorkspaceBootstrapFile[]>();

export async function getOrLoadBootstrapFiles(params: {
  workspaceDir: string;
  sessionKey: string;
  agentMemoryFile?: string;
}): Promise<WorkspaceBootstrapFile[]> {
  // When a per-agent memory file is specified, bypass the cache to ensure
  // the correct memory file is resolved for this agent.
  if (!params.agentMemoryFile) {
    const existing = cache.get(params.sessionKey);
    if (existing) {
      return existing;
    }
  }

  const files = await loadWorkspaceBootstrapFiles(params.workspaceDir, params.agentMemoryFile);
  if (!params.agentMemoryFile) {
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
