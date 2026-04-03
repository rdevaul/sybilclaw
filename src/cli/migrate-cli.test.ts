import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMigrateCommand } from "./migrate-cli.js";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: mocks.spawn,
}));

describe("migrate-cli", () => {
  let tempDir: string;
  let mockSourceDir: string;
  let mockDestDir: string;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create temporary directories for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-test-"));
    mockSourceDir = path.join(tempDir, ".openclaw");
    mockDestDir = path.join(tempDir, ".sybilclaw");

    // Create minimal source structure
    fs.mkdirSync(mockSourceDir, { recursive: true });
    fs.mkdirSync(path.join(mockSourceDir, "agents"), { recursive: true });
    fs.mkdirSync(path.join(mockSourceDir, "workspace"), { recursive: true });
    fs.writeFileSync(
      path.join(mockSourceDir, "openclaw.json"),
      JSON.stringify({ test: "config" }, null, 2),
    );

    // Mock spawn to simulate successful script execution
    const mockChildProcess = {
      on: vi.fn((event: string, handler: (code: number) => void) => {
        if (event === "close") {
          // Simulate immediate successful completion
          setTimeout(() => handler(0), 10);
        }
        return mockChildProcess;
      }),
    };
    mocks.spawn.mockReturnValue(mockChildProcess);
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function runCli(args: string[]) {
    const program = new Command();
    registerMigrateCommand(program);
    await program.parseAsync(args, { from: "user" });
  }

  it("registers the migrate command", () => {
    const program = new Command();
    registerMigrateCommand(program);
    const commands = program.commands.map((cmd) => cmd.name());
    expect(commands).toContain("migrate");
  });

  it("calls the migration script with no flags", async () => {
    await runCli(["migrate"]);

    expect(mocks.spawn).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining([expect.stringContaining("migrate-to-sybilclaw.sh")]),
      expect.objectContaining({
        stdio: "inherit",
      }),
    );
  });

  it("forwards --yes flag to the script", async () => {
    await runCli(["migrate", "--yes"]);

    expect(mocks.spawn).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining([expect.stringContaining("migrate-to-sybilclaw.sh"), "--yes"]),
      expect.any(Object),
    );
  });

  it("forwards --force flag to the script", async () => {
    await runCli(["migrate", "--force"]);

    expect(mocks.spawn).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining([expect.stringContaining("migrate-to-sybilclaw.sh"), "--force"]),
      expect.any(Object),
    );
  });

  it("forwards --dry-run flag to the script", async () => {
    await runCli(["migrate", "--dry-run"]);

    expect(mocks.spawn).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining([expect.stringContaining("migrate-to-sybilclaw.sh"), "--dry-run"]),
      expect.any(Object),
    );
  });

  it("forwards --include-logs flag to the script", async () => {
    await runCli(["migrate", "--include-logs"]);

    expect(mocks.spawn).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining([
        expect.stringContaining("migrate-to-sybilclaw.sh"),
        "--include-logs",
      ]),
      expect.any(Object),
    );
  });

  it("forwards --source flag to the script", async () => {
    await runCli(["migrate", "--source", mockSourceDir]);

    expect(mocks.spawn).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining([
        expect.stringContaining("migrate-to-sybilclaw.sh"),
        "--source",
        mockSourceDir,
      ]),
      expect.any(Object),
    );
  });

  it("forwards --dest flag to the script", async () => {
    await runCli(["migrate", "--dest", mockDestDir]);

    expect(mocks.spawn).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining([
        expect.stringContaining("migrate-to-sybilclaw.sh"),
        "--dest",
        mockDestDir,
      ]),
      expect.any(Object),
    );
  });

  it("forwards multiple flags to the script", async () => {
    await runCli([
      "migrate",
      "--yes",
      "--force",
      "--dry-run",
      "--source",
      mockSourceDir,
      "--dest",
      mockDestDir,
    ]);

    const [, args] = mocks.spawn.mock.calls[0] as [string, string[]];
    expect(args).toContain("--yes");
    expect(args).toContain("--force");
    expect(args).toContain("--dry-run");
    expect(args).toContain("--source");
    expect(args).toContain(mockSourceDir);
    expect(args).toContain("--dest");
    expect(args).toContain(mockDestDir);
  });

  it("resolves when the script exits successfully", async () => {
    const promise = runCli(["migrate", "--dry-run"]);
    await expect(promise).resolves.not.toThrow();
  });

  it("exits with non-zero code when the script fails", async () => {
    const mockExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);

    const mockChildProcess = {
      on: vi.fn((event: string, handler: (code: number) => void) => {
        if (event === "close") {
          setTimeout(() => handler(1), 10);
        }
        return mockChildProcess;
      }),
    };
    mocks.spawn.mockReturnValue(mockChildProcess);

    await expect(runCli(["migrate"])).rejects.toThrow("process.exit called");
    expect(mockExitSpy).toHaveBeenCalledWith(1);

    mockExitSpy.mockRestore();
  });
});
