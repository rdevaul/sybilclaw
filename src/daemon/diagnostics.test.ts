// Daemon diagnostics tests cover service diagnostic collection and formatting.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLastGatewayErrorLine } from "./diagnostics.js";
import { resolveLaunchAgentPlistPath } from "./launchd.js";
import { resolveGatewayLogPaths, resolveGatewaySupervisorLogPaths } from "./restart-logs.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempStateDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-daemon-diagnostics-"));
  tempDirs.push(dir);
  return dir;
}

describe("readLastGatewayErrorLine", () => {
  it("ignores stale launchd stderr when stderr is suppressed", async () => {
    const stateDir = makeTempStateDir();
    const homeDir = makeTempStateDir();
    const env = { HOME: homeDir, OPENCLAW_STATE_DIR: stateDir };
    const stateLogs = resolveGatewayLogPaths(env);
    const launchdLogs = resolveGatewaySupervisorLogPaths(env, { platform: "darwin" });
    fs.mkdirSync(stateLogs.logDir, { recursive: true });
    fs.mkdirSync(launchdLogs.logDir, { recursive: true });
    fs.writeFileSync(stateLogs.stderrPath, "failed to bind gateway socket stale\n", "utf8");
    fs.writeFileSync(launchdLogs.stdoutPath, "gateway stdout current\n", "utf8");

    await expect(readLastGatewayErrorLine(env, { platform: "darwin" })).resolves.toBe(
      "gateway stdout current",
    );
  });

  it("reads launchd stderr when the installed plist captures it", async () => {
    const stateDir = makeTempStateDir();
    const homeDir = makeTempStateDir();
    const env = { HOME: homeDir, OPENCLAW_STATE_DIR: stateDir };
    const launchdLogs = resolveGatewaySupervisorLogPaths(env, { platform: "darwin" });
    fs.mkdirSync(launchdLogs.logDir, { recursive: true });
    fs.writeFileSync(launchdLogs.stderrPath, "failed to bind gateway socket EADDRINUSE\n", "utf8");
    fs.writeFileSync(launchdLogs.stdoutPath, "gateway stdout current\n", "utf8");

    const plistPath = resolveLaunchAgentPlistPath(env);
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.writeFileSync(
      plistPath,
      `<plist version="1.0">\n  <dict>\n    <key>StandardErrorPath</key>\n    <string>${launchdLogs.stderrPath}</string>\n  </dict>\n</plist>\n`,
      "utf8",
    );

    await expect(readLastGatewayErrorLine(env, { platform: "darwin" })).resolves.toBe(
      "failed to bind gateway socket EADDRINUSE",
    );
  });

  it("ignores pre-upgrade stderr when the plist still points at /dev/null", async () => {
    const stateDir = makeTempStateDir();
    const homeDir = makeTempStateDir();
    const env = { HOME: homeDir, OPENCLAW_STATE_DIR: stateDir };
    const launchdLogs = resolveGatewaySupervisorLogPaths(env, { platform: "darwin" });
    fs.mkdirSync(launchdLogs.logDir, { recursive: true });
    // Orphaned file from an older install: it exists, but the installed plist
    // sends stderr to /dev/null, so its contents predate the running service.
    fs.writeFileSync(launchdLogs.stderrPath, "failed to bind gateway socket stale\n", "utf8");
    fs.writeFileSync(launchdLogs.stdoutPath, "gateway stdout current\n", "utf8");

    const plistPath = resolveLaunchAgentPlistPath(env);
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.writeFileSync(
      plistPath,
      `<plist version="1.0">\n  <dict>\n    <key>StandardErrorPath</key>\n    <string>/dev/null</string>\n  </dict>\n</plist>\n`,
      "utf8",
    );

    await expect(readLastGatewayErrorLine(env, { platform: "darwin" })).resolves.toBe(
      "gateway stdout current",
    );
  });

  it("prefers the current stderr error over a stale stdout match on linux", async () => {
    const stateDir = makeTempStateDir();
    const homeDir = makeTempStateDir();
    const env = { HOME: homeDir, OPENCLAW_STATE_DIR: stateDir };
    const stateLogs = resolveGatewayLogPaths(env);
    fs.mkdirSync(stateLogs.logDir, { recursive: true });
    // stderr carries the real, current failure; stdout carries an older matching
    // line. On non-darwin platforms stderr is the strongest failure signal, so
    // it must win instead of the stale stdout match.
    fs.writeFileSync(stateLogs.stderrPath, "failed to bind gateway socket EADDRINUSE\n", "utf8");
    fs.writeFileSync(stateLogs.stdoutPath, "gateway start blocked: stale prior reason\n", "utf8");

    await expect(readLastGatewayErrorLine(env, { platform: "linux" })).resolves.toBe(
      "failed to bind gateway socket EADDRINUSE",
    );
  });
});
