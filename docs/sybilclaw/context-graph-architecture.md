> **SybilClaw Architecture Document** — This document describes the ContextGraph plugin architecture used by SybilClaw for tag-based hierarchical context management. The plugin lives in `extensions/contextgraph/`.

# Tag-Based Hierarchical Context Management System

_Working document — Rich DeVaul & GLaDOS | Started: 2026-02-23_
_Status: Early design / critical analysis phase_

---

## Problem Statement

Current LLM context management is fundamentally temporal: a flat sliding window of recent messages, compacted when full. This produces two failure modes:

1. **Topic contamination** — compaction mashes unrelated topics into blurry summaries
2. **Recency bias** — old but highly relevant context is lost while recent but irrelevant content is preserved

The goal is a context management system where **topic relevance**, not just recency, determines what context is available for any given interaction.

---

## Core Proposal

### 1. Message Tagging

Every message/response pair is tagged post-hoc with one or more contextual tags (e.g., `openclaw`, `security`, `shopping-list`, `voice-pwa`, `xnet`).

**Open questions:**

- [ ] Are tags applied in real-time (at message creation) or retrospectively?
- [ ] Is the tag vocabulary open (organic growth) or closed (predefined taxonomy)?
- [ ] Who/what applies tags — the interacting LLM, a dedicated tagging model, the user, or some combination?
- [ ] How are tag conflicts or inconsistencies resolved over time?

### 2. Graph Structure

The tagged messages form a **graph** (not strictly a tree — messages can carry multiple tags and belong to multiple "branches"):

- **Nodes:** individual message/response pairs
- **Edges:** shared tags + chronological ordering within a tag
- **The "tree" intuition:** for any single tag, messages are totally ordered chronologically — this feels tree-like, but multi-tag messages make the full structure a DAG/hypergraph

**Open questions:**

- [ ] Do we model this as: (a) one graph with tag-labeled edges, (b) separate per-tag chains that share nodes, or (c) something else?
- [ ] How do we represent the relationship _between_ tags (e.g., `openclaw` and `security` often co-occur)?

### 3. Tag-Conditioned Compaction

Within each tag's chronological chain, messages older than a threshold (by age, count, or token volume) are summarized. The compaction model may be different from the interaction model.

**Key principle:** The original uncompacted graph is preserved indefinitely. Compaction produces derived views, not destructive edits.

**Open questions:**

- [ ] What triggers compaction? Age? Token count within a tag's chain? Manual?
- [ ] Is compaction per-tag (each tag chain compacts independently) or per-topic (multiple related tags compact together)?
- [ ] How often should compaction run? On-demand at context assembly time, or asynchronously?
- [ ] Should the compaction model be the same as the interaction model, or a cheaper/specialized one?

### 4. Context Assembly Policy

For any new incoming message, the context is assembled from:

1. **Recency layer** — the N most recent messages, regardless of tag
2. **Topic layer** — for each tag inferred for the incoming message, the K most relevant messages in that tag's chain (post-compaction where applicable)
3. **Trailing specifics** — the most specific/granular messages in the topic chain (uncompacted, closest to the query)
4. **Topic summary** — a summary of the full tag chain for relevant tags

**Open questions:**

- [ ] How is the token budget allocated across layers? Fixed ratios? Dynamic?
- [ ] When multiple tags are relevant, how do we avoid duplication (a message with 3 tags could appear in 3 places)?
- [ ] How do we rank/weight tags for an incoming message? Embedding similarity? Explicit user signal?
- [ ] What's the fallback when a tag has very few messages (cold start)?
- [ ] How do we detect the tags relevant to an _incoming_ message before we have the response?

---

## Multi-Agent Architecture (2026-02-23 — Rich's proposal)

### Agent Roles

The system is decomposed into specialized agents with differentiated roles:

**1. Responder agent** — handles user interaction, generates responses. Has no tagging responsibility. Consumes the assembled context but does not produce tags.

**2. Tagger agent (family)** — runs asynchronously after each exchange, assigns tags to the message/response pair. Critically: this may be a _family of competing taggers_ rather than a single agent.

**3. Quality agent** — evaluates the quality of the tagging produced by the tagger family. Selects, weights, or eliminates taggers based on performance. Acts as the regularizer for the whole system.

### Analogy: GAN vs. Actor-Critic

Rich's initial framing invokes GANs (Generative Adversarial Networks). Important distinction:

- **GAN:** generator and discriminator are _adversarial_ — generator tries to fool discriminator
- **This system:** tagger and quality agent are _collaboratively differentiated_ — the quality agent evaluates, not defeats

The closer RL analogy is **actor-critic:**

- Tagger = actor (produces tags)
- Quality agent = critic (scores the tagging)
- Learning signal flows back to improve tagger performance

This distinction matters for implementation: the quality agent should be _calibrated_, not maximally adversarial.

### The Competing Tagger Family

If the tagger is a family of competing agents, the following must be specified:

**Diversity mechanism** — what differentiates taggers from each other?

- Different prompt strategies (broad vs. narrow, hierarchical vs. flat)
- Different vocabulary constraints (one tagger uses a closed vocab, another is open)
- Different granularity levels (coarse topic tags vs. fine-grained entity tags)
- Different model sizes/types (cheap/fast vs. expensive/accurate)

**Aggregation function** — how does the family converge to a single tagging?

- Majority vote (per-tag)
- Weighted vote (weighted by quality agent scores over time)
- Tournament / elimination bracket
- Full ensemble (all tags from all taggers, deduplicated by quality agent)

**Open questions:**

- [ ] What differentiates taggers in the family from each other?
- [ ] What is the aggregation function for the family's outputs?
- [ ] Does the family composition change over time (evolutionary selection)?

### The Quality Agent's Objective Function ← MOST CRITICAL

The quality agent is only as good as its objective. Candidates:

| Objective                | Description                                                 | Problem                                                          |
| ------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| **Internal consistency** | Same message tagged same way over time                      | Doesn't measure if tags are actually useful                      |
| **Coverage/precision**   | All relevant tags; no irrelevant ones                       | Requires ground truth (who defines "relevant"?)                  |
| **Retrieval quality**    | Tags that actually surface useful context for the responder | Delayed reward — only measurable after retrieval happens         |
| **User feedback**        | Rich explicitly approves/rejects tags                       | Doesn't scale; requires explicit effort                          |
| **Ensemble agreement**   | Tags that multiple tagger strategies agree on               | Self-referential; consistent taggers could consistently be wrong |

**Proposed composite proxy (Rich, 2026-02-23):**

Two behavioral signals that don't require ground truth:

1. **Effective context density** — if tags are good, assembled context is dense with relevant material. Measurable as _relevant tokens per total tokens consumed_. Good tags → lower token cost to accomplish the same task; poor tags → window fills with noise, forcing reframing or context loss.

2. **User reframing frequency** — NLP-extractable behavioral signal. Phrases like "as I mentioned," "going back to," "you don't seem to remember" are implicit evidence that context assembly failed. Borrowed from _implicit feedback_ in recommendation systems — infer quality from behavior, not ratings.

   **Important caveat:** Reframing can mean two things:
   - (a) Assistant forgot context it should have had → tag failure signal
   - (b) User genuinely changed direction → not a tag failure

   These must be disambiguated (likely tractable with a classifier: is the user providing background on a _prior topic_, or introducing something _genuinely new_?).

**Ground truth target (eventual):** Retrieval quality — did assembling context by these tags actually improve responder output? RL-style delayed reward. Expensive but the only true validation.

**Architecture:** Proxy metrics drive real-time evolution; ground truth validates periodically. Both feed the quality agent's scoring of the tagger family.

### Formal RL Structure

This system is an instance of **discrete-time reinforcement learning** with a combinatorial action space:

- **State (s):** current message/response pair + recent context window contents
- **Action (a):** tag assignment — combinatorial (2^N possible tag sets for N-tag vocabulary)
- **Reward (r):** composite of effective context density + reframing frequency (proxy); retrieval quality (ground truth)
- **Policy (π):** the tagger ensemble (evolved via genetic programming or similar)
- **Value function (V):** the quality agent's learned scoring of tagging strategies

**Key challenge:** The combinatorial action space (2^N) is only tractable if either:

- Tag vocabulary stays bounded (e.g., ≤50 tags), OR
- Tag assignment is decomposed into per-tag binary decisions (each tag independently assigned), OR
- GP searches the space implicitly through program evolution rather than explicit enumeration

**Temporal structure:** Delayed reward — the reframing signal may not appear until many turns after the tag was assigned. Standard RL handles this with temporal discounting; the discount factor needs calibration.

### Tagger Family: Diversity Mechanism

**Proposed mechanism: Genetic Programming (placeholder)**

GP evolves tagging _strategies_ (programs, prompt templates, classification rules) rather than parameters of a fixed architecture. This generates genuine diversity without handcrafting.

Modern analog: **DSPy** (Stanford) — structured prompt optimization via search. Whether the implementation is GP, DSPy-style, or something else is secondary; the key property is _generated diversity_.

**Differentiation candidates:**

- Granularity level: coarse topic tags (`voice-pwa`) vs. fine entity tags (`caddy`, `tailscale`)
- Vocabulary scope: closed taxonomy vs. open extension
- Strategy: context-window-based, entity-extraction-based, semantic-similarity-based
- Model size: cheap/fast vs. expensive/accurate

**Aggregation (mixture model):**

- Top-rated taggers (by quality agent score) form an ensemble
- Per-tag majority vote, weighted by quality scores
- **Pruning step required:** raw mixture over-tags (good for recall, bad for precision); quality agent must also learn to prune redundant/low-value tags from ensemble output
- Result: mixture has better recall than any single tagger; pruning step restores precision

### DAG Property (Critical Design Constraint)

The temporal ordering of messages makes the graph a **DAG (Directed Acyclic Graph)** — no cycles are possible because time only moves forward.

This is not a minor detail. It gives us:

- **Topological sort:** always possible to reconstruct a coherent chronological narrative along any path
- **No paradoxes** in context assembly (no "what came before what" ambiguity)
- **Clean compaction boundaries:** a compaction summary always covers a well-defined time interval

**Design invariant to preserve:** Never create edges that violate temporal ordering. All edges point forward in time (from earlier to later messages).

---

## Comparison to Existing Approaches

| System               | Structure                              | Compaction               | Tag-based?        | Lossless archival? |
| -------------------- | -------------------------------------- | ------------------------ | ----------------- | ------------------ |
| Current flat window  | Linear/temporal                        | Destructive summary      | No                | No                 |
| MemGPT/Letta         | Hierarchical (working/archival/recall) | LLM-managed paging       | No                | Partial            |
| GraphRAG (Microsoft) | Entity/relationship graph over docs    | N/A (retrieval)          | Implicit (entity) | Yes                |
| ReadAgent            | Episodic with gisting                  | Gist summaries           | No                | No                 |
| **This proposal**    | Tag-conditioned DAG                    | Non-destructive, per-tag | **Yes**           | **Yes**            |

**Key novel contributions of this proposal vs. existing work:**

1. Tag-conditioned (not just similarity-conditioned) compaction
2. Multi-tag composition for context assembly
3. Lossless archival with derived compaction views
4. Explicit policy for recency + topic + specificity layering

---

## Design Dimensions to Resolve

### Tagging Strategy (most critical)

```
Option A: Real-time tagging by the interacting model
  + Low latency, organic
  - Locked to current model's understanding; inconsistent over time

Option B: Retrospective tagging by a dedicated model
  + Can be re-run with better models; more consistent
  - Expensive; latency between message and tag availability

Option C: Hybrid — real-time rough tags, retrospective refinement
  + Best of both
  - Complex pipeline

Option D: User-defined tags with LLM suggestions
  + Explicit; user controls the ontology
  - Requires user effort; may not scale
```

### Tag Vocabulary

```
Option A: Open (any string)
  + Flexible, organic
  - Drift, inconsistency, near-duplicates (openclaw vs open-claw vs OpenClaw)

Option B: Closed taxonomy (predefined hierarchy)
  + Consistent, queryable
  - Rigid; requires upfront design

Option C: Emergent clustering (cluster tags dynamically)
  + Adaptive
  - Complex, potentially unstable

Option D: Seeded open (start with a taxonomy, allow extensions with canonicalization)
  + Pragmatic balance
  - Canonicalization requires ongoing maintenance
```

### Compaction Granularity

```
Option A: Per-tag chain compaction (each tag compacts independently)
  + Simple, predictable
  - Misses cross-tag coherence; duplicate summarization of shared messages

Option B: Per-topic compaction (cluster related tags, compact together)
  + Semantically richer summaries
  - Requires knowing which tags cluster (circular dependency)

Option C: On-demand compaction at context assembly time
  + Always fresh for the current query
  - Expensive; unpredictable latency
```

---

## Implementation Sketch (strawman)

```
Storage layer:
  - Message store: raw message/response pairs + metadata (timestamp, session, etc.)
  - Tag index: tag → [(message_id, timestamp)] sorted chronologically
  - Compaction store: tag → [CompactedSummary(time_range, model, content)]

Tagging pipeline:
  - Input: new message/response pair
  - Output: set of tags + confidence scores
  - Runs asynchronously after message is stored

Context assembly (at inference time):
  1. Infer tags for incoming message (quick embedding lookup or lightweight classifier)
  2. For each tag: retrieve recent N raw messages + trailing compacted summaries
  3. Deduplicate shared messages across tags
  4. Fill recency layer with unconditional recent messages
  5. Pack into context window with token budget per layer
  6. Return assembled context to model

Compaction trigger:
  - Background job: for each tag, if raw_message_count > threshold OR oldest_raw > max_age → compact
  - Compaction: send tag chain to compaction model, store CompactedSummary, keep originals
```

---

## Prototype Considerations

A minimal prototype could be:

1. A SQLite-backed message store with a tag index
2. A simple tagging step using the interaction model (GPT-4o-mini or similar) after each turn
3. A hardcoded context assembly policy (e.g., 50% recency, 50% topic)
4. No compaction initially — just test retrieval quality with full history

This would let us validate whether tag-based retrieval produces meaningfully better context than flat recency before investing in the compaction machinery.

---

## Open Questions Summary (prioritized)

**Must resolve before design:**

1. ~~Tagging strategy — real-time, retrospective, or hybrid?~~ **Resolved:** Specialized async tagger agent(s), runs after each exchange. Quality agent does retrospective re-evaluation.
2. Tag vocabulary model — open, closed, or seeded-open?
3. What triggers compaction and at what granularity?
4. **[NEW] Quality agent objective function** — retrieval quality (delayed reward) or proxy metrics?
5. **[NEW] Tagger family diversity** — what differentiates competing taggers?
6. **[NEW] Aggregation function** — how does the tagger family converge to a single tagging?

**Must resolve before prototype:** 7. Tag inference for incoming messages — how? (now: what does the tagger agent receive as input?) 8. Token budget allocation across layers 9. Deduplication strategy for multi-tag messages

**Can defer to later iteration:** 10. Cross-tag relationship modeling 11. Compaction model selection 12. Performance/latency optimization 13. Multi-user / multi-session graph isolation 14. Evolutionary dynamics of tagger family (selection pressure, elimination criteria)

---

## Resolved Design Decisions

| Decision              | Resolution                                                                     | Date       |
| --------------------- | ------------------------------------------------------------------------------ | ---------- |
| Graph vs. tree        | **Graph (DAG)** — messages are nodes, time-ordered edges, multi-tag membership | 2026-02-23 |
| Tagging timing        | **Async tagger agent** — runs after each exchange, non-blocking                | 2026-02-23 |
| Tag vocabulary        | **Seeded-open** — curated core + canonicalized extensions                      | 2026-02-23 |
| Tagger architecture   | **Specialized multi-agent** — tagger family + quality agent                    | 2026-02-23 |
| RL framing            | **Discrete-time RL** — actor-critic, not GAN                                   | 2026-02-23 |
| Quality proxy         | **Context density + reframing frequency** as behavioral signals                | 2026-02-23 |
| Tagger aggregation    | **Weighted mixture model + pruning step**                                      | 2026-02-23 |
| Genome representation | **Structured programs over message features**                                  | 2026-02-23 |

---

## Genome: Structured Programs Over Message Features

### Rationale

Structured programs (as opposed to raw prompt templates or classifier weights) give us:

- **Tractable search space** — GP operates over a grammar of feature extractors and combinators, not arbitrary text
- **Interpretability** — you can read a tagging strategy and understand why it fires
- **Reference literature** — tagging algorithms, rule-based NLP classifiers, and decision trees over text features are well-studied; we can mine this for initial implementations
- **Debuggability** — when the quality agent rejects a strategy, you can see exactly why

### Message Features Available to Programs

A tagging program operates over these extracted features per message/response pair:

```
TextFeatures:
  - token_count: int
  - entities: List[str]          # named entity recognition (people, orgs, products, etc.)
  - noun_phrases: List[str]      # key noun phrases
  - sentiment: float             # -1.0 to 1.0
  - topics: List[str]            # zero-shot topic classifier outputs
  - question_type: Optional[str] # factual / procedural / clarification / none

 ContextFeatures:
  - session_id: str
  - timestamp: datetime
  - prior_tags: List[str]        # tags on recent messages (temporal context)
  - user_id: str

MetaFeatures:
  - is_user_turn: bool
  - response_length: int
  - contains_code: bool
  - contains_url: bool
```

### Program Grammar (strawman)

A tagging program is a tree of:

- **Leaf nodes:** feature tests (e.g., `entity_matches("tailscale")`, `topic_score("security") > 0.7`)
- **Internal nodes:** logical combinators (`AND`, `OR`, `NOT`, `IF/THEN/ELSE`)
- **Output:** a set of tag assignments with confidence scores

Example evolved program:

```
IF contains_code AND topic_score("infrastructure") > 0.6:
    ASSIGN ["devops", "code"]
IF entity_matches(["tailscale", "caddy", "nginx"]):
    ASSIGN ["networking", "infrastructure"]
IF prior_tags_include("voice-pwa") AND contains_url:
    ASSIGN ["voice-pwa"]
```

### Reference Literature to Mine

- **Rule-based text classifiers** — Brill tagger (1992), rule-learning for NLP
- **Decision tree induction over text** — C4.5 / CART applied to NLP features
- **GP for symbolic regression** — DEAP library (Python) — ready-to-use GP framework
- **Program synthesis for classifiers** — FlashFill-style synthesis over feature grammars
- **DSPy** — LLM-based prompt optimization; closest modern analog for the "evolve tagging strategies" step

---

## Prototype Scope (v0.1)

### Goal

Validate that tag-based context assembly produces meaningfully better context than flat recency, _before_ investing in GP/quality agent machinery.

### What's In

1. **Message store** — SQLite, stores raw message/response pairs + metadata
2. **Tag index** — SQLite table, maps tag → [(message_id, timestamp)]
3. **Single tagger (v0)** — hand-written structured program using simple feature extraction (entity matching + zero-shot topic classifier)
4. **Context assembler** — given an incoming message, infer likely tags, retrieve top-K messages per tag, assemble context with recency layer
5. **Basic CLI** — add messages, query context for a given input, inspect tag index

### What's Out (deferred)

- GP-based tagger evolution
- Quality agent
- Compaction / summarization
- Multiple competing taggers
- Reframing frequency measurement

### Tech Stack

- **Language:** Python 3.12
- **Storage:** SQLite (via `sqlite3` stdlib)
- **NLP:** `spacy` (entity extraction, noun phrases) + `transformers` zero-shot classifier
- **Embedding:** `sentence-transformers` for semantic similarity fallback
- **GP (future):** DEAP library

### Directory Structure

```
tag-context/
  store.py          # MessageStore + TagIndex (SQLite)
  features.py       # Feature extraction from message text
  tagger.py         # v0 structured-program tagger
  assembler.py      # Context assembly policy
  cli.py            # Simple CLI for testing
  tests/
    test_store.py
    test_tagger.py
    test_assembler.py
  README.md
```

### Context Assembly Algorithm (v0)

```python
def assemble_context(incoming_message: str, token_budget: int) -> List[Message]:
    # 1. Extract features from incoming message
    features = extract_features(incoming_message)

    # 2. Infer relevant tags
    inferred_tags = tagger.assign_tags(features)

    # 3. Recency layer: last N messages regardless of tag (25% of budget)
    recency = store.get_recent(n=10)

    # 4. Topic layer: top-K per tag, deduplicated (50% of budget)
    topic_messages = []
    seen_ids = set(m.id for m in recency)
    for tag in inferred_tags:
        candidates = store.get_by_tag(tag, limit=20)
        for msg in candidates:
            if msg.id not in seen_ids:
                topic_messages.append(msg)
                seen_ids.add(msg.id)

    # 5. Pack into token budget, recency first, then topic (most recent first)
    return pack_to_budget(recency + sorted(topic_messages, key=lambda m: -m.timestamp),
                          token_budget)
```

---

## Next Steps

- [x] Resolve graph vs. tree
- [x] Resolve tagging architecture (multi-agent RL)
- [x] Resolve genome representation (structured programs)
- [x] **v0.1 complete** — store, features, tagger, assembler, CLI, harvester, replay
- [x] **v0.2 complete** — quality agent, reframing detector, GP tagger, ensemble, benchmark
- [x] Context assembly validated with real data (42 interactions, 16-tag vocabulary)
- [x] GP harness working (DEAP, per-tag Boolean predicates, picklable)
- [x] Quality agent implemented (context density + reframing frequency)
- [x] Benchmark: baseline, GP, and ensemble compared head-to-head

### Benchmark Results (v0.2, 52 interactions)

```
                          Baseline     GP     Ensemble
  context_density           0.459   0.524      0.487
  reframing_rate            0.650   0.650      0.650
  fitness                   0.416   0.454      0.432
```

GP wins on density with only 36 training examples. Results fluctuate per run
(small dataset + random GP init). Ensemble lands between baseline and GP.
Key insight: with more data accumulation, GP should stabilize and ensemble
should converge to better-than-either.

### Next steps (v0.3)

- [ ] Accumulate more training data (nightly harvest cron running)
- [ ] Evolve with larger dataset (100+ interactions)
- [ ] Quality-agent-derived labels (replace baseline pseudo-ground-truth)
- [ ] Online learning: re-evolve periodically as new data arrives
- [ ] Integration with OpenClaw: wire ensemble into actual context assembly

---

_This document is a living design artifact. Update it as decisions are made._
_Repo: TBD — likely `~/Projects/tag-context/`_
