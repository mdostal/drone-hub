# Drone Hub

Property-intelligence drone platform — owned, plug-and-play React components
(MapLibre layer viewer + 3D + video annotation). **Build the viewer, buy only compute.**

- **Kickoff brief:** `CLAUDE.md`
- **Cost-benefit analysis + build plan:** `docs/CBA.md`
- **Phase 0 (do first):** fly ONE nadir grid pass → WebODM → reference ortho/DSM/mesh.

Reference product: Hammer Missions (hub.hammermissions.com). Output is **visual
property-intelligence, not survey-grade** (Mini 5 Pro, no RTK/thermal yet).

## Testing

`npm test` runs the full Vitest + React Testing Library suite (jsdom,
config in `vitest.config.mts`) and **must pass before pushing** — there's no
CI wired up yet, so this is the pre-push check until that lands. Use
`npm run test:watch` while iterating.
