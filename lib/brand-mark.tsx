// Shared, scalable version of the site's brand glyph — three offset,
// overlapping rounded squares ("stacked toggleable layers," the literal
// core feature CLAUDE.md calls out: "this layer toggle is the killer
// feature"). Every icon asset (favicon, apple touch icon, PWA icons) draws
// from this one function so they're all the same mark at different sizes,
// not independently hand-tuned per file. Proportions are ratios of the
// original 32px design (18px glyph box, 14px squares, 6px outer radius),
// so the mark stays crisp and correctly proportioned at any canvas size —
// naively reusing the same pixel offsets at 512px would look like a tiny
// mark adrift in a mostly-empty square.
export function brandMarkElement(canvasSize: number) {
  const glyph = canvasSize * (18 / 32);
  const square = canvasSize * (14 / 32);
  const squareRadius = canvasSize * (3 / 32);
  const outerRadius = canvasSize * (6 / 32);
  const offsetSmall = canvasSize * (2 / 32);
  const offsetLarge = canvasSize * (4 / 32);
  const offsetXLarge = canvasSize * (8 / 32);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#e8590c",
        borderRadius: outerRadius,
      }}
    >
      <div style={{ position: "relative", width: glyph, height: glyph, display: "flex" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: offsetLarge,
            width: square,
            height: square,
            borderRadius: squareRadius,
            background: "rgba(255,255,255,0.55)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: offsetLarge,
            left: offsetSmall,
            width: square,
            height: square,
            borderRadius: squareRadius,
            background: "rgba(255,255,255,0.75)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: offsetXLarge,
            left: 0,
            width: square,
            height: square,
            borderRadius: squareRadius,
            background: "#ffffff",
          }}
        />
      </div>
    </div>
  );
}
