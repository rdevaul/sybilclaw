# SybilClaw Rebase — Isolated Container Test Plan (2026-08-21)

**Goal:** Validate the rebased build (v2026.6.34 + SybilClaw feature stack) with a fresh containerized deployment + scripted smoke test, with **ZERO risk to the live production gateways** (Jarvis on :18789, Atlas on :18790) and their state.

**Why a container (not a host test-gateway):** A container gives _hard_ isolation — its own filesystem, HOME, state dir, config, and network namespace. It physically cannot read/write the host's `~/.openclaw-Jarvis/` production state, cannot collide on ports (we map to unused host ports), and is destroyed cleanly with `docker rm`. This is strictly safer than the "isolated host gateway on a scratch state dir" fallback in the main rebase plan.

---

## Isolation guarantees (verified 2026-08-21)

- **Tooling present:** Docker 29.7.2 (via colima), daemon UP. Repo ships `Dockerfile` + `docker-compose.yml` + an existing Docker test harness (`test/scripts/*docker*.test.ts`, `live-docker-*`). We REUSE upstream's containerization — nothing hand-rolled.
- **State isolation is built into the image:** compose pins `OPENCLAW_STATE_DIR=/home/node/.openclaw`, `OPENCLAW_CONFIG_PATH`, `OPENCLAW_WORKSPACE_DIR` all _inside_ the container (this override exists precisely to stop host paths leaking in — see #77436). The container's `~/.openclaw` is a container-local volume, NOT the host's production `~/.openclaw-Jarvis/`.
- **Network isolation:** map the container gateway to an UNUSED host port (e.g. `127.0.0.1:19100:<gwport>`), localhost-bound. Never touches 18789/18790/8400/etc.
- **Scriptable interface confirmed:** gateway exposes the OpenAI-compatible `/v1/chat/completions` HTTP endpoint (`gateway.http.endpoints.chatCompletions`), so smoke tests are plain `curl`/HTTP — no Discord/Matrix/real-channel wiring needed.
- **No real credentials required for structural smoke tests.** For a live model turn we inject ONE scoped test API key via `.env` (never the production secrets file); most of the smoke suite validates startup/health/config/endpoints without any model call.

---

## Test layers (cheapest → most thorough)

### Layer 0 — Build validation (already the sub-agent's job)

`npm ci && npm run build` + unit/integration tests in `~/Projects/sybilclaw-rebase`. Gate: builds clean, test suite green (modulo known-flaky). No container yet.

### Layer 1 — Container builds & boots

1. Build the image FROM THE REBASE TREE:
   `cd ~/Projects/sybilclaw-rebase && docker build -t sybilclaw-rebase-test:local .`
   (Multi-stage, produces a slim runtime image; no host state involved.)
2. Boot a throwaway container on an unused localhost port, with a **fresh empty container-local state dir** and a **minimal generated config** (no channels enabled — gateway-only):
   `docker run --rm -d --name sc-rebase-smoke -p 127.0.0.1:19100:<gwport> -e OPENCLAW_GATEWAY_TOKEN=<random> sybilclaw-rebase-test:local`
3. Gate: container reaches "gateway listening", `/health`-equivalent returns 200, no crash-loop, startup log clean.

### Layer 2 — Scripted structural smoke test (no model calls)

A shell script (`scripts/rebase-smoke.sh`, written into the rebase tree — never prod) hits the container over the mapped port and asserts:

- **a. Version/identity:** `sybilclaw --version` inside the container resolves to the SybilClaw scheme (proves the rebrand feature survived).
- **b. Gateway health:** HTTP health/status endpoint returns 200; gateway token auth enforced (401 without token).
- **c. Config surface:** the gateway loads a config that exercises our SybilClaw features — assert the config schema ACCEPTS `agents.list[].memoryFile` + `memoryAllowedPaths` (per-agent memory feature) and doesn't reject them (proves feature #2 survived + schema wired).
- **d. Path/rebrand:** confirm state resolves under `.sybilclaw`/`.openclaw` container paths as intended (feature #1).
- **e. Commands registry:** assert `/skills` command is registered/listed via the native command API (feature #4) — query the command list endpoint or CLI.
- **f. Memory hygiene:** capture container RSS at boot; hold 10–15 min idle; confirm it's stable (no immediate leak). (Full leak validation is Layer 4.)

### Layer 3 — Scripted live chat turn (one scoped key)

With a single test API key in `.env`:

- Fire a `/v1/chat/completions` request through the container gateway; assert a valid completion comes back (proves the whole model→gateway→response path works on the new build).
- Fire a second turn to confirm session continuity.
- Assert per-agent memory isolation if a 2-agent config is loaded (feature #2 end-to-end).
- Assert compaction-ownership hook doesn't error on a context-engine-enabled config (feature #3) — even a no-op contextgraph stub is enough to exercise the `ownsCompactionForSession` path.

### Layer 4 — Memory-leak soak (THE acceptance gate for this whole rebase)

- Drive the container gateway with a scripted loop of chat turns (or replayed load) for **several hours**.
- Sample RSS/heap every 5 min; plot the trend.
- **PASS = RSS stays bounded** (no heap-pinned-~2GB sawtooth climbing into the 2.4-2.9 GB stall zone we see on prod). This is the concrete proof that v2026.6.34's `fix(gateway): plug long-running memory leaks` actually resolves OUR symptom.
- Compare against a baseline: optionally run the SAME soak against a container built from the OLD prod tree to show the before/after delta.

---

## Execution sequence & safety checklist

1. ⬜ Sub-agent completes Layer 0 (build + tests green in rebase clone).
2. ⬜ `docker build` the rebase image (Layer 1) — verify it's built from `~/Projects/sybilclaw-rebase`, NOT prod.
3. ⬜ Boot throwaway container on `127.0.0.1:19100`, fresh state — confirm no port/state collision with prod (`lsof -i :18789` unaffected).
4. ⬜ Run `rebase-smoke.sh` (Layer 2) — structural assertions.
5. ⬜ Run scripted chat turn (Layer 3) with a scoped test key.
6. ⬜ Run the memory soak (Layer 4) — the go/no-go gate.
7. ⬜ `docker rm -f sc-rebase-smoke` + `docker rmi` cleanup. Container-local state vanishes with it.

**Safety invariants (assert before EACH docker run):**

- Container ports are `127.0.0.1:191xx` only — never 18789/18790/84xx/83xx.
- No host bind-mount of `~/.openclaw-Jarvis/` or the prod workspace. Container state is a fresh named/anon volume.
- Real production secrets file is NEVER passed to the container; only a purpose-built scoped test key via a throwaway `.env`.
- Production gateway RSS/health checked before and after each layer — must be unchanged.

---

## Deliverables

- `scripts/rebase-smoke.sh` (in the rebase tree) — reusable structural + chat smoke test.
- A results doc: build/test output, Layer 1-3 pass/fail, and the **Layer 4 memory-soak plot** (the acceptance evidence).
- Go/no-go recommendation for the cutover (Phase 3), which remains Rich's call in a maintenance window.

## What this plan deliberately does NOT do

- Does not touch production config, state, ports, or the running gateways.
- Does not perform the cutover.
- Does not use production credentials.
- Does not require any downtime — the entire plan runs alongside live services.
