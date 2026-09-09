// ===========================================================================
// ===== 1/3  DELTA LAYERS ===================================================
// ===========================================================================
/*
 * Keeps a texture's layer stack (per-layer image + blend mode + opacity + offset +
 * visibility + order) alive across a save/reload cycle for model formats whose file
 * has no concept of layers - Hytale's .blockymodel above all, but also Minecraft
 * Java/Bedrock and anything else that exports a flat texture.
 *
 * It does that without touching the model file at all: the layer stack is written to
 * a sidecar next to the texture PNG,
 *
 *     Texture.png                     <- the flat texture, unchanged, what the game reads
 *     Texture.layers.json             <- the stack: order, blend modes, opacity, offsets
 *     Texture.layers/                 <- one PNG per layer
 *       base-color_1a2b3c4d.png
 *       grime-overlay_9e8f7a6b.png
 *
 * and read back when the model (or just the texture) is opened again. Anything that
 * only cares about the clean model plus flat texture never sees it.
 *
 * Desktop app only - the whole approach needs real filesystem access.
 */
const DeltaLayersModule = (function () {

