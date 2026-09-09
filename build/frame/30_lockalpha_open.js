// ===========================================================================
// ===== 3/3  UNLEAKY LAYERS =================================================
// ===========================================================================
/*
 * Written by quinten.bench.
 *
 * Blockbench's built-in "Lock Alpha Channel" only looks at the alpha of the layer
 * you are currently painting on. On a fresh (empty) layer above your artwork that
 * means everything is locked and the brush does nothing.
 *
 * This makes Lock Alpha consider the *combined* alpha of every layer in the
 * texture: a pixel is only locked when it is fully transparent on all of them.
 * Anywhere the texture is visible you can paint, even on an empty layer, and the
 * result is clipped to the combined silhouette.
 *
 * Implementation notes
 * --------------------
 * Every paint tool ends up in Painter.edit(texture, callback, options), which resolves
 * the active layer canvas and hands its context to the tool. We wrap that function:
 *
 *   1. Build a "combined alpha" mask for the texture once per stroke, by compositing
 *      all layers the same way Texture#updateLayerChanges does.
 *   2. Turn Painter.lock_alpha off for the duration of the callback, so every tool
 *      paints unrestricted (this covers the per-pixel JS paths *and* the paths that
 *      rely on the 'source-atop' composite operation).
 *   3. Reconcile the result against the mask before it is committed: locked pixels are
 *      restored, and unlocked pixels keep their new colour with the alpha clamped to the
 *      combined alpha.
 *
 * Erasing follows from the same idea. Vanilla freezes alpha outright, which makes the
 * eraser useless on an upper layer even though the artwork underneath still holds the
 * silhouette. Here a second mask tracks the alpha of every layer *except* the active one,
 * and lowering alpha is blocked only where that backdrop is empty - i.e. only where this
 * layer is the sole thing holding the pixel up, which is the case vanilla actually cares
 * about. Erasing on a layer above your artwork just reveals what is beneath it.
 *
 * Step 3 runs on the small region passed to putImageData for brush-like tools, and on
 * the whole layer for the tools that redraw wholesale (fill / shape / gradient).
 */
const UnLeakyLayersModule = (function () {

