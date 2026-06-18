import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

const gatewayServerBackedHttpTests = [
  "src/gateway/embeddings-http.test.ts",
  "src/gateway/models-http.test.ts",
  "src/gateway/openai-http.test.ts",
  "src/gateway/openresponses-http.test.ts",
  "src/gateway/probe.auth.integration.test.ts",
];

export function createGatewayServerVitestConfig(env?: Record<string, string | undefined>) {
  const resolvedEnv = env ?? process.env;
  // This project shares a single module graph + process.env across its 101
  // test files when isolate=false. Several suites legitimately mutate ambient
  // process.env (version markers like OPENCLAW_VERSION/OPENCLAW_SERVICE_VERSION,
  // transient secret-ref vars, etc.). Under the non-isolated pool those
  // mutations bleed across files and produce a non-deterministic flake where
  // the failing set swings run-to-run (observed 7-51 failures/run). Running
  // isolated yields a fully stable 1093/1093.
  //
  // Default to isolated for reliability. Allow an explicit opt-out via
  // OPENCLAW_GATEWAY_SERVER_VITEST_ISOLATE=0 for perf-sensitive local runs that
  // accept the flake risk.
  const isolateOptOut = resolvedEnv.OPENCLAW_GATEWAY_SERVER_VITEST_ISOLATE === "0";
  return createScopedVitestConfig(
    ["src/gateway/**/*server*.test.ts", ...gatewayServerBackedHttpTests],
    {
      dir: "src/gateway",
      env,
      exclude: [
        "src/gateway/server-methods/**/*.test.ts",
        "src/gateway/gateway.test.ts",
        "src/gateway/server.startup-matrix-migration.integration.test.ts",
        "src/gateway/sessions-history-http.test.ts",
      ],
      isolate: !isolateOptOut,
      name: "gateway-server",
    },
  );
}

export default createGatewayServerVitestConfig();
