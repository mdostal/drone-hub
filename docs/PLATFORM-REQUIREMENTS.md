# Dostal Aerial — Platform Requirements (the blowout)

> **What this is:** the full requirements + architecture for turning drone.mdostal.com into a
> **multi-tenant client portal** built on the reusable drone component **framework**. Written so a
> hive can build it 100% without re-deciding the shape. Scope is big on purpose; **Phasing (§13)**
> says what to build first. Companion to the component specs in `docs/components/`.
>
> **Hard gate:** nothing client-facing goes live / charges money until **Part 107** is in hand.
> Build the platform + samples now; flip it commercial at the cert.

---

## 0. TL;DR + the repo decision (DECIDED 2026-08-07)

**`personal-drone` = a NEW standalone repo — the implementation monorepo. `drone-hub` = a git
SUBMODULE inside it — the reusable component framework.** Completely **separate from personal-site**,
same as life.mdostal.com is its own property. None of this lives in the personal marketing site.
Mathew kicks off `personal-drone`; this repo (drone-hub) is prepped as the framework it pulls in.

```
personal-drone/                 # NEW repo — the Dostal Aerial platform (implementation monorepo)
├─ packages/
│  └─ framework/                # ← drone-hub as a GIT SUBMODULE (VideoTour/LayerViewer/... + schema)
├─ apps/
│  └─ portal/                   # the drone.mdostal.com app: marketing + /contracts + owner admin + client portal
├─ pipeline/                    # NON-bundled WebODM/overlay/catalog scripts + docker
└─ docs/                        # requirements + setup (travel in from the framework submodule)
```

- **Kickoff — Mathew runs it:** see **`MONOREPO-SETUP.md`** (git init, add drone-hub as a submodule
  under `packages/framework`, wire workspaces, scaffold `apps/portal`). Prepped, paint-by-numbers.
- **Tooling:** pnpm workspaces + Turborepo (recommended) — or npm workspaces to match personal-site.
  The submodule + structure are identical either way.
- **Why submodule not copy:** the framework stays its own versioned repo (still importable elsewhere);
  personal-drone pins a commit and upgrades deliberately.
- **Why fully separate from personal-site:** multi-tenant client data + auth + private assets get
  their own repo + deployment — the same split you already run for life-site. The personal-site
  `/admin` branch was a throwaway stopgap; its content (packages, contracts) is ported here.

**Positioning (your mdostal SMB-vs-others analogy):** the site **tapers to a focused core** —
**Desktop Property Intelligence** — but you still take listing/roof/other work and share other links.
Split further later if a lane earns it. Focused brand, flexible hustle.

---

## 1. Vision & scope
Dostal Aerial delivers **property intelligence + media** as productized packages (see the pricing
panel output / owner admin). The platform is how clients **receive and live with** those
deliverables: each client logs into drone.mdostal.com and sees **their** properties — interactive
fly-through tours, property-intelligence viewers, videos, reports, downloads — private to them.

Three surfaces, one app:
| Surface | Who | Purpose |
|---|---|---|
| **Marketing** | public | Sell. Two lanes (Listing funnel vs Intelligence ladder), hero = the On-Site Property-Intelligence Report. + `/contracts` templates. |
| **Owner admin** | Mathew only | Manage clients, properties, deliverables; run the pipeline; provision client access; packages/pricing; contracts/COI. |
| **Client portal** | each client | Log in → see only THEIR properties + deliverables → view interactive components → download → (later) request more. |

---

## 2. The component framework (`packages/components`)
Already spec'd in `docs/components/` — these become the framework packages the portal consumes:
- **`<VideoTour>`** — interactive fly-through (spec: `docs/components/video-tour.md`; schema `packages/schema`).
- **`<LayerViewer>`** — aerial + LiDAR + parcel overlay toggling = **the property-intelligence moat** (gated on the Phase-0 nadir pass → WebODM).
- **`<Model3D>`** — photogrammetry mesh/point-cloud viewer (later).
- **`<Gallery>`** — shot carousel.
- **`<VideoAnnotator>`** — draw/measure over clips.
All must remain **manifest-driven and importable standalone** (into personal-site or the portal),
no coupling to app auth/routing.

---

## 3. Data model (`packages/schema` + DB)
Relational, multi-tenant. Recommend **Postgres + Prisma** (Supabase or Neon).

```
Client (org)      id, name, primaryContactEmail, notes, createdAt
User              id, email, clientId?(FK), role: 'owner' | 'client', lastLogin
Property          id, clientId(FK), label, address(PRIVATE), slug, status, releaseSigned:bool
Deliverable       id, propertyId(FK), type: 'tour'|'report'|'video'|'gallery'|'ortho',
                  manifestKey(R2), status: 'draft'|'delivered', publishedToPortal:bool,
                  portfolioUseAllowed:bool
Order (P4)        id, clientId, packageKey, priceUsd, status, ...
```
- A **Deliverable.manifestKey** points at a JSON manifest on R2 (e.g. a `Tour` manifest for a tour,
  a layer registry for a LayerViewer report). The components render from these manifests.
- `Property.releaseSigned` + `Deliverable.portfolioUseAllowed` drive whether Mathew may reuse assets
  publicly (ties to the Property Access & Footage Release).

---

## 4. Auth & multi-tenancy (the security spine)
- **Two roles:** `owner` (Mathew, allowlist) and `client`.
- **Client auth:** recommend **next-auth with a DB adapter** — magic-link email (lowest friction for
  non-technical clients) or Google. Each client `User.clientId` scopes them to one org.
- **⚠ Hard isolation requirement:** a client must **NEVER** see another client's properties, assets,
  or even their existence. Enforce at **two layers**:
  1. **Query layer** — every data query is filtered by `clientId` derived from the session, server-side.
     Never trust a client-supplied id.
  2. **Asset layer** — R2 objects are private; the server issues **short-lived signed URLs** only for
     deliverables belonging to the requester's client.
- Owner sees everything; clients see their subtree only. Cross-tenant leakage is the #1 thing to test.

---

## 5. Asset hosting & gating
- **R2 (private buckets)** for images/manifests/reports; **Cloudflare Stream** for video (adaptive,
  off-Vercel bandwidth). `@aws-sdk/client-s3` already a dep.
- **No public asset URLs.** All client assets served via server-issued **signed URLs** scoped to the
  authenticated client + property. Marketing/portfolio samples live in a separate public/opt-in bucket.
- Manifests stored per property: `clients/<clientId>/<propertyId>/<deliverable>/manifest.json` + assets.

---

## 6. Owner admin flows (`apps/portal` `/admin`)
1. **Clients:** create/edit a client org; invite a client user (sends magic link).
2. **Properties:** add a property to a client (address kept private); set release-signed status.
3. **Deliverables:** upload/generate a deliverable (tour / report / video / gallery); attach its R2
   manifest; mark `delivered` + `publishedToPortal`; toggle `portfolioUseAllowed`.
4. **Pipeline hooks:** kick the `pipeline/` jobs (WebODM ortho, LiDAR overlay bake, Gemini shot
   catalog) and land outputs as deliverable manifests.
5. **Business:** the 13-persona **package menu + pricing**, the **readiness checklist**, **contracts +
   COI** (this is what the interim personal-site `/admin` holds today — migrate it here).

## 7. Client portal flows (`apps/portal` `/portal`)
1. **Login** (magic link) → **dashboard** listing only their properties.
2. **Property page** → tabs of delivered components: **Fly-Through Tour** (`<VideoTour>`),
   **Property Intelligence** (`<LayerViewer>`), **Videos** (Stream), **Gallery**, **Report** (PDF/interactive).
3. **Download** deliverables (signed URLs).
4. **(P4)** Request a new shoot / order a package → creates an Order.

## 8. Marketing + `/contracts`
- **Marketing:** public landing selling the two lanes; **hero = On-Site Property-Intelligence Report**;
  the interactive viewer as the "no one can copy this" proof. Two separate price sheets (never mix a
  $200 photo tier next to a $1,500 report).
- **`/contracts`:** public/semi-public **sample templates** — Service Agreement, Property Access &
  Footage Release, and business templates. (Move the drafted samples here; keep the "attorney review"
  banner.) These are the *blank templates*; executed client agreements live in owner admin, private.

---

## 9. Tech stack
- **Next.js 15 · React · Tailwind · shadcn** (matches personal-site), on **Vercel**.
- **next-auth** (DB adapter) · **Postgres + Prisma** (Supabase/Neon) for clients/properties/deliverables.
- **Cloudflare R2** (`@aws-sdk/client-s3`) + **Cloudflare Stream** for assets/video.
- Framework component deps (already in `package.json`): `maplibre-gl`, `pmtiles`,
  `@geomatico/maplibre-cog-protocol`, `@turf/turf`, `terra-draw`, `three` + r3f + drei, `hls.js`,
  `embla-carousel-react`.
- Heavy viewers `next/dynamic({ ssr:false })`. Pipeline (WebODM/GDAL/rio-*/PDAL/tippecanoe) stays in
  `pipeline/` as scripts+docker, **never in the app bundle**.

## 10. Pipeline integration
`nadir passes → WebODM/OpenDroneMap → ortho (COG) + DSM + point cloud + mesh → tile (PMTiles/COG) →
LayerViewer/Model3D manifests`. LiDAR hillshade/heightmap baked from USGS 3DEP (`bake-property.py`).
Gemini shot-catalog + overlay pipeline (proven on Prado) feeds tour/gallery deliverables. All outputs
land as **deliverable manifests** on R2, attached in owner admin.

---

## 11. Security & privacy requirements (non-negotiable)
- **Per-tenant isolation** enforced at query + asset layers (test cross-tenant access explicitly).
- **Property addresses + owner PII private**; never in public URLs, sitemaps, or indexes. Portal pages `noindex`.
- **Property-intelligence disclaimer** embedded in every report deliverable ("screening-grade, NOT a
  survey, ~1–3 m, qualitative"). No hard sq-ft/slope-% a client designs to (unlicensed-surveying risk).
- **Portfolio use** gated on a **signed release** (`portfolioUseAllowed`); default private.
- **No identifiable persons/minors/neighbors** in any published/portfolio media (existing discipline).

## 12. Non-goals + the opportunistic lanes
**Deferred:** survey-grade accuracy / RTK / GCP volumetrics · real-time flight streaming · a public
multi-vendor marketplace · recurring progress-mapping retainers (solo + relocating can't guarantee
scheduled revisits — Phase-2 post-Omaha).

**Roof / inspection — NOT cut; reframed as a CONTENT + opportunistic on-demand lane (updated 2026-08-07):**
- More prevalent than assumed — Mathew counted ~4 drones on his rental's remodel/photos + roof job;
  insurance & inspectors already do fences, surveying, completion inspections.
- **Play now:** make the CONTENT (gutter / solar-panel / roof inspection demos) and pitch roofers &
  inspectors the **"5-minute flight to QC your crew's work → have them clean it up"** and the
  **"liability lock-in video."** Sell VISUAL condition only; bundled add-on, never a survey-grade claim.
- **Thermal drone = spend-THEN-to-close:** acquire it WHEN job volume justifies it (unlocks the premium
  roof / solar / energy / insurance buyers who need radiometric thermal). Not a blocker — a trigger.

---

## 13. Phasing — build order
| Phase | Deliverable | Done-when |
|---|---|---|
| **P0** | Monorepo scaffold; move existing components → `packages/components`; `packages/schema`; `apps/portal` skeleton; Turborepo/pnpm wired. | `pnpm build` builds all packages + the portal; personal-site can still import a component. |
| **P1 (MVP)** | Owner creates a client + property + uploads a **VideoTour** manifest; client logs in (magic link) and sees ONLY their tour. | A real second-party can log in and navigate their Prado tour; cross-tenant access fails closed. |
| **P2** | Add **Property-Intelligence report (`<LayerViewer>`)** + **video/gallery** deliverables; owner runs the pipeline to produce them; signed-URL asset gating hardened. | A client sees a real LiDAR/parcel intelligence view + videos, all private. |
| **P3** | Marketing site + **`/contracts`**; owner **package/pricing** management; e-sign release + **COI** storage; migrate the interim personal-site `/admin` in. | Public can read the pitch + grab templates; owner manages the business in-app. |
| **P4** | Self-serve: client **requests/orders** a package; **Stripe** billing; the flight-free **Desktop Property-Intelligence Report** as an orderable national SKU; notifications. | A client can order + pay + receive a deliverable end-to-end. |

## 14. What already exists to build on
- `packages/components` seed: `<VideoTour>` spec + `lib/tour-types.ts` + working prototype (this repo).
- Auth pattern to copy: personal-site next-auth (`lib/auth.ts`, `middleware.ts`) — magic-link is the
  addition for clients.
- Business content ready to move in: the **13-persona package menu + pricing**, **readiness checklist**,
  and **sample contracts** — currently in personal-site branch `drone-admin-backoffice`
  (`lib/admin/dostal-aerial.ts`).
- Pipeline: `bake-property.py`, the Gemini catalog/overlay flow (proven on Prado), AZ/MT terrain.

## 15. Open decisions
**Resolved 2026-08-07:**
- **Repo:** NEW `personal-drone` monorepo + `drone-hub` as a `packages/framework` submodule; fully
  separate from personal-site (like life-site). ✅
- **Routing:** promote drone.mdostal.com to the `apps/portal` app (retire the redirect-to-/drone once
  the portal ships). ✅
- **Interim /admin:** the personal-site `drone-admin-backoffice` branch is a throwaway; owner admin is
  built in `apps/portal`, and its content is ported to `docs/pricing-and-packages.md` here. ✅

**Still open (Mathew — needed to scaffold P0):**
1. **Monorepo tooling:** pnpm + Turborepo (recommended) vs npm workspaces.
2. **Database:** Supabase (bundles auth + DB + storage — recommended for speed) vs Neon + Prisma.
3. **Client auth:** magic-link email (recommended — lowest client friction) vs Google.
