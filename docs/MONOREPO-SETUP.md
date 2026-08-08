# personal-drone — monorepo kickoff (prepped & ready)

> Stand up the NEW `personal-drone` repo with `drone-hub` pulled in as the framework **git
> submodule**. Mathew runs these; everything's decided except the 3 open items in
> `PLATFORM-REQUIREMENTS.md` §15 (tooling / DB / client-auth). This assumes **pnpm + Turborepo**
> (swap to npm workspaces if preferred — notes inline). Fully separate from personal-site.

## Prereq: give drone-hub a remote (needed for a submodule)
`drone-hub` is local-only right now. A submodule needs a URL. Push it first:

```bash
# in drone-hub — create the GitHub repo and push (gh or web UI)
cd /Users/mdostal/Documents/work/personal/drone-hub
gh repo create mdostal/drone-hub --private --source=. --remote=origin --push
# (or: create empty repo in the UI, then: git remote add origin git@github.com:mdostal/drone-hub.git && git push -u origin main)
```
*(Fallback with no remote yet: you can `git submodule add ../drone-hub packages/framework` using a
local path, then swap to the GitHub URL later. Remote is cleaner for CI/Vercel.)*

## 1. Create personal-drone + add the framework submodule
```bash
cd /Users/mdostal/Documents/work/personal
mkdir personal-drone && cd personal-drone
git init
git submodule add git@github.com:mdostal/drone-hub.git packages/framework
git commit -m "Init personal-drone; add drone-hub as framework submodule"
```
Now `packages/framework/` IS drone-hub (VideoTour spec, `lib/tour-types.ts`, components, docs). Pin/
upgrade it deliberately with `git -C packages/framework pull` + commit the new pointer.

## 2. Workspace config (pnpm + Turborepo)
**`package.json`** (root):
```json
{
  "name": "personal-drone",
  "private": true,
  "packageManager": "pnpm@9",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint"
  },
  "devDependencies": { "turbo": "^2" }
}
```
**`pnpm-workspace.yaml`**:
```yaml
packages:
  - "apps/*"
  - "packages/framework"      # the drone-hub submodule = the @dostal/framework package
```
**`turbo.json`**:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {}
  }
}
```
> **npm-workspaces alt:** drop `pnpm-workspace.yaml` + `turbo`; put `"workspaces": ["apps/*",
> "packages/framework"]` in the root `package.json`. Same layout.

**One-time in the submodule:** give `packages/framework/package.json` a real name + exports so the app
can import it — e.g. `"name": "@dostal/framework"`, exporting `./components` and `./schema`
(`lib/tour-types.ts`). Commit that inside drone-hub.

## 3. Scaffold the portal app
```bash
cd apps
pnpm create next-app@latest portal --ts --tailwind --app --eslint --src-dir=false --import-alias "@/*"
cd portal
pnpm add @dostal/framework@workspace:*        # the framework submodule
# component + asset deps (from framework's package.json): maplibre-gl pmtiles @turf/turf terra-draw three @react-three/fiber @react-three/drei hls.js embla-carousel-react @aws-sdk/client-s3
# auth + data (per §15 choices): next-auth  + (supabase OR @prisma/client prisma)
```
Portal route skeleton (per `PLATFORM-REQUIREMENTS.md` §6–8):
```
apps/portal/app/
  (marketing)/          # public landing — two lanes, hero = On-Site Intelligence report
  contracts/            # public sample templates (from docs/pricing-and-packages.md)
  admin/                # OWNER: clients, properties, deliverables, pipeline, packages, contracts+COI
  portal/               # CLIENT: login -> their properties -> tour/report/videos/downloads
  api/auth/[...nextauth]/
middleware.ts           # owner allowlist for /admin; client session for /portal
```

## 4. Deploy
Vercel project on `personal-drone` (root = `apps/portal`), domain **drone.mdostal.com** pointed here
(retire the personal-site redirect-to-/drone once this ships). Env: auth + DB + R2/Stream creds.

## 5. First build target (P1 MVP)
Owner adds a client + property + uploads the **Prado VideoTour** manifest; a client logs in (magic
link) and sees ONLY their tour. Cross-tenant access must fail closed. Everything else follows §13.

---
### Checklist to hand the hive
- [ ] drone-hub pushed to a remote
- [ ] personal-drone created + submodule added
- [ ] workspace + turbo wired; `pnpm build` builds framework + portal
- [ ] portal skeleton (marketing / contracts / admin / portal routes)
- [ ] §15 decisions made (tooling ✓, DB, client-auth) before wiring auth/data
- [ ] P1 MVP: client logs in, sees their tour, no cross-tenant leak
