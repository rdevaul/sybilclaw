import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../utils/message-channel.js";
import { resolveRuntimeServiceVersion } from "../version.js";
import { connectGatewayClient } from "./test-helpers.e2e.js";
import { installGatewayTestHooks, startServer } from "./test-helpers.js";

installGatewayTestHooks({ scope: "suite" });

// Pin a deterministic released (YYYY.M.D) gateway version for this suite.
//
// The version-mismatch guard only fires when BOTH the gateway and client
// versions are released (date-format) versions. The gateway resolves its
// version live from process.env on every handshake
// (resolveRuntimeServiceVersion). Under this project's non-isolated vitest
// pool (isolate: false), sibling suites that mutate OPENCLAW_VERSION /
// OPENCLAW_SERVICE_VERSION (e.g. server.auth.default-token) share the same
// process.env, so an unpinned canary would intermittently observe a leaked,
// non-released version (e.g. "2.4.6-service"), skip the guard, and wrongly
// accept the stale client. Pinning OPENCLAW_VERSION here for the suite's
// lifetime makes both the server's live resolution and `gatewayVersion`
// agree, immune to ambient env leaks.
const PINNED_GATEWAY_VERSION = "2099.1.1";
let restoreOpenclawVersion: string | undefined;
let openclawVersionWasSet = false;

const gatewayVersion = PINNED_GATEWAY_VERSION;

const TEST_LOCAL_NODE_ID = "test-local-node-version-mismatch";

describe("node host version mismatch guard", () => {
  let port: number;
  let server: Awaited<ReturnType<typeof startServer>>["server"];

  beforeAll(async () => {
    // Pin the gateway version before startServer resolves/advertises it, and
    // before any handshake re-resolves it from process.env.
    openclawVersionWasSet = "OPENCLAW_VERSION" in process.env;
    restoreOpenclawVersion = process.env.OPENCLAW_VERSION;
    process.env.OPENCLAW_VERSION = PINNED_GATEWAY_VERSION;
    // Sanity: the pinned value must actually resolve through (no higher-
    // precedence ambient override is winning).
    if (resolveRuntimeServiceVersion(process.env) !== PINNED_GATEWAY_VERSION) {
      throw new Error(
        `expected pinned gateway version ${PINNED_GATEWAY_VERSION}, got ${resolveRuntimeServiceVersion(process.env)}`,
      );
    }
    // Write a node.json so the gateway's resolveLocalNodeId() finds it in the test state dir.
    const stateDir = process.env.OPENCLAW_STATE_DIR;
    if (stateDir) {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(
        path.join(stateDir, "node.json"),
        JSON.stringify({ version: 1, nodeId: TEST_LOCAL_NODE_ID }),
      );
    }
    const started = await startServer("secret");
    port = started.port;
    server = started.server;
  });

  afterAll(async () => {
    await server?.close();
    if (openclawVersionWasSet) {
      process.env.OPENCLAW_VERSION = restoreOpenclawVersion;
    } else {
      delete process.env.OPENCLAW_VERSION;
    }
  });

  test("local node with matching released version connects successfully", async () => {
    // Use the actual gateway version so versions match
    const client = await connectGatewayClient({
      url: `ws://127.0.0.1:${port}`,
      token: "secret",
      role: "node",
      clientName: GATEWAY_CLIENT_NAMES.NODE_HOST,
      clientDisplayName: "test-node-match",
      clientVersion: gatewayVersion,
      instanceId: TEST_LOCAL_NODE_ID,
      mode: GATEWAY_CLIENT_MODES.NODE,
      scopes: [],
      commands: [],
    });
    expect(client).toBeDefined();
    await client.stopAndWait({ timeoutMs: 2_000 });
  });

  test("local node with mismatched released version is rejected", async () => {
    const staleVersion = "2020.1.1";
    await expect(
      connectGatewayClient({
        url: `ws://127.0.0.1:${port}`,
        token: "secret",
        role: "node",
        clientName: GATEWAY_CLIENT_NAMES.NODE_HOST,
        clientDisplayName: "test-node-stale",
        clientVersion: staleVersion,
        instanceId: TEST_LOCAL_NODE_ID,
        mode: GATEWAY_CLIENT_MODES.NODE,
        scopes: [],
        commands: [],
        timeoutMs: 5_000,
        timeoutMessage: "expected version mismatch rejection",
      }),
    ).rejects.toThrow(/client version mismatch|version mismatch/i);
  });

  test("local node with dev/test version is allowed (not a released version)", async () => {
    // "dev" does not match YYYY.M.D, so the guard skips
    const client = await connectGatewayClient({
      url: `ws://127.0.0.1:${port}`,
      token: "secret",
      role: "node",
      clientName: GATEWAY_CLIENT_NAMES.NODE_HOST,
      clientDisplayName: "test-node-dev",
      clientVersion: "dev",
      mode: GATEWAY_CLIENT_MODES.NODE,
      scopes: [],
      commands: [],
    });
    expect(client).toBeDefined();
    await client.stopAndWait({ timeoutMs: 2_000 });
  });

  test("local node with non-date version '1.0.0' is allowed", async () => {
    const client = await connectGatewayClient({
      url: `ws://127.0.0.1:${port}`,
      token: "secret",
      role: "node",
      clientName: GATEWAY_CLIENT_NAMES.NODE_HOST,
      clientDisplayName: "test-node-semver",
      clientVersion: "1.0.0",
      mode: GATEWAY_CLIENT_MODES.NODE,
      scopes: [],
      commands: [],
    });
    expect(client).toBeDefined();
    await client.stopAndWait({ timeoutMs: 2_000 });
  });
});
