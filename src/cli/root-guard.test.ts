import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("assertNotRoot", () => {
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  // Save and restore real getuid/geteuid so we can replace them per test.
  const realGetuid = process.getuid;
  const realGeteuid = process.geteuid;

  beforeEach(() => {
    exitSpy.mockClear();
    stderrSpy.mockClear();
    process.getuid = realGetuid;
    process.geteuid = realGeteuid;
  });

  afterAll(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    process.getuid = realGetuid;
    process.geteuid = realGeteuid;
  });

  // Use a fresh import each time to avoid module-level caching issues.
  async function loadAssertNotRoot() {
    const mod = await import("./root-guard.js");
    return mod.assertNotRoot;
  }

  it("exits with code 1 when uid is 0 and no env override", async () => {
    process.getuid = () => 0;
    const assertNotRoot = await loadAssertNotRoot();
    assertNotRoot({});
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("does not exit when uid is 0 and OPENCLAW_ALLOW_ROOT=1", async () => {
    process.getuid = () => 0;
    const assertNotRoot = await loadAssertNotRoot();
    assertNotRoot({ OPENCLAW_ALLOW_ROOT: "1" });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("does not exit when uid is 0 and OPENCLAW_CLI_CONTAINER_BYPASS=1", async () => {
    process.getuid = () => 0;
    const assertNotRoot = await loadAssertNotRoot();
    assertNotRoot({ OPENCLAW_CLI_CONTAINER_BYPASS: "1" });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("does not exit when uid is non-zero", async () => {
    process.getuid = () => 1000;
    const assertNotRoot = await loadAssertNotRoot();
    assertNotRoot({});
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("exits when real uid is non-zero but effective uid is 0 (setuid-root)", async () => {
    process.getuid = () => 1000;
    process.geteuid = () => 0;
    const assertNotRoot = await loadAssertNotRoot();
    assertNotRoot({});
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("does not exit when real uid is non-zero and effective uid is non-zero", async () => {
    process.getuid = () => 1000;
    process.geteuid = () => 1000;
    const assertNotRoot = await loadAssertNotRoot();
    assertNotRoot({});
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("does not exit when euid is 0 but OPENCLAW_ALLOW_ROOT=1", async () => {
    process.getuid = () => 1000;
    process.geteuid = () => 0;
    const assertNotRoot = await loadAssertNotRoot();
    assertNotRoot({ OPENCLAW_ALLOW_ROOT: "1" });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("does not exit when getuid is undefined (Windows)", async () => {
    process.getuid = undefined as unknown as typeof process.getuid;
    const assertNotRoot = await loadAssertNotRoot();
    assertNotRoot({});
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("error message mentions OPENCLAW_ALLOW_ROOT", async () => {
    process.getuid = () => 0;
    const assertNotRoot = await loadAssertNotRoot();
    assertNotRoot({});
    const output = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(output).toContain("OPENCLAW_ALLOW_ROOT");
  });

  it("error message mentions running as a non-root user", async () => {
    process.getuid = () => 0;
    const assertNotRoot = await loadAssertNotRoot();
    assertNotRoot({});
    const output = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(output).toContain("non-root user");
  });
});
