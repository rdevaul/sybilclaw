# Red-Flags Investigation — 2026-05-30

**Context:** During the Batch A security cherry-pick run, the execution sub-agent reported two pre-existing problems unrelated to its picks: (1) "12 failing tests" in a browser route test, and (2) "feishu/slack lint errors that fail the pre-commit hook." Rich asked me to investigate both for obvious roll-in fixes.

**Verdict: neither is a real defect in our fork. Both are environment/tooling artifacts, both inherited from upstream verbatim, neither blocks the LTS rebase. No code fix warranted.** Details below.

---

## Red flag 1 — "12 failing tests" in `agent.act.existing-session-navigation-guard.test.ts`

### Finding: FALSE ALARM — they all pass under the correct runner config.

The sub-agent ran the test file via the bare `node scripts/run-vitest.mjs run <file>` invocation, which failed with a vitest **project-config resolution error** ("All projects should have unique names"), not actual test failures. The repo uses a multi-project vitest setup; a test file must be run under its owning project config.

Run correctly:

```bash
node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.extension-browser.config.ts \
  agent.act.existing-session-navigation-guard
```

Result: **12 passed / 12.** (588ms.)

These are 12 substantive SSRF / private-network navigation-guard assertions (fail-closed on blocked tab URLs, unreadable location probes, post-action navigation changes, etc.) — important coverage, and green. The file is byte-identical to upstream (`28f7745a5e test: share browser route fixtures`).

### Action: none. Optionally document the correct per-project run invocation so future batches don't misread config errors as failures.

---

## Red flag 2 — 6 oxlint errors in feishu/slack test files

### Finding: inherited-from-upstream oxlint barrel-re-export resolution limitation. Not our rename, not a code bug.

The pre-commit hook runs `lint:extensions` (oxlint over `extensions/` with `tsconfig.oxlint.extensions.json`). It reports **6 errors, all the same rule** — `typescript-eslint(no-redundant-type-constituents): 'OutputRuntimeEnv' is an 'error' type that acts as 'any'`:

- `extensions/feishu/src/monitor.card-action.lifecycle.test.ts:35`
- `extensions/feishu/src/monitor.reply-once.lifecycle.test.ts:27`
- `extensions/feishu/src/monitor.bot-menu.lifecycle.test.ts:33`
- `extensions/feishu/src/monitor.acp-init-failure.lifecycle.test.ts:30`
- `extensions/feishu/src/monitor.comment.test.ts:26`
- `extensions/slack/src/http/plugin-routes.test.ts:11`

### Root cause (fully traced)

The error fires on lines like `let lastRuntime: ReturnType<typeof createRuntimeEnv> | null = null;`. `createRuntimeEnv` (in `test/helpers/plugins/runtime-env.ts`) returns `OutputRuntimeEnv`, imported as `import type { OutputRuntimeEnv } from "openclaw/plugin-sdk/runtime"`.

The package export `openclaw/plugin-sdk/runtime` maps to `dist/plugin-sdk/runtime.d.ts`, whose content is a single re-export line:

```ts
export * from "./src/plugin-sdk/runtime.js";
```

That hops to `dist/plugin-sdk/src/plugin-sdk/runtime.d.ts`:

```ts
export type { OutputRuntimeEnv, RuntimeEnv } from "../runtime.js";
```

…which hops again to `dist/plugin-sdk/src/runtime.d.ts`, where the real declaration lives:

```ts
export type OutputRuntimeEnv = RuntimeEnv & { ... };
```

**The declarations are correct and complete.** Following the chain by hand resolves `OutputRuntimeEnv` perfectly. oxlint's type resolver does **not** follow this multi-hop `export * from "...js"` barrel indirection cleanly, so it treats `OutputRuntimeEnv` as an unresolved `error` type, which then trips `no-redundant-type-constituents` on the `| null` union (since `any | null` is "redundant").

### Proof it's not ours

- `test/helpers/plugins/runtime-env.ts` — **byte-identical to upstream** (`git diff upstream/main...HEAD` empty).
- All 6 offending test files — **byte-identical to upstream.**
- `tsconfig.oxlint.extensions.json` — **byte-identical to upstream.**
- `src/plugin-sdk/runtime.ts` — correctly re-exports the type; untouched by our `.openclaw`→`.sybilclaw` rename.

So these 6 errors exist on a pristine upstream `v2026.5.12` checkout too. They are an upstream lint-infra quirk we inherited, not a regression introduced by our fork.

### Why a rebuild doesn't fix it

`pnpm build:plugin-sdk:dts` regenerates the declarations but preserves the intended re-export structure (the barrel hop is by design for the SDK's public surface). The lint resolver limitation is independent of build freshness.

### Action options (all low priority)

1. **Do nothing** — these are test-file type-annotation lint warnings on correct code, zero runtime impact. Tolerable. The pre-commit hook can be bypassed for unrelated commits (as the Batch A run did).
2. **Suppress at source** — add `// oxlint-disable-next-line typescript/no-redundant-type-constituents -- barrel re-export resolution; type is correct, see RED-FLAGS-INVESTIGATION-2026-05-30.md` above each of the 6 lines. Clean, but it's churn on 6 upstream-pristine files we'd then carry as fork divergence — undesirable per our minimize-divergence policy.
3. **Fix upstream / wait for LTS** — the right home for this. It's an upstream lint-config issue; the LTS rebase will either carry upstream's own fix (if they address it) or we re-evaluate then.

**Recommendation: option 1 now (tolerate), revisit at LTS rebase.** Do NOT add fork-local suppressions to pristine upstream files — that's exactly the divergence we're trying to shed via the LTS rebase. If the failing pre-commit hook is operationally annoying, the better lever is to scope the hook to changed files only (lint-staged style) so unrelated pre-existing errors don't block commits — that's a tooling-config change, not a per-file suppression. Flag for the LTS-rebase work.

---

## Summary

| Red flag                   | Real?         | Cause                                                                     | Fix                                                              |
| -------------------------- | ------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 12 failing browser tests   | No            | sub-agent used wrong vitest project config                                | none — pass under correct config                                 |
| 6 feishu/slack lint errors | No (cosmetic) | upstream oxlint barrel-re-export resolution limit; pristine-from-upstream | tolerate now; revisit at LTS; do NOT add fork-local suppressions |

Net: zero code changes warranted. Both "red flags" are tooling artifacts, not defects. Neither affects the LTS rebase plan except as notes to carry forward.
