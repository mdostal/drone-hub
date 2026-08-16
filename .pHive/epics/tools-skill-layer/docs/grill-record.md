# Grill record — tools-skill-layer

round_number: 1
unresolved_count: 0

Self-review pass against the design-discussion draft (see §0 prelude for why
this is a direct pass rather than a separate tpm-persona dispatch — no
vendored Hive runtime in this repo, and the finding categories below don't
need a second model to surface).

## Findings

1. **Hidden assumption — "wire up imports" was underspecified.**
   The draft said `add-component` "wires up imports" without defining what
   that concretely means. Resolved: the story's acceptance criteria now
   name the exact steps (copy component + its type file(s) from
   `lib/*-types.ts`, copy/create the sample-data folder convention, surface
   any new `package.json` dependency the component needs that the target
   app doesn't already have) rather than leaving "wire up" vague.

2. **Convention gap — where do Skills actually live on disk?**
   Neither `docs/components/*.md` nor `pipeline/README.md` establishes a
   convention for this. `personal-drone` uses `.agents/skills/`;
   Claude Code's own project-skill discovery convention is
   `.claude/skills/<name>/SKILL.md`. Resolved: use `.claude/skills/` — it's
   the tool's actual native discovery path, not a project-specific
   convention borrowed from a different repo.

3. **Vocabulary — "MCP server" needs a concrete implementation surface
   named, not left abstract.** Resolved: the story names
   `@modelcontextprotocol/sdk` (the real, standard TypeScript SDK for this)
   explicitly, and specifies stdio transport, so the developer isn't
   guessing at a library or transport choice.

4. **Posture check — does any of this risk violating "never import
   `/pipeline` from `app/`/`components/`/`lib/`"?** No. Pipeline scripts
   stay a sibling directory exercised by a separate skill's shell/CLI
   commands, never imported. The MCP server is a separate small package
   (own `package.json`, not a dependency of the Next.js app). Skills are
   markdown + scripts under `.claude/skills/`, also never imported.
   No violation; noted and closed, not a hidden gap.

All four findings were resolved by revising the plan directly (design
discussion + story acceptance criteria) rather than left open — 0 unresolved
at round close.
