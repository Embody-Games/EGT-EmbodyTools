// ===========================================================================
// ===== 2/3  ANCHORED STRETCH ===============================================
// ===========================================================================
/*
 * Blockbench's Stretch tool (enabled by formats with `stretch_cubes`, e.g. the
 * Hytale formats) scales a cube around its own centre, so both faces on the
 * dragged axis move outwards. This makes the Stretch tool behave like the
 * Resize tool instead: the face you pull moves, the opposite face stays where it
 * was.
 *
 * How it works
 * ------------
 * Blockbench renders a cube as
 *
 *     rendered_low  = centre - (half_size + inflate) * stretch
 *     rendered_high = centre + (half_size + inflate) * stretch
 *
 * (see adjustFromAndToForInflateAndStretch in js/outliner/types/cube.js), where
 * centre is derived from from/to. Stretch never touches from/to, which is why
 * the cube grows in both directions.
 *
 * To pin one face we shift from/to (i.e. the centre) by exactly the amount the
 * dragged half grew:
 *
 *     delta = direction * (half_size + inflate) * growth
 *
 * direction is +1 when the positive-axis handle is being dragged and -1 for the
 * negative-axis handle. from/to are in the cube's own local space and so is the
 * drag axis, so no space conversion is needed, and the cube's origin/pivot is
 * left alone.
 *
 * Drag rate
 * ---------
 * All of the growth now lands on one face instead of being split between two,
 * so the same drag would move the dragged face twice as far as it used to. To
 * keep the tool feeling like it always did, the applied stretch is halved:
 *
 *     growth = (stretch_core_applied - stretch_at_drag_start) / 2
 *
 * The result is that the face you drag ends up exactly where the stock centred
 * stretch would have put it, and the opposite face simply doesn't move.
 *
 * Step size
 * ---------
 * Stock Blockbench derives the stretch value from the snapped drag distance:
 * round(point[axis] / grid) * grid * 1/8. With a fine snapping setting (a large
 * ctrl_shift_size, say) that grid is tiny, so stretch becomes effectively
 * continuous: nothing lands on a round value and the only thing controlling how
 * fine it feels is how much model space a mouse pixel covers, i.e. the zoom.
 *
 * So the drag value is replaced outright with a fixed step:
 *
 *     steps = round(drag_distance / UNITS_PER_STEP)   // one unit of drag, one step
 *     value = steps * step_size * direction
 *
 * step_size is the growth per step measured the centred way - the total change
 * in stretch. One-sided mode then applies half of it (the halving above), so a
 * step moves the cube by the same amount whether it is one-sided or centred.
 * That is the factor of two to keep in mind: a step_size of 1/64 shows up as
 * 1/128 in the stretch field, and grows the cube exactly as a 1/64 centred step
 * would have.
 *
 * Defaults follow the format's base scale: 1/64 for hytale_character, 1/32 for
 * hytale_prop. 0.125 reproduces stock Blockbench exactly.
 *
 * Snapping settings deliberately no longer affect the stretch tool, since that
 * coupling is what made it unpredictable. Shift, Ctrl and Ctrl+Shift take the
 * place of that: they cut the step to a half, a quarter and an eighth for fine
 * tuning. There is no precision floor worth worrying about - the Hytale codec
 * writes stretch as a raw float (only rotations get rounded, to 3 places).
 *
 * Everything is recomputed from a snapshot taken at the start of the drag rather
 * than accumulated per mouse move, so the anchored face cannot drift.
 *
 * Scope: single-axis handles only. The two-axis (plane) handles and the uniform
 * handle stay centred, matching how the Resize tool treats those same handles -
 * they have no single side to anchor to.
 *
 *
 * Part two: resizing a cube that already has stretch
 * --------------------------------------------------
 * Resize changes from/to, which changes half_size, which changes the centre -
 * and the rendered faces are measured from that centre with stretch applied. So
 * on a stretched cube, growing the size by d moves the face you are NOT dragging
 * by
 *
 *     (d / 2) * (1 - stretch)
 *
 * i.e. the anchored side creeps outward whenever stretch is above 1, and inward
 * below it. Blockbench applies the resize to from/to without accounting for the
 * stretch multiplier at all.
 *
 * The fix wraps Cube.prototype.resize: measure where the anchored rendered face
 * is, let core do the resize, then shift from/to to put that face back. This
 * covers every path into resize - the gizmo, the size sliders in the element
 * panel, and keyboard nudges. Bidirectional resizes are skipped, because they
 * are centred by definition and have no anchored face.
 *
 * One consequence, unavoidable: size is in unstretched units, so one grid step
 * of resize moves the dragged face by (step * stretch) on screen. Blockbench's
 * integer_size rounding (on for the Hytale formats) would round away any attempt
 * to compensate for that, and stretch values in practice sit near 1, so the
 * difference is small.
 *
 *
 * Part three: vertex snap, stretch mode
 * -------------------------------------
 * The Vertex Snap tool gets a Stretch mode alongside Move and Resize: pick a
 * corner, pick a target, and the cube stretches to reach it with the opposite
 * corner anchored. Core has a scale mode that would do something similar, but it
 * is hidden in the Hytale formats because scaling breaks integer sizes.
 * Stretching leaves size and UVs alone, so it is safe there.
 *
 * It works by wrapping Vertexsnap.snap and taking over only while the Stretch
 * mode is picked and the format allows stretching, and by adding the mode to
 * BarItems.vertex_snap_mode. A stretch that would put the dragged corner behind
 * the anchored one is clamped to MIN_STRETCH rather than going negative and
 * turning the cube inside out.
 */
const AnchoredStretchModule = (function () {

