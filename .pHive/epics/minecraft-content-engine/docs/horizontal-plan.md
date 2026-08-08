# Horizontal Plan — Minecraft voxelizer + content-engine page

1. **Voxel data prep** — `lib/voxel-types.ts` + an offline script deriving
   `public/minecraft-samples/2806-prado/heightmap.json` from the existing
   sample hillshade COG. Independent.
2. **Content-engine sample data** — `lib/flight-log-types.ts` (scoped to
   this epic's display need only) + `public/content-engine/sample-house/
   {engineering.md,flight-log.json}` (the fallback dataset). Independent of
   (1) — disjoint files, disjoint concern.
3. **Component layer** — `<VoxelTerrain>` + `<VoxelStructure>` (r3f/drei,
   instanced meshes). Depends on (1).
4. **Public showcase page** — `/components/voxel-terrain`. Depends on (3).
5. **Gated content-engine page** — `/properties/[slug]/engine`, per-slug
   lookup with the sample-house fallback + banner. Depends on (3) and (2).
6. **Test layer** — depends on (4) and (5).
7. **Docs closeout** — depends on (6).

## Cross-layer dependencies

```
voxel data prep ──> component layer ──> showcase page ──┐
content-engine sample data ──────────────────────────────┼──> test layer ──> docs-closeout
                                          component layer ─┘
                        (component layer) ──> content-engine page ─┘
```

Voxel data prep and content-engine sample data are mutually independent —
both start immediately in parallel.
