import { isRootVersionInvocation } from "./cli/argv.js";
import { resolveCliContainerTarget } from "./cli/container-target.js";
import { OPENCLAW_BASE_VERSION } from "./version.js";

export function tryHandleRootVersionFastPath(
  argv: string[],
  deps: {
    env?: NodeJS.ProcessEnv;
    moduleUrl?: string;
    output?: (message: string) => void;
    exit?: (code?: number) => void;
    onError?: (error: unknown) => void;
    resolveVersion?: () => Promise<{
      VERSION: string;
      resolveCommitHash: (params: { moduleUrl: string }) => string | null;
    }>;
  } = {},
): boolean {
  if (resolveCliContainerTarget(argv, deps.env)) {
    return false;
  }
  if (!isRootVersionInvocation(argv)) {
    return false;
  }
  const output = deps.output ?? ((message: string) => console.log(message));
  const exit = deps.exit ?? ((code?: number) => process.exit(code));
  const onError =
    deps.onError ??
    ((error: unknown) => {
      console.error(
        "[openclaw] Failed to resolve version:",
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
      process.exitCode = 1;
    });
  const resolveVersion =
    deps.resolveVersion ??
    (async () => {
      const [{ VERSION }, { resolveCommitHash }] = await Promise.all([
        import("./version.js"),
        import("./infra/git-commit.js"),
      ]);
      return { VERSION, resolveCommitHash };
    });

  resolveVersion()
    .then(({ VERSION, resolveCommitHash }) => {
      const commit = resolveCommitHash({ moduleUrl: deps.moduleUrl ?? import.meta.url });
      const primary = commit ? `SybilClaw ${VERSION} (${commit})` : `SybilClaw ${VERSION}`;
      // Print fork lineage on a second line so scripts that grep the
      // legacy upstream name ("OpenClaw") still match `<binary> --version`
      // output. Standard parsers that take the first line / first two
      // whitespace-separated tokens still see `SybilClaw <version>`.
      // The OpenClaw version reported is the upstream baseline this fork
      // was rebased from (OPENCLAW_BASE_VERSION), NOT our SybilClaw
      // version, so plugin authors can match the actual upstream feature
      // surface they're targeting.
      output(`${primary}\nbased on OpenClaw ${OPENCLAW_BASE_VERSION}`);
      exit(0);
    })
    .catch(onError);
  return true;
}
