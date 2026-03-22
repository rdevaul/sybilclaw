import { afterEach, describe, expect, it } from "vitest";
import { emitAgentEvent } from "../infra/agent-events.js";
import { resetHeartbeatWakeStateForTests } from "../infra/heartbeat-wake.js";
import { peekSystemEvents, resetSystemEventsForTest } from "../infra/system-events.js";
import { withTempDir } from "../test-helpers/temp-dir.js";
import {
  createTaskRecord,
  findTaskByRunId,
  listTaskRecords,
  resetTaskRegistryForTests,
  resolveTaskForLookupToken,
  updateTaskRecordById,
} from "./task-registry.js";
import { reconcileInspectableTasks, sweepTaskRegistry } from "./task-registry.maintenance.js";

const ORIGINAL_STATE_DIR = process.env.OPENCLAW_STATE_DIR;

describe("task-registry", () => {
  afterEach(() => {
    if (ORIGINAL_STATE_DIR === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = ORIGINAL_STATE_DIR;
    }
    resetSystemEventsForTest();
    resetHeartbeatWakeStateForTests();
    resetTaskRegistryForTests();
  });

  it("updates task status from lifecycle events", async () => {
    await withTempDir({ prefix: "openclaw-task-registry-" }, async (root) => {
      process.env.OPENCLAW_STATE_DIR = root;
      resetTaskRegistryForTests();

      createTaskRecord({
        source: "sessions_spawn",
        runtime: "acp",
        requesterSessionKey: "agent:main:main",
        childSessionKey: "agent:main:acp:child",
        runId: "run-1",
        task: "Do the thing",
        status: "running",
        deliveryStatus: "not_applicable",
        startedAt: 100,
      });

      emitAgentEvent({
        runId: "run-1",
        stream: "assistant",
        data: {
          text: "working",
        },
      });
      emitAgentEvent({
        runId: "run-1",
        stream: "lifecycle",
        data: {
          phase: "end",
          endedAt: 250,
        },
      });

      expect(findTaskByRunId("run-1")).toMatchObject({
        runtime: "acp",
        status: "done",
        endedAt: 250,
      });
    });
  });

  it("queues ACP completion fallback delivery when a task ends", async () => {
    await withTempDir({ prefix: "openclaw-task-registry-" }, async (root) => {
      process.env.OPENCLAW_STATE_DIR = root;
      resetTaskRegistryForTests();

      createTaskRecord({
        source: "sessions_spawn",
        runtime: "acp",
        requesterSessionKey: "agent:main:main",
        childSessionKey: "agent:main:acp:child",
        runId: "run-delivery",
        task: "Investigate issue",
        status: "running",
        deliveryStatus: "pending",
        startedAt: 100,
      });

      emitAgentEvent({
        runId: "run-delivery",
        stream: "lifecycle",
        data: {
          phase: "end",
          endedAt: 250,
        },
      });

      expect(findTaskByRunId("run-delivery")).toMatchObject({
        status: "done",
        deliveryStatus: "delivered",
      });
      expect(peekSystemEvents("agent:main:main")).toEqual([
        expect.stringContaining("Background task done: Investigate issue"),
      ]);
    });
  });

  it("keeps distinct task records when different producers share a runId", async () => {
    await withTempDir({ prefix: "openclaw-task-registry-" }, async (root) => {
      process.env.OPENCLAW_STATE_DIR = root;
      resetTaskRegistryForTests();

      createTaskRecord({
        source: "background_cli",
        runtime: "cli",
        requesterSessionKey: "agent:codex:acp:child",
        childSessionKey: "agent:codex:acp:child",
        runId: "run-shared",
        task: "Child ACP execution",
        status: "running",
        deliveryStatus: "not_applicable",
      });

      createTaskRecord({
        source: "sessions_spawn",
        runtime: "acp",
        requesterSessionKey: "agent:main:main",
        childSessionKey: "agent:codex:acp:child",
        runId: "run-shared",
        task: "Spawn ACP child",
        status: "running",
        deliveryStatus: "pending",
      });

      expect(listTaskRecords().filter((task) => task.runId === "run-shared")).toHaveLength(2);
      expect(findTaskByRunId("run-shared")).toMatchObject({
        source: "sessions_spawn",
        runtime: "acp",
        task: "Spawn ACP child",
      });
    });
  });

  it("restores persisted tasks from disk on the next lookup", async () => {
    await withTempDir({ prefix: "openclaw-task-registry-" }, async (root) => {
      process.env.OPENCLAW_STATE_DIR = root;
      resetTaskRegistryForTests();

      const task = createTaskRecord({
        source: "sessions_spawn",
        runtime: "subagent",
        requesterSessionKey: "agent:main:main",
        childSessionKey: "agent:main:subagent:child",
        runId: "run-restore",
        task: "Restore me",
        status: "running",
        deliveryStatus: "pending",
      });

      resetTaskRegistryForTests({
        persist: false,
      });

      expect(resolveTaskForLookupToken(task.taskId)).toMatchObject({
        taskId: task.taskId,
        runId: "run-restore",
        task: "Restore me",
      });
    });
  });

  it("marks inspection-time orphaned tasks as lost", async () => {
    await withTempDir({ prefix: "openclaw-task-registry-" }, async (root) => {
      process.env.OPENCLAW_STATE_DIR = root;
      resetTaskRegistryForTests();

      const task = createTaskRecord({
        source: "sessions_spawn",
        runtime: "acp",
        requesterSessionKey: "agent:main:main",
        childSessionKey: "agent:main:acp:missing",
        runId: "run-lost",
        task: "Missing child",
        status: "running",
        deliveryStatus: "pending",
      });
      updateTaskRecordById(task.taskId, {
        lastEventAt: Date.now() - 10 * 60_000,
      });

      const tasks = reconcileInspectableTasks();
      expect(tasks[0]).toMatchObject({
        runId: "run-lost",
        status: "lost",
        error: "backing session missing",
      });
      expect(peekSystemEvents("agent:main:main")).toEqual([
        expect.stringContaining("Background task lost: Missing child"),
      ]);
    });
  });

  it("prunes old terminal tasks during maintenance sweeps", async () => {
    await withTempDir({ prefix: "openclaw-task-registry-" }, async (root) => {
      process.env.OPENCLAW_STATE_DIR = root;
      resetTaskRegistryForTests();

      const task = createTaskRecord({
        source: "background_cli",
        runtime: "cli",
        requesterSessionKey: "agent:main:main",
        childSessionKey: "agent:main:main",
        runId: "run-prune",
        task: "Old completed task",
        status: "done",
        deliveryStatus: "not_applicable",
        startedAt: Date.now() - 9 * 24 * 60 * 60_000,
      });
      updateTaskRecordById(task.taskId, {
        endedAt: Date.now() - 8 * 24 * 60 * 60_000,
        lastEventAt: Date.now() - 8 * 24 * 60 * 60_000,
      });

      expect(sweepTaskRegistry()).toEqual({
        reconciled: 0,
        pruned: 1,
      });
      expect(listTaskRecords()).toEqual([]);
    });
  });
});
