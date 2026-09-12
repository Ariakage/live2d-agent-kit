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
