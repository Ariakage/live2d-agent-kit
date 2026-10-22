# Manifest adapter (GPL-3.0-only)

These Kotlin files expose the tested manifest/PSD route as Gradle tasks for the
pinned psd2live engine. They are distributed under GPL-3.0-only; see
[`../../third_party/GPL-3.0.txt`](../../third_party/GPL-3.0.txt).

`ManifestExport.kt` imports positioned PNG layers, optional source polygons,
alpha holes and explicitly configured hidden-region fills, then writes PSD,
CMO3, MOC3, texture pages, physics and diagnostics through psd2live.
`ExtractPsd.kt` extracts visible raster layers and a positioned manifest from a PSD.

The kit changes the historical adapter's green despill default to **off**.
Only enable `green_despill: true` for a deliberately green-screen asset whose
artwork contains no intended green. It is not safe for arbitrary green eyes,
clothes or accessories.

Source-pixel face/eyelid modes require measured coordinates for the new artwork.
The example does not enable the previous character's face recipe.

This adapter still targets commit `5526f2e16b57e5f83d34f33730d6fa26d8bc8695`.
Later character work used 1.3.0 GUI/MCP and CMO authoring, plus 1.4.0 physics
import. See the [version notes](../../docs/psd2live-versions.md); those separate
workflows do not establish compatibility of this adapter or patch with a newer engine.


## Pink Sakura body dynamics

`PinkSakuraDynamics.kt` is an opt-in extension selected by
`config.pink_dynamics`. It uses the existing `RigEditOverlay` / `RigWarpEdit`
API to add nine identity-at-neutral local deformers, thirteen parameters and
five physics groups. It keeps the connected body/sleeve raster, texture layout
and mesh topology. The new upper-arm controls provide restrained sway, not
free elbow or hand gestures.

The measurement JSON must resolve inside the source recipe directory. The
current implementation accepts only the measured `pink-sakura-v1` profile;
[its coordinates](../../examples/pink-sakura/dynamics-regions.json) are not a
universal character template. `ParamWind` drives the physical `ParamWindSway`
output, so verify it over time rather than expecting an immediate static change.

[The example recipe](../../examples/pink-sakura/README.md#复现模板) also includes
`build-performance.cjs`. Run it on a fresh export with a passed native Core
report matching that MOC to generate parameter-only expressions and motions.
This separate step does not change geometry or textures.

`PinkSakuraGestures.kt` adds the optional, measured gesture branch: a continuous
sleeve, matching cuff overlay, four mutually exclusive hand forms and four native
parameters. It changes the source recipe/atlas upstream; the base dynamics
adapter's unchanged-raster flags describe only its own input-to-output operation.
A 17×17 lift/pose grid uses angular interpolation and broad elbow arcs.
Quarter-cell triangle checks are local safeguards, not appearance acceptance.
The web handoff lowers the old pose before changing hand form.

Latest scoped tests, fresh anime inference, and an actual Minimal exporter/Core/Web
regression are recorded in the [gesture review](../../examples/pink-sakura/verification/gestures-20261022/README.md).
