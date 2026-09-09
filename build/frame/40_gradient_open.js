// ===========================================================================
// ===== 4/4  GRADIENT MAP LAYER =============================================
// ===========================================================================
/*
 * Written by quinten.bench.
 *
 * Colourises a value or luminance map through a saved 256x16 gradient ramp, as a new
 * layer that keeps following the layer it was made from. So the greyscale stays the
 * thing you paint and the colour is a view of it, the way an adjustment layer works.
 *
 * The generated layer re-renders as you paint on its source, live, and the whole thing
 * is previewed on the model while the dialog is open. Cancelling puts the texture back.
 *
 * Gradients live in a library you build up: 256x16 PNG ramps, importable and exportable
 * as PNG or as Photoshop .grd, grouped however you like.
 *
 * Unlike the other three this one has no Blockbench settings. Its library, its groups,
 * its options and its per-layer memory are all in localStorage under
 * gradient_map_layer.*, which means a standalone copy and this one share the same
 * gradients: switching between them loses nothing.
 *
 * Entry points: the Tools menu, the Filter menu, a texture's right-click menu and a
 * layer's right-click menu, all as "Gradient Map Layer...", plus "Repeat Gradient Map".
 */
const GradientMapLayerModule = (function () {
