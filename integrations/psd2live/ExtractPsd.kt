// SPDX-License-Identifier: GPL-3.0-only
// Manifest integration for the pinned GPL-licensed psd2live engine.
package io.github.psd2live.agentkit

import io.github.psd2live.core.PreviewRenderer
import kotlinx.serialization.json.*
import org.umamo.format.psd.PsdReader
import java.nio.file.Files
import java.nio.file.Path
import javax.imageio.ImageIO

/** Lossless extraction utility, also used to validate the manifest route against a repository example. */
fun main(args: Array<String>) {
    require(args.size == 2)
    val input = Path.of(args[0]); val output = Path.of(args[1])
    Files.createDirectories(output)
    val source = PsdReader.read(Files.readAllBytes(input))
    val manifest = buildJsonObject {
        put("name", input.fileName.toString().substringBeforeLast(".").replace(Regex("[^A-Za-z0-9_-]"), "_"))
        put("width", source.widthPx); put("height", source.heightPx)
        putJsonObject("config") { put("mesh_spacing", 64); put("head_strength", 0.5); put("body_strength", 0.6) }
        putJsonArray("layers") {
            source.layers.forEachIndexed { index, layer ->
                if (!layer.visible || layer.raster.width < 1 || layer.raster.height < 1) return@forEachIndexed
                if (layer.raster.rgba.indices.none { it % 4 == 3 && layer.raster.rgba[it] != 0.toByte() }) return@forEachIndexed
                val filename = "layer_%03d.png".format(index)
                ImageIO.write(PreviewRenderer.rasterImage(layer.raster.width, layer.raster.height, layer.raster.rgba),
                    "png", output.resolve(filename).toFile())
                addJsonObject {
                    put("name", layer.name); put("path", filename)
                    put("x", layer.bounds.left); put("y", layer.bounds.top)
                    put("z", -layer.order); put("opacity", layer.opacity)
                }
            }
        }
    }
    Files.writeString(output.resolve("manifest.json"), Json { prettyPrint = true }.encodeToString(manifest))
    println("Extracted PSD manifest: ${output.resolve("manifest.json")}")
}
