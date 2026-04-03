---
name: iterative-dev
description: >
  Iterative, phase-driven development loop using a coding agent + reviewer pattern.
  Use when: implementing multi-phase features, refactors, or migrations where each
  phase should be designed, implemented, tested, and reviewed before proceeding.
  Supports resumption across sessions (heartbeat-safe). NOT for: simple one-liner
  fixes (just edit), read-only analysis, or tasks that don't benefit from
  plan→implement→review cycles.
metadata:
  openclaw:
    emoji: "🔁"
    last_reviewed: "2026-04-03"
---

# Iterative Development Loop Skill

## TRIGGER

**Fire this skill when the user says any of:**

- "implement phases X and Y"
- "let's work through this iteratively"
- "use the iterative dev pattern"
- "pick up where we left off" (on a known multi-phase project)
- "continue the implementation loop"
- A multi-phase implementation plan exists and the user asks to start or resume

**Do NOT fire for:** single-file edits, read-only analysis, one-off scripts, or tasks
with no review/gate requirement.

---

## The Loop

For each phase, follow these steps in order. Never skip the review step.

1. **Load state** — check for an existing `iterative-dev-state.json`; resume if found
2. **Requirements** — write specific, testable requirements for this phase only
3. **Design** — list files to change, key logic, and unit tests before touching code
4. **Implement** — spawn coding agent (local Ollama or Claude Code)
5. **Review** — spawn `claude-opus-4-6` subagent to evaluate output vs. requirements
6. **Gate** — PASS → write state, next phase, loop to 2. FAIL → adjust, retry from 4 (max 2x)

---

## Step 1: Load State

```bash
cat ~/.openclaw/workspace/projects/<project-slug>/iterative-dev-state.json 2>/dev/null
```

- If file exists → resume from `current_phase`
- If not → start phase 1, create the file now

State file schema:

```json
{
  "project": "slug",
  "phases": ["Phase 1: ...", "Phase 2: ..."],
  "current_phase": 1,
  "phase_status": { "1": "pending" },
  "retry_count": 0,
  "last_updated": "ISO8601",
  "notes": ""
}
```

See `examples/example-state.json` for a real example.
**Write state BEFORE spawning any agent** — not after.

---

## Step 2: Requirements

Write a short requirements doc for the current phase. Every requirement must be:

- **Testable** — has a clear pass/fail criterion
- **Scoped** — only covers this phase; no future work
- **Concrete** — names files, functions, and behaviors explicitly

See `examples/example-requirements.md` for format.

---

## Step 3: Design

Before any implementation, write:

1. Files to create or modify (explicit paths)
2. Key logic or pseudocode for non-obvious parts
3. Exact test commands to verify each requirement

Store in `notes` field of state file or as `phase-N-design.md` in the project dir.

---

## Step 4: Implement

### Agent selection

| Situation                                                | Use                               |
| -------------------------------------------------------- | --------------------------------- |
| File edits, refactors, small-medium features             | Local Ollama (`qwen3-coder-next`) |
| Complex multi-file work, requires tool calls or judgment | Claude Code                       |
| After 1 failed local retry                               | Escalate to Claude Code           |

### Option A: Local Ollama

````bash
curl -s http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen3-coder-next", "prompt": "<requirements + design here>", "stream": false}' \
  | jq -r '.response' | sed '/^```/d'
````

For multi-file output, instruct the model to use `# FILE: path/to/file` delimiters.
Apply results with `write` or `edit` tools.

### Option B: Claude Code

```bash
cd /path/to/project && claude --permission-mode bypassPermissions --print \
  '<requirements + design>.

When completely finished, run:
openclaw system event --text "Done: <brief summary>" --mode now'
```

For long tasks, add `background: true` to the exec call.

---

## Step 5: Review

Spawn a review subagent — always Opus, always isolated:

```
sessions_spawn(
  runtime: "subagent",
  model: "anthropic/claude-opus-4-6",
  task: "Review the following implementation against these requirements.
         For each requirement, state PASS or FAIL with a one-line justification.
         End with: PROCEED or RETRY. If RETRY, list the exact fixes needed.

         Requirements: <paste requirements>
         Implementation: <paste diff or file contents>"
)
```

Wait for the result. Do not proceed to Step 6 until the review is complete.

---

## Step 6: Gate

**PROCEED:**

- Set `phase_status[N] = "review_passed"`, increment `current_phase`, reset `retry_count`
- Write state file
- Loop back to Step 2 for next phase

**RETRY:**

- Set `phase_status[N] = "review_failed"`, increment `retry_count`
- Log reviewer's exact fix list in `notes`
- Adjust implementation prompt to address failures
- Loop back to Step 4

**ESCALATE** (after 2 retries with no progress):

- Set `phase_status[N] = "blocked"`
- Message Rich: "Phase N is stuck after 2 retries — need your input. Failures: <list>"
- Do not continue until Rich responds

---

## Heartbeat Resumption

On every heartbeat, check for active iterative-dev state files:

```bash
find ~/.openclaw/workspace/projects -name "iterative-dev-state.json" 2>/dev/null
```

If `phase_status[current_phase]` is `in_progress`, `review_failed`, or `blocked`:

- Resume the loop from the correct step
- Message Rich: "▶️ Resuming iterative dev — [project] Phase N of M"

---

## GOTCHAS

**These are where the loop breaks. Read carefully.**

- ❌ **Skipping the review step** — "the implementation looks right" is not a substitute. Always run the Opus reviewer.
- ❌ **Writing state after spawning agents** — if the agent crashes, there's no record. Write state _first_.
- ❌ **Implementing in the main session** — always delegate. Main session gets interrupted by heartbeats, emails, etc.
- ❌ **Phases that are too large** — if a phase needs >2 implement cycles to pass review, it was scoped too broadly. Split it next time and note this in `notes`.
- ❌ **Vague requirements** — "improve performance" is not testable. "Function X returns in <200ms on 10k rows, verified by test Y" is.
- ❌ **Using Claude Code for everything** — local Ollama is faster and free. Reserve Claude Code for work that genuinely needs tool calls or multi-step reasoning.
- ❌ **Letting the loop run forever** — the retry cap is 2. After that, escalate. Don't keep retrying with the same broken prompt.

---

## Maintenance

Re-evaluate this skill monthly. Check:

- Are the agent commands still correct? (model names, CLI flags)
- Is the local model still `qwen3-coder-next` or has a better one been validated?
- Has the review model changed?
- Are the gotchas still accurate, or have new failure modes appeared?

Update `last_reviewed` in the frontmatter after each review.
