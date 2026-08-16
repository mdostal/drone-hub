# Design discussion — tools-skill-layer

## §0 Prelude

No `north_star` block exists yet in `.pHive/project-profile.yaml` for this
repo (Discovery Questions weren't run at this repo's original kickoff), and
`/hive:why` has no prior KG decisions on this topic — first plan touching
skills/MCP. No PRIOR DECISIONS or NORTH STAR sections to render.

**Process note, stated plainly:** this plan was produced by the orchestrator
directly rather than via full Hive team dispatch (spawned researcher/TPM/
architect/UI-designer personas with multi-round SendMessage review). The
repo has no vendored `hive/` runtime (`hive/lib/`, `hive/agents/`,
`hive/workflows/` don't exist here — this plugin resolves against a shared
package at `~/Code/plugin-hive/`), and the request itself is squarely
infra/tooling-shaped rather than needing multiple specialist lenses. The
research brief was built from direct, verified file reads (documented with
paths above) rather than a separate researcher persona's findings. This is a
scope-proportionate substitution, not a shortcut past the parts that matter:
the requirement is still decomposed into stories with real acceptance
criteria and dependency tracking, and it's confirmed with the user before
any code is written.

## §1 Goal

Give drone-hub's tooling — the component framework and the drone-hub
processing pipeline — an actual "how do I use/install/work on this" surface,
instead of requiring anyone (including future me, including the operator's
own future sessions) to read the repo by hand to figure it out. Two concrete
deliverable shapes, per the operator's own words: **Claude Code Skills**
(procedural, run-this-workflow) and an **MCP server** (queryable, ask-this-
question), covering both halves of the ask — "the tools" (the component
framework: install/use it, work on it) and "the pipeline" (which doesn't
exist as real code yet, so has to be built before it can be wrapped).

## §2 Proposed approach

Three horizontal layers, four vertical slices — see horizontal-plan.md and
vertical-plan.md for the full breakdown. Summary:

**Layer 1 — finally-real `/pipeline` scripts.** `pipeline/README.md`'s own
stated reason for staying documentation-only (no real ODM output to
validate against) is stale — v1/v2 Prado output exists on disk right now.
This layer turns the README's already-precise command mapping (§ research
brief) into checked-in, parameterized scripts + a `build-manifest.py`,
validated against the known-good v1/v2 deliverables as an answer key. This
is the foundation everything else in this epic depends on — a pipeline
skill can't wrap a pipeline that isn't code yet.

**Layer 2 — Claude Code Skills**, three of them, different audiences:
  - `run-pipeline` — wraps Layer 1. Audience: the operator, running a new
    property through the pipeline. Depends on Layer 1.
  - `add-component` — shadcn-CLI-style copy-and-wire-up of a drone-hub
    component into an external Next.js app. Audience: someone (the operator,
    on mdostal.com or tools.mdostal.com, or later a third party) consuming
    the framework. Independent of Layer 1 — this only touches
    `components/`/`docs/components/*.md`, both already real.
  - (Folded into `add-component` rather than split out, see open questions
    below) working *on* a component — scaffolding a new one to the
    framework's conventions.

**Layer 3 — MCP server**, one server: a local stdio process (registered in
this repo's `.mcp.json`) exposing the component catalog — `list_components`,
`get_component_docs(slug)`, `get_component_usage(slug)` — read directly off
`docs/components/*.md`. This answers "how do I use these" for any MCP
client (not just a Claude Code session with this repo open) without cloning
the repo. Independent of Layer 1 — reads already-real docs.

## §3 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Pipeline scripts encode wrong assumptions about ODM output shape, only caught after use | medium | Validate every script against the real v2 `odm-full-output/` on disk, diffed against the known-correct compressed deliverables already in `git show df621d2:...`/the v2 folder — an answer key exists, use it. |
| `run-pipeline` skill is written before Layer 1 scripts are solid, baking in the same assumptions twice | low (sequencing risk, not a real unknown) | Hard dependency: Layer-2 `run-pipeline` story cannot start until Layer-1 stories are done and validated. |
| MCP server drifts from `docs/components/*.md` (two sources of truth) | medium | Server reads the `.md` files directly at request time — no copied/duplicated content, no build step to go stale. |
| `add-component` skill's copy-and-wire-up breaks silently as components gain new dependencies over time | low | Skill enumerates a component's actual imports (from `docs/components/<slug>.md`'s own usage snippet + `package.json`) rather than hardcoding a per-component file list — same self-updating principle as the MCP server. |
| Scope creep: this quietly becomes "publish an npm package" | medium | Explicitly reject in this design — CLAUDE.md's stack decision is "own the viewer," not publish-and-consume; `add-component` skill copies files, it doesn't `npm install` anything. |

## §4 Dependencies

- Layer 2's `run-pipeline` story **depends on** all Layer 1 stories.
- Layer 2's `add-component` story and Layer 3's MCP server story are each
  **independent** of Layer 1 and of each other — parallel-eligible.
- Nothing in this epic depends on `/flight-control` (excluded, see below) or
  on any currently-open question about real client/multi-tenant concerns
  (out of drone-hub's scope per CLAUDE.md's scope-boundary correction).

## §5 Open questions — answered here, not left dangling

1. **Where does the MCP server run?** Resolved in the research brief: local
   stdio, spawned via this repo's `.mcp.json`, no hosting decision needed.
2. **Is `/flight-control` in scope?** No. Confirmed explicitly: it's a
   documentation-only stub with an unresolved, unevaluated open question
   (DJI SDK/Litchi/Dronelink Mini-class support) and CLAUDE.md's own vision
   section queues it behind everything else, including this epic's own
   groundwork. There's nothing real to wrap yet — wrapping it now would mean
   inventing behavior this repo has no way to validate, the same failure
   mode `pipeline/README.md` correctly avoided by staying docs-only until
   real ODM output existed.
3. **One `add-component` skill, or split "install" vs. "contribute"?**
   Folding both into one skill for this pass — the two workflows share
   almost all their logic (read a component's real dependency/manifest
   shape, either to copy it out or to scaffold a new one matching the same
   shape) and splitting now would be premature separation with no second
   real user yet. If a genuinely different "contribute a new component"
   workflow emerges with real friction, split then.
4. **Does `.mcp.json` at the repo root risk leaking into `git status`/repo
   hygiene for a public showcase repo?** No — `.mcp.json` is a normal,
   already-common committed convention (this session's own environment has
   several project-scoped MCP servers configured this way) and contains no
   secrets; the server itself only reads local `docs/*.md` files.

## §6 Scale assessment

**Medium.** Multi-file, multiple layers (pipeline scripts, skill authoring,
MCP server), cross-stack (Python/shell scripts, Markdown-as-skill-content,
a small Node/TS MCP server) — not a single-layer change, but not a
multi-system migration either. Per plan protocol, Medium scope runs
horizontal + vertical planning, then auto-proceeds to story decomposition
without an extra user gate (default, no `--gate-hv`) after this document is
confirmed.

## §7 Methodology note (operator's explicit callout, honored here)

Every story in this epic is infra/scripting/documentation-authoring, not
UI/BDD-shaped work. `hive.config.yaml`'s repo-wide default (`bdd`) exists
for full component build-out (Gherkin specs matching a UI's user-facing
behavior) — none of that applies here: there's no UI, no user-facing
Gherkin scenario to write for "does the hillshade script produce a valid
COG." All stories in this epic use **classic** methodology
(research → implement → test → review → integrate), overriding the repo
default per-epic in `epic.yaml`.
