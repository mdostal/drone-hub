# Horizontal Plan — Real Minecraft schematic export

1. **The writer** — `voxel-geometry.ts` refactor (shared raw-grid-coord +
   band-classification export) + `lib/minecraft-schematic.ts` (Palette
   construction, VarInt-encoded BlockData, NBT/gzip via prismarine-nbt).
   The concentrated technical risk, built and proven first.
2. **API route** — `app/api/minecraft-export/route.ts`, serves the built
   file with correct download headers. Depends on (1).
3. **Test layer** — the hand-verified golden fixture + DataVersion
   cross-reference. Depends on (1) only — parallel to (2).
4. **UI** — download buttons on the showcase + content-engine pages.
   Depends on (2).
5. **Docs closeout** — depends on (3) and (4).

## Cross-layer dependencies

```
writer ──┬──> api route ──> UI ──┐
         └──> test layer ────────┴──> docs-closeout
```
