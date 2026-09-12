// SPDX-License-Identifier: GPL-3.0-only
// Manifest integration for the pinned GPL-licensed psd2live engine.
package io.github.psd2live.agentkit

import io.github.psd2live.core.PSD2LivePipeline
import io.github.psd2live.core.PipelineConfig
import io.github.psd2live.core.PreviewRenderer
import io.github.psd2live.core.ProgressListener
import io.github.psd2live.core.RigEditOverlay
import io.github.psd2live.core.RigParameterEdit
import io.github.psd2live.core.RigPhysicsEdit
import io.github.psd2live.core.RigKeyformSetEdit
import io.github.psd2live.core.RigKeyformGeometryEdit
import io.github.psd2live.core.RigTargetRef
import io.github.psd2live.core.RigTargetKind
import io.github.psd2live.agent.*
import io.github.psd2live.core.Bounds
import io.github.psd2live.core.LayerClassifier
import io.github.psd2live.core.SemanticTag
import io.github.psd2live.core.SourceEyeCorners
import io.github.psd2live.core.SourceEyeCurve
import kotlinx.serialization.json.*
import org.umamo.format.art.*
import java.awt.AlphaComposite
import java.awt.BasicStroke
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.awt.geom.Area
import java.awt.geom.Path2D
import java.awt.geom.PathIterator
import java.awt.geom.Rectangle2D
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.DeflaterOutputStream
import javax.imageio.ImageIO
import kotlin.math.roundToInt

/** Manifest pixels are preserved; transparent margins are cropped without scaling or repainting. */
fun main(args: Array<String>) {
    require(args.size == 2) { "Expected manifest.json and output directory" }
    val manifestPath = Path.of(args[0]).toAbsolutePath().normalize()
    val output = Path.of(args[1]).toAbsolutePath().normalize()
    val manifest = Json.parseToJsonElement(Files.readString(manifestPath)).jsonObject
    val width = manifest.integer("width", manifest.integer("canvas_width", 0))
    val height = manifest.integer("height", manifest.integer("canvas_height", 0))
    require(width in 1..16384 && height in 1..16384) { "Canvas dimensions must be 1..16384" }
    val name = manifest.string("name", "Character").replace(Regex("[^A-Za-z0-9_-]"), "_")
    require(name.isNotBlank())
    val inputLayers = manifest.getValue("layers").jsonArray.map { it.jsonObject }
        .sortedBy { it.number("z", 0.0) }
    require(inputLayers.isNotEmpty()) { "No layers supplied" }
    Files.createDirectories(output)
    val importedDirectory = output.resolve("imported-parts")
    Files.createDirectories(importedDirectory)
    val importDiagnostics = mutableListOf<JsonObject>()
    val layers = inputLayers.mapIndexed { index, layer ->
        val layerName = layer.getValue("name").jsonPrimitive.content
        val relative = Path.of(layer.getValue("path").jsonPrimitive.content)
        val pngPath = (if (relative.isAbsolute) relative else manifestPath.parent.resolve(relative)).normalize()
        val original = ImageIO.read(pngPath.toFile()) ?: error("Cannot decode PNG: $pngPath")
        require(original.width.toLong() * original.height <= 67_108_864) { "Layer too large: $layerName" }
        // Masks preserve selected RGB. Only explicitly requested hidden-hole fills change color.
        val maskedOriginal = if ("source_polygons" in layer || "source_holes" in layer ||
            "source_hole_fill_sample" in layer || "source_hole_fill_gradients" in layer ||
            "source_color_filter" in layer || "source_hole_color_filters" in layer || "source_mask_feather" in layer ||
            "source_hole_fill_image" in layer || "source_hole_expansions" in layer || "source_skin_patch" in layer ||
            "source_alpha_holes" in layer)
            sourceAlphaMask(original, layer, manifestPath.parent) else original
        val crop = layer["crop"]?.jsonArray?.map { it.jsonPrimitive.int }
        require(crop == null || crop.size == 4) { "crop must be [left,top,width,height]" }
        val croppedImage = if (crop == null) maskedOriginal else {
            val (cx, cy, cw, ch) = crop
            require(cx >= 0 && cy >= 0 && cw > 0 && ch > 0 && cx + cw <= original.width && cy + ch <= original.height) {
                "crop is outside input image: $layerName"
            }
            maskedOriginal.getSubimage(cx, cy, cw, ch)
        }
        // Processing seeds refer to the cropped image, before scale/position is applied.
        val background = layer["solid_background"]?.jsonPrimitive?.content
            ?: manifest["solid_background"]?.jsonPrimitive?.content
        val matteProcessed = if (background == null) croppedImage else {
            val baseHints = layer["processing"]?.jsonObject ?: buildJsonObject { put("edge_width", 3) }
            val tolerance = layer.integer("background_tolerance", manifest.integer("background_tolerance", 32))
            val autoSeeds = if (layer.bool("auto_seed_matte", manifest.bool("auto_seed_matte", false)))
                automaticBackgroundSeeds(croppedImage, background, tolerance) else emptyList()
            val hints = if (autoSeeds.isEmpty()) baseHints else JsonObject(baseHints.toMutableMap().also {
                it["background_points"] = JsonArray((baseHints["background_points"]?.jsonArray?.toList() ?: emptyList()) + autoSeeds)
            })
            val matte = processGeneratedMatte(croppedImage, background,
                tolerance, hints)
            importDiagnostics += buildJsonObject {
                put("name", layerName); put("path", pngPath.toString()); put("matte", matte.diagnostics)
                put("automatic_background_seed_count", autoSeeds.size)
            }
            matte.image
        }
        val neutralSpill = layer.bool("neutral_green_despill", manifest.bool("neutral_green_despill", false))
        val processed = if (background.equals("#00FF00", ignoreCase = true) && layer.bool("green_despill", false))
            despillGreenEdges(matteProcessed, neutralSpill = neutralSpill) else matteProcessed
        val scale = layer.number("scale", 1.0)
        require(scale > 0 && scale <= 16)
        val targetWidth = layer.integer("w", (processed.width * scale).roundToInt())
        val targetHeight = layer.integer("h", (processed.height * scale).roundToInt())
        require(targetWidth > 0 && targetHeight > 0 && targetWidth.toLong() * targetHeight <= 67_108_864)
        val scaled = if (processed.width == targetWidth && processed.height == targetHeight) processed else
            BufferedImage(targetWidth, targetHeight, BufferedImage.TYPE_INT_ARGB_PRE).also { resized ->
                val g = resized.createGraphics()
                try {
                    g.composite = AlphaComposite.Src
                    g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC)
                    g.drawImage(processed, 0, 0, targetWidth, targetHeight, null)
                } finally { g.dispose() }
            }
        // Only opt in to green despill when the artwork contains no intended green. Remove residual spill, including opaque
        // generated contamination inside hair and small color fringes introduced during resize.
        val image = if (background.equals("#00FF00", ignoreCase = true) && layer.bool("green_despill", false))
            despillGreenEdges(scaled, edgeOnly = false, neutralSpill = neutralSpill) else scaled
        val x = layer.number("x", 0.0).roundToInt()
        val y = layer.number("y", 0.0).roundToInt()
        val importedName = "%03d_%s.png".format(index, layerName.replace(Regex("[^A-Za-z0-9_-]"), "_"))
        ImageIO.write(image, "png", importedDirectory.resolve(importedName).toFile())
        val rgba = imageToRgba(image)
        var left = image.width; var top = image.height; var right = -1; var bottom = -1
        for (py in 0 until image.height) for (px in 0 until image.width) {
            if ((rgba[(py * image.width + px) * 4 + 3].toInt() and 255) != 0) {
                left = minOf(left, px); right = maxOf(right, px)
                top = minOf(top, py); bottom = maxOf(bottom, py)
            }
        }
        require(right >= left && bottom >= top) { "Layer is entirely transparent: $layerName" }
        val croppedWidth = right - left + 1; val croppedHeight = bottom - top + 1
        val cropped = ByteArray(croppedWidth * croppedHeight * 4)
        for (row in 0 until croppedHeight) {
            val start = ((top + row) * image.width + left) * 4
            rgba.copyInto(cropped, row * croppedWidth * 4, start, start + croppedWidth * 4)
        }
        ManifestLayer(
            id = LayerId("manifest:${index + 1}"), name = layerName,
            order = inputLayers.lastIndex - index,
            bounds = LayerBounds(x + left, y + top, croppedWidth, croppedHeight),
            opacity = layer.number("opacity", 1.0).toFloat().also { require(it in 0f..1f) },
            raster = LayerRaster(croppedWidth, croppedHeight, cropped),
        )
    }
    Files.writeString(output.resolve("$name.import-diagnostics.json"),
        Json { prettyPrint = true }.encodeToString(JsonArray(importDiagnostics)))
    val source = object : SourceArt {
        override val widthPx = width
        override val heightPx = height
        override val layers: List<SourceLayer> = layers
    }
    Files.createDirectories(output)
    val composite = PreviewRenderer.composite(source)
    ImageIO.write(composite, "png", output.resolve("$name.source-preview.png").toFile())
    writePsd(source, composite, output.resolve("$name.source.psd"))
    if (manifest.bool("import_only", false)) {
        println("Imported ${layers.size} layers; source PSD and composite written to $output")
        return
    }
    val configJson = manifest["config"]?.jsonObject ?: JsonObject(emptyMap())
    val faceBoundsOverride = configJson["face_bounds_override"]?.jsonArray?.let { supplied ->
        require(supplied.size == 4) { "face_bounds_override must be [left,top,width,height] in canvas pixels" }
        val (left, top, faceWidth, faceHeight) = supplied.map { it.jsonPrimitive.float }
        require(listOf(left, top, faceWidth, faceHeight).all { it.isFinite() } && faceWidth > 0f && faceHeight > 0f) {
            "face_bounds_override must contain finite coordinates and positive dimensions"
        }
        Bounds(left, top, left + faceWidth, top + faceHeight)
    }
    val independentHair = configJson.bool("independent_hair_physics", false)
    fun eyeCorners(key: String): SourceEyeCorners? = configJson[key]?.jsonArray?.let { supplied ->
        require(supplied.size == 2 && supplied.all { it.jsonArray.size == 2 }) { "$key must be [[leftX,leftY],[rightX,rightY]] in source canvas pixels" }
        val left = supplied[0].jsonArray.map { it.jsonPrimitive.float }
        val right = supplied[1].jsonArray.map { it.jsonPrimitive.float }
        SourceEyeCorners(left[0], left[1], right[0], right[1])
    }
    fun eyeCurve(key: String): SourceEyeCurve? = configJson[key]?.jsonArray?.let { supplied ->
        SourceEyeCurve(supplied.map { point ->
            val pair = point.jsonArray
            require(pair.size == 2) { "$key points must be [x,y] in source canvas pixels" }
            pair[0].jsonPrimitive.float to pair[1].jsonPrimitive.float
        })
    }
    val hairLayers = if (independentHair) layers.filter {
        LayerClassifier.classify(it.name).tag in setOf(SemanticTag.FRONT_HAIR, SemanticTag.BACK_HAIR)
    } else emptyList()
    val hairParents = hairLayers.associate { layer ->
        layer.id.raw to if (LayerClassifier.classify(layer.name).tag == SemanticTag.FRONT_HAIR)
            "DeformHairFrontFollow" else "DeformHairBackFollow"
    }
    val sourceParents = inputLayers.mapIndexedNotNull { index, layer ->
        layer["parent_deformer"]?.jsonPrimitive?.content?.let { parent ->
            require(parent.matches(Regex("Deform[A-Za-z0-9_]+"))) { "parent_deformer must name a generated deformer" }
            layers[index].id.raw to parent
        }
    }.toMap()
    var config = PipelineConfig(
        atlasSize = configJson.integer("atlas_size", 4096),
        texturePadding = configJson.integer("texture_padding", 2),
        textureEdgeExtrusion = configJson.integer("texture_edge_extrusion", 0),
        exportTexturePages = configJson["export_texture_pages"]?.jsonArray?.map {
            val texturePath = Path.of(it.jsonPrimitive.content)
            (if (texturePath.isAbsolute) texturePath else manifestPath.parent.resolve(texturePath)).normalize().toString()
        } ?: emptyList(),
        exportTextureSourceSha256 = configJson["export_texture_source_sha256"]?.jsonArray?.map {
            it.jsonPrimitive.content
        } ?: emptyList(),
        meshSpacing = configJson.integer("mesh_spacing", 40),
        headTurnStrength = configJson.number("head_strength", 0.5).toFloat(),
        initialHeadAngleZOverride = configJson["initial_head_angle_z"]?.jsonPrimitive?.float,
        faceBoundsOverride = faceBoundsOverride,
        preserveSourceRaster = configJson.bool("preserve_source_raster", configJson.bool("source_pixel_head", false)),
        sourcePixelShallowBlink = configJson.bool("source_pixel_shallow_blink", true),
        sourceClosedEyes = configJson.bool("source_closed_eyes", false),
        sourceEyeCornersL = eyeCorners("source_eye_corners_l"),
        sourceEyeCornersR = eyeCorners("source_eye_corners_r"),
        sourceClosedEyeCornersL = eyeCorners("source_closed_eye_corners_l"),
        sourceClosedEyeCornersR = eyeCorners("source_closed_eye_corners_r"),
        sourceContinuousLid = configJson.bool("source_continuous_lid", false),
        sourceOpenEyeCurveL = eyeCurve("source_open_eye_curve_l"),
        sourceOpenEyeCurveR = eyeCurve("source_open_eye_curve_r"),
        sourceEyeClosureDepth = configJson.number("source_eye_closure_depth", 2.0).toFloat(),
        sourceLidOpenThickness = configJson.number("source_lid_open_thickness", 1.0).toFloat(),
        headRollStrength = configJson.number("head_roll_strength", 1.0).toFloat(),
        hairFollowStrength = configJson.number("hair_follow_strength", 1.0).toFloat(),
        independentHairPhysics = independentHair,
        cuteMouthForm = configJson.bool("cute_mouth_form", false),
        bodyStrength = configJson.number("body_strength", 0.6).toFloat(),
        mouthOutlineEnabled = configJson.bool("mouth_outline", true),
        generatePhysics = true, exportMotions = true, exportCmo3 = true, exportMoc3 = true,
        physicsFrontHair = !independentHair,
        physicsBackHair = !independentHair,
        parentOverrides = hairParents + sourceParents,
    )
    require(config.headRollStrength.isFinite() && config.headRollStrength in 0f..1f) { "head_roll_strength must be within 0..1" }
    require(config.sourceEyeClosureDepth.isFinite() && config.sourceEyeClosureDepth in -20f..20f) { "source_eye_closure_depth must be within -20..20 canvas pixels" }
    require(config.sourceLidOpenThickness.isFinite() && config.sourceLidOpenThickness in 0.2f..1f) { "source_lid_open_thickness must be within 0.2..1" }
    require(config.hairFollowStrength.isFinite() && config.hairFollowStrength in 0f..1f) { "hair_follow_strength must be within 0..1" }
    val pipeline = PSD2LivePipeline()
    val tieLayers = layers.filter { it.name.lowercase().startsWith("neckwear") && it.bounds.height > it.bounds.width * 2 }
    val animateTie = configJson.bool("tie_physics", true) && tieLayers.isNotEmpty()
    val unusedSourceParameters = if (config.preserveSourceRaster && layers.none {
            LayerClassifier.classify(it.name).tag == SemanticTag.EYEBROW && it.opacity > 0f
        }) setOf("ParamBrowLY", "ParamBrowRY") else emptySet()
    if (animateTie || hairLayers.isNotEmpty() || unusedSourceParameters.isNotEmpty()) {
        val preview = pipeline.buildPreview(source, config)
        val parameterEdits = mutableListOf<RigParameterEdit>()
        val sets = mutableListOf<RigKeyformSetEdit>()
        val physicsEdits = mutableListOf<RigPhysicsEdit>()
        val tieIds = if (animateTie) tieLayers.map { it.id.raw }.toSet() else emptySet()
        sets += preview.rig.puppet.drawables.filter { preview.rig.layerIdByDrawableId[it.id.raw] in tieIds }.flatMap { drawable ->
            val mesh = requireNotNull(drawable.mesh)
            val xs = mesh.positions.filterIndexed { i, _ -> i % 2 == 0 }
            val ys = mesh.positions.filterIndexed { i, _ -> i % 2 == 1 }
            val top = ys.min(); val span = (ys.max() - top).coerceAtLeast(1e-6f)
            val amplitude = (xs.max() - xs.min()) * configJson.number("tie_swing_strength", 0.35).toFloat()
            listOf(-1f, 0f, 1f).map { swing ->
                val deltas = FloatArray(mesh.positions.size)
                for (i in mesh.positions.indices step 2) {
                    val v = ((mesh.positions[i + 1] - top) / span).coerceIn(0f, 1f)
                    val freeLength = ((v - 0.18f) / 0.82f).coerceAtLeast(0f)
                    deltas[i] = amplitude * swing * freeLength * freeLength
                }
                RigKeyformSetEdit(RigTargetRef(RigTargetKind.ART_MESH, drawable.id.raw),
                    mapOf("ParamTieSwing" to swing), RigKeyformGeometryEdit(positionDeltas = deltas.toList()))
            }
        }
        if (animateTie) {
            parameterEdits += RigParameterEdit("ParamTieSwing", "Tie sway", -1f, 1f, 0f, created = true)
            physicsEdits += RigPhysicsEdit("PhysicsTie", "Tie sway", "ParamBodyAngleZ", "ParamTieSwing",
                length = 11f, mobility = 0.78f, delay = 0.65f, acceleration = 0.95f, outputScale = 1.2f)
        }
        val hairById = hairLayers.associateBy { it.id.raw }
        val usedHairIds = mutableSetOf<String>()
        val swingStrength = configJson.number("hair_swing_strength", 0.10).toFloat()
        require(swingStrength.isFinite() && swingStrength in 0f..0.4f) { "hair_swing_strength must be within 0..0.4" }
        for (drawable in preview.rig.puppet.drawables) {
            val sourceId = preview.rig.layerIdByDrawableId[drawable.id.raw] ?: continue
            // The analyzer may split an unsided bitmap into :l/:r virtual source layers.
            // Each resulting mesh still needs its own pendulum and stable output ID.
            val layer = hairById[sourceId] ?: hairLayers.firstOrNull { sourceId.startsWith(it.id.raw + ":") } ?: continue
            val strandName = layer.name + sourceId.removePrefix(layer.id.raw).replace(':', '-')
            val mesh = requireNotNull(drawable.mesh)
            val xs = mesh.positions.filterIndexed { i, _ -> i % 2 == 0 }
            val ys = mesh.positions.filterIndexed { i, _ -> i % 2 == 1 }
            val top = ys.min(); val span = (ys.max() - top).coerceAtLeast(1e-6f)
            val sourceBounds = requireNotNull(preview.rig.sourceBoundsByDrawableId[drawable.id.raw])
            // Convert a pixel amplitude based on this strand, not the union of every hair layer,
            // to the parent frame's normalized X. A wide fringe must not swing like long side hair.
            val widthRatio = minOf(sourceBounds.width, sourceBounds.height) / sourceBounds.width.coerceAtLeast(1f)
            val amplitude = (xs.max() - xs.min()) * widthRatio * swingStrength
            val baseId = hairParameterId(strandName)
            var parameterId = baseId
            var suffix = 2
            while (!usedHairIds.add(parameterId)) parameterId = baseId + suffix++
            parameterEdits += RigParameterEdit(parameterId, strandName + " sway", -1f, 1f, 0f, created = true)
            sets += listOf(-1f, 0f, 1f).map { swing ->
                val deltas = FloatArray(mesh.positions.size)
                for (i in mesh.positions.indices step 2) {
                    val v = ((mesh.positions[i + 1] - top) / span).coerceIn(0f, 1f)
                    val free = ((v - 0.20f) / 0.80f).coerceAtLeast(0f)
                    deltas[i] = amplitude * swing * free * free * free
                }
                RigKeyformSetEdit(RigTargetRef(RigTargetKind.ART_MESH, drawable.id.raw),
                    mapOf(parameterId to swing), RigKeyformGeometryEdit(positionDeltas = deltas.toList()))
            }
            val strand = strandName.lowercase()
            val longHair = LayerClassifier.classify(layer.name).tag == SemanticTag.BACK_HAIR
            val outer = "outer" in strand
            val sideOffset = if (strand.endsWith("-l")) 0.08f else 0f
            physicsEdits += RigPhysicsEdit("Physics" + parameterId.removePrefix("Param"), strandName + " sway",
                "ParamAngleZ", parameterId,
                length = if (longHair) (if (outer) 15f else 12f) else (if ("bangs" in strand) 6f else 9f),
                mobility = if (longHair) 0.82f else 0.72f,
                delay = (if (longHair) 0.72f else 0.48f) + sideOffset + (if (outer) 0.10f else 0f),
                acceleration = 0.9f, outputScale = if (longHair) 0.85f else 0.7f)
        }
        config = config.copy(rigEdits = RigEditOverlay(
            parameterEdits = parameterEdits,
            deletedParameterIds = unusedSourceParameters + if (independentHair) setOf("ParamHairFront", "ParamHairBack") else emptySet(),
            keyformSetEdits = sets,
            physicsEdits = physicsEdits,
        ))
    }
    println("Exporting $name: ${layers.size} layers, ${width}x$height canvas")
    val result = pipeline.run(source, name, output, config, ProgressListener { stage, fraction ->
        println("%3d%% %s".format((fraction * 100).toInt(), stage))
    })
    val warnings = result.warnings.distinct()
    Files.writeString(output.resolve("$name.export-warnings.txt"), warnings.joinToString("\n", postfix = "\n"))
    result.exportedFiles.forEach { println("WROTE ${it.path} (${it.bytes} bytes)") }
    if (manifest.bool("render_previews", true)) {
        val previewDir = output.resolve("previews")
        Files.createDirectories(previewDir)
        val model = result.previewModel
        val visibleIds = model.rig.layerIdByDrawableId.values.toSet()
        val poses = linkedMapOf(
            "neutral" to emptyMap(),
            "head-left" to mapOf("ParamAngleX" to -30f),
            "head-right" to mapOf("ParamAngleX" to 30f),
            "head-up" to mapOf("ParamAngleY" to 30f),
            "head-down" to mapOf("ParamAngleY" to -30f),
            "blink" to mapOf("ParamEyeLOpen" to 0f, "ParamEyeROpen" to 0f),
            "wink-left" to mapOf("ParamEyeLOpen" to 0f),
            "mouth-open" to mapOf("ParamMouthOpenY" to 1f),
            "gaze-left" to mapOf("ParamEyeBallX" to -1f),
            "gaze-right" to mapOf("ParamEyeBallX" to 1f),
        )
        if (tieLayers.isNotEmpty()) {
            poses["tie-left"] = mapOf("ParamTieSwing" to -1f)
            poses["tie-right"] = mapOf("ParamTieSwing" to 1f)
        }
        for ((pose, parameters) in poses) {
            val view = AgentViewRenderer.modelComposite(model, "manifest-export", parameters,
                visibleIds, emptySet(), AgentViewFrame.CanvasRect(Bounds(0f, 0f, width.toFloat(), height.toFloat())),
                AgentViewBackground.TRANSPARENT, AgentViewOutputSpec(targetLongEdge = 1024))
            Files.write(previewDir.resolve("$pose.png"), view.png)
        }
        println("WROTE ${poses.size} software-rendered parameter preview images")
    }
    println("Export completed: ${result.exportedFiles.size} model files, ${warnings.size} diagnostics")
}

private fun hairParameterId(name: String): String {
    val suffix = name.lowercase().replace(Regex("[^a-z0-9]+"), " ").trim().split(Regex("\\s+"))
        .joinToString("") { it.replaceFirstChar(Char::uppercaseChar) }
    return "Param" + suffix + "Swing"
}

/**
 * Polygon coordinates refer to the full input image, before crop/scale/placement.
 * Hard pixel-centre selection is the default, so complementary cuts can reassemble exactly.
 * Optional 4x4 coverage changes alpha only. Opt-in hidden-region fills interpolate source
 * samples or an explicitly supplied plate inside declared holes. source_skin_patch additionally
 * separates foreground ink from a boundary-matched skin plate. Without those options, RGB is
 * retained byte for byte.
 */
private fun sourceAlphaMask(original: BufferedImage, layer: JsonObject): BufferedImage = sourceAlphaMask(original, layer, null)

private fun sourceAlphaMask(original: BufferedImage, layer: JsonObject, manifestDirectory: Path?): BufferedImage {
    val holeExpansions = layer["source_hole_expansions"]?.jsonArray?.map { it.jsonPrimitive.double }?.also { distances ->
        val holeCount = layer["source_holes"]?.jsonArray?.size
            ?: error("source_hole_expansions requires source_holes")
        require(distances.size == holeCount) { "source_hole_expansions must have one distance per source_holes polygon" }
        require(distances.all { it.isFinite() && it >= 0.0 && (it.toFloat() * 2f).isFinite() }) {
            "source_hole_expansions distances must be finite non-negative source-image pixels"
        }
    }
    fun polygons(key: String, indices: Set<Int>? = null): Area? {
        val supplied = layer[key] ?: return null
        val polygons = supplied.jsonArray
        require(indices == null || indices.all { it in polygons.indices }) { "$key index is outside its polygon array" }
        val result = Area()
        for ((polygonIndex, polygon) in polygons.withIndex()) {
            if (indices != null && polygonIndex !in indices) continue
            val points = polygon.jsonArray
            require(points.size >= 3) { "$key polygon $polygonIndex must contain at least 3 points" }
            val path = Path2D.Double(Path2D.WIND_NON_ZERO)
            for ((pointIndex, point) in points.withIndex()) {
                val pair = point.jsonArray
                require(pair.size == 2) { "$key polygon $polygonIndex point $pointIndex must be [x,y]" }
                val x = pair[0].jsonPrimitive.double
                val y = pair[1].jsonPrimitive.double
                require(x.isFinite() && y.isFinite()) { "$key coordinates must be finite" }
                if (pointIndex == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            path.closePath()
            val polygonArea = Area(path)
            // Expand each selected hole before union, so fills, filters and their indexed
            // subsets agree on ownership. The shared source_holes_expand remains additive.
            val radius = if (key == "source_holes") holeExpansions?.get(polygonIndex)?.toFloat() ?: 0f else 0f
            if (radius > 0f) {
                val stroke = BasicStroke(radius * 2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
                polygonArea.add(Area(stroke.createStrokedShape(polygonArea)))
            }
            result.add(polygonArea)
        }
        return result
    }
    val width = original.width
    val height = original.height
    fun expanded(area: Area?, key: String): Area? {
        val distance = layer.number(key, 0.0).toFloat()
        require(distance.isFinite() && distance >= 0f && (distance * 2f).isFinite()) { "$key must be a finite non-negative pixel distance" }
        if (area != null && distance > 0f) {
            val stroke = BasicStroke(distance * 2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
            area.add(Area(stroke.createStrokedShape(area)))
        }
        return area
    }
    val selected = expanded(polygons("source_polygons"), "source_polygons_expand")
        ?: Area(Rectangle2D.Double(0.0, 0.0, width.toDouble(), height.toDouble()))
    val featherPixels = layer.number("source_mask_feather", 0.0)
    require(featherPixels.isFinite() && featherPixels >= 0.0) { "source_mask_feather must be a finite non-negative original-image pixel distance" }
    val fadeY = layer["source_alpha_fade_y"]?.jsonArray?.map { it.jsonPrimitive.double }?.also {
        require(it.size == 2 && it.all { n -> n.isFinite() } && it[1] > it[0]) { "source_alpha_fade_y requires finite [opaqueY, transparentY] in source coordinates" }
    }
    // Keep the polygon boundary before hole subtraction: feather only the source selection's
    // inward edge, never enlarge it or blur sampled RGB into its transparent surroundings.
    data class FeatherEdge(val x1: Double, val y1: Double, val x2: Double, val y2: Double) {
        fun distanceSquared(x: Double, y: Double): Double {
            val dx = x2 - x1; val dy = y2 - y1
            val lengthSquared = dx * dx + dy * dy
            val t = if (lengthSquared == 0.0) 0.0 else (((x - x1) * dx + (y - y1) * dy) / lengthSquared).coerceIn(0.0, 1.0)
            val px = x - (x1 + t * dx); val py = y - (y1 + t * dy)
            return px * px + py * py
        }
    }
    val featherEdges = mutableListOf<FeatherEdge>()
    if (featherPixels > 0.0) {
        val iterator = selected.getPathIterator(null, 0.25)
        val coordinates = DoubleArray(6)
        var startX = 0.0; var startY = 0.0; var previousX = 0.0; var previousY = 0.0
        while (!iterator.isDone) {
            when (iterator.currentSegment(coordinates)) {
                PathIterator.SEG_MOVETO -> { startX = coordinates[0]; startY = coordinates[1]; previousX = startX; previousY = startY }
                PathIterator.SEG_LINETO -> {
                    featherEdges += FeatherEdge(previousX, previousY, coordinates[0], coordinates[1])
                    previousX = coordinates[0]; previousY = coordinates[1]
                }
                PathIterator.SEG_CLOSE -> featherEdges += FeatherEdge(previousX, previousY, startX, startY)
            }
            iterator.next()
        }
    }
    fun inwardFeather(x: Double, y: Double): Double {
        val squared = featherEdges.minOfOrNull { it.distanceSquared(x, y) } ?: return 1.0
        return (kotlin.math.sqrt(squared) / featherPixels).coerceIn(0.0, 1.0)
    }
    val holes = expanded(polygons("source_holes"), "source_holes_expand")
    data class SourceColorFilter(val darkMax: Int, val warmMinRedGreen: Int, val warmMaxGreen: Int,
        val coolMinBlue: Int? = null, val coolMaxRedBlue: Int = 4, val coolMaxGreenBlue: Int = 6) {
        fun accepts(rgba: Int): Boolean {
            val red = (rgba ushr 16) and 0xff
            val green = (rgba ushr 8) and 0xff
            val blue = rgba and 0xff
            if (coolMinBlue != null) return blue >= coolMinBlue && red - blue <= coolMaxRedBlue && green - blue <= coolMaxGreenBlue
            return maxOf(red, green, blue) <= darkMax ||
                (red - green >= warmMinRedGreen && green <= warmMaxGreen)
        }
    }
    fun colorFilter(value: JsonObject): SourceColorFilter {
        if ("cool_min_blue" in value) {
            val blue = value.integer("cool_min_blue", 120)
            val redBias = value.integer("cool_max_red_blue", 4)
            val greenBias = value.integer("cool_max_green_blue", 6)
            require(blue in 0..255 && redBias in -255..255 && greenBias in -255..255) { "Cool-color thresholds are outside channel ranges" }
            return SourceColorFilter(0, 255, 0, blue, redBias, greenBias)
        }
        val dark = value.getValue("dark_max").jsonPrimitive.int
        val warm = value.getValue("warm_min_red_green").jsonPrimitive.int
        val green = value.getValue("warm_max_green").jsonPrimitive.int
        require(dark in 0..255 && warm in -255..255 && green in 0..255) { "source color filter thresholds are outside the RGBA channel range" }
        return SourceColorFilter(dark, warm, green)
    }
    val selectedColorFilter = layer["source_color_filter"]?.jsonObject?.let(::colorFilter)
    val holeColorFilters = mutableMapOf<Int, SourceColorFilter>()
    layer["source_hole_color_filters"]?.jsonArray?.forEachIndexed { index, entry ->
        require(holes != null) { "source_hole_color_filters requires source_holes" }
        val item = entry.jsonObject
        val indices = item.getValue("hole_indices").jsonArray.map { it.jsonPrimitive.int }.toSet()
        require(indices.isNotEmpty()) { "source_hole_color_filters[$index].hole_indices must not be empty" }
        require(indices.all { it in layer.getValue("source_holes").jsonArray.indices }) { "source_hole_color_filters[$index] contains an invalid hole index" }
        val filter = colorFilter(item.getValue("filter").jsonObject)
        indices.forEach { holeColorFilters[it] = filter }
    }
    val filteredHoleRegions = holeColorFilters.entries.groupBy { it.value }.map { (filter, entries) ->
        expanded(polygons("source_holes", entries.map { it.key }.toSet()), "source_holes_expand")!! to filter
    }
    val unfilteredHoleRegion = if (holeColorFilters.isEmpty()) holes else expanded(
        polygons("source_holes", layer.getValue("source_holes").jsonArray.indices.toSet() - holeColorFilters.keys),
        "source_holes_expand")
    fun inHole(x: Double, y: Double, sourceRgba: Int): Boolean =
        unfilteredHoleRegion?.contains(x, y) == true ||
            filteredHoleRegions.any { (region, filter) -> region.contains(x, y) && filter.accepts(sourceRgba) }
    fun sourcePixel(sample: JsonArray, label: String): Int {
        require(sample.size == 2) { "$label must be an original-image pixel [x,y]" }
        val coords = sample.map { it.jsonPrimitive.double }
        require(coords.all { it.isFinite() && it == kotlin.math.floor(it) }) { "$label coordinates must be integers" }
        val sx = coords[0].toInt(); val sy = coords[1].toInt()
        require(sx in 0 until width && sy in 0 until height) { "$label lies outside the original image" }
        return original.getRGB(sx, sy)
    }
    val fillPixel = layer["source_hole_fill_sample"]?.jsonArray?.let { sample ->
        require(holes != null) { "source_hole_fill_sample requires source_holes" }
        sourcePixel(sample, "source_hole_fill_sample")
    }
    // A moving feature must not carry an opaque rectangle of its surrounding skin.
    // Use the same boundary-matched clean plate for the hidden base and for
    // extracting the original antialiased ink as a separate RGBA foreground.
    data class SkinPatch(val mode: String, val left: Int, val top: Int, val right: Int, val bottom: Int,
        val region: Area?, val contrastFloor: Double) {
        fun rgb(x: Int, y: Int): Int {
            val px = x.coerceIn(left, right); val py = y.coerceIn(top, bottom)
            val u = (px - left).toDouble() / (right - left)
            val v = (py - top).toDouble() / (bottom - top)
            val samples = intArrayOf(original.getRGB(px, top), original.getRGB(px, bottom),
                original.getRGB(left, py), original.getRGB(right, py), original.getRGB(left, top),
                original.getRGB(right, top), original.getRGB(left, bottom), original.getRGB(right, bottom))
            var rgb = 0xff000000.toInt()
            for (shift in intArrayOf(16, 8, 0)) {
                val c = samples.map { ((it ushr shift) and 255).toDouble() }
                val corners = (c[4]*(1-u)+c[5]*u)*(1-v)+(c[6]*(1-u)+c[7]*u)*v
                val value = (c[0]*(1-v)+c[1]*v+c[2]*(1-u)+c[3]*u-corners).roundToInt().coerceIn(0,255)
                rgb = rgb or (value shl shift)
            }
            return rgb
        }
        val pigment: Int by lazy {
            (top..bottom).flatMap { y -> (left..right).map { x -> original.getRGB(x,y) } }
                .minBy { color -> ((color ushr 8) and 255)*2 + (color and 255) }
        }
        fun foreground(x: Int, y: Int, color: Int): Int {
            if (x !in left..right || y !in top..bottom) return color and 0x00ffffff
            val background = rgb(x,y)
            var opacity = 0.0; var contrast = 0.0
            for (shift in intArrayOf(16,8,0)) {
                val b = ((background ushr shift) and 255).toDouble()
                val c = ((color ushr shift) and 255).toDouble()
                val f = ((pigment ushr shift) and 255).toDouble()
                contrast = maxOf(contrast, kotlin.math.abs(b-c))
                if (b > c) opacity = maxOf(opacity, (b-c)/maxOf(b-f,1.0), (b-c)/maxOf(b,1.0))
                else opacity = maxOf(opacity, (c-b)/maxOf(255.0-b,1.0))
            }
            if (contrast <= contrastFloor) return color and 0x00ffffff
            val alpha = kotlin.math.ceil(opacity.coerceIn(0.0,1.0)*255.0).toInt().coerceIn(1,255)
            val a = alpha/255.0
            var result = (((color ushr 24)*alpha+127)/255) shl 24
            for (shift in intArrayOf(16,8,0)) {
                val b = ((background ushr shift) and 255).toDouble()
                val c = ((color ushr shift) and 255).toDouble()
                result = result or (((c-b*(1-a))/a).roundToInt().coerceIn(0,255) shl shift)
            }
            return result
        }
    }
    val skinPatch = layer["source_skin_patch"]?.jsonObject?.let { item ->
        val mode = item.string("mode", "")
        require(mode in setOf("base", "feature")) { "source_skin_patch.mode must be base or feature" }
        val rect = item.getValue("rect").jsonArray.map { it.jsonPrimitive.int }
        require(rect.size == 4 && rect[2] > 1 && rect[3] > 1 && rect[0] >= 0 && rect[1] >= 0 &&
            rect[0]+rect[2] < width && rect[1]+rect[3] < height) { "source_skin_patch.rect must include valid boundary pixels" }
        val floor = item.number("contrast_floor", 2.0)
        require(floor.isFinite() && floor in 0.0..10.0) { "source_skin_patch.contrast_floor must be 0..10" }
        val region = if (mode == "base") {
            val indices = item.getValue("hole_indices").jsonArray.map { it.jsonPrimitive.int }.toSet()
            require(indices.isNotEmpty() && indices.all { it in layer.getValue("source_holes").jsonArray.indices })
            expanded(polygons("source_holes",indices),"source_holes_expand")
        } else null
        SkinPatch(mode,rect[0],rect[1],rect[0]+rect[2],rect[1]+rect[3],region,floor)
    }
    data class HoleGradient(val region: Area, val corners: IntArray) {
        val bounds = region.bounds2D
        fun rgba(x: Double, y: Double): Int {
            val u = ((x - bounds.minX) / bounds.width).coerceIn(0.0, 1.0)
            val v = ((y - bounds.minY) / bounds.height).coerceIn(0.0, 1.0)
            var result = 0
            for (shift in intArrayOf(24, 16, 8, 0)) {
                fun channel(corner: Int) = ((corners[corner] ushr shift) and 0xff).toDouble()
                val top = channel(0) * (1.0 - u) + channel(1) * u
                val bottom = channel(2) * (1.0 - u) + channel(3) * u
                val value = (top * (1.0 - v) + bottom * v + 0.5).toInt().coerceIn(0, 255)
                result = result or (value shl shift)
            }
            return result
        }
    }
    val gradients = layer["source_hole_fill_gradients"]?.jsonArray?.mapIndexed { index, entry ->
        require(holes != null) { "source_hole_fill_gradients requires source_holes" }
        val item = entry.jsonObject
        val indices = item.getValue("hole_indices").jsonArray.map { it.jsonPrimitive.int }.toSet()
        require(indices.isNotEmpty()) { "source_hole_fill_gradients[$index].hole_indices must not be empty" }
        val region = expanded(polygons("source_holes", indices), "source_holes_expand")!!
        require(!region.isEmpty && region.bounds2D.width > 0.0 && region.bounds2D.height > 0.0) {
            "source_hole_fill_gradients[$index] must select a nonempty hole region"
        }
        val corners = listOf("top_left", "top_right", "bottom_left", "bottom_right").map { corner ->
            sourcePixel(item.getValue(corner).jsonArray, "source_hole_fill_gradients[$index].$corner")
        }.toIntArray()
        HoleGradient(region, corners)
    } ?: emptyList()
    data class HoleFillImage(val image: BufferedImage, val region: Area, val sourceRect: Rectangle2D.Double,
        val canvasRect: Rectangle2D.Double, val cropLeft: Double, val cropTop: Double,
        val canvasLeft: Double, val canvasTop: Double, val scaleX: Double, val scaleY: Double,
        val feather: Double, val edges: List<FeatherEdge>, val despillGreen: Boolean) {
        fun weight(x: Double, y: Double): Double = if (feather <= 0.0) 1.0 else
            (kotlin.math.sqrt(edges.minOfOrNull { it.distanceSquared(x, y) } ?: 0.0) / feather).coerceIn(0.0, 1.0)
        fun rgb(x: Double, y: Double): Int {
            val canvasX = canvasLeft + (x - cropLeft) * scaleX
            val canvasY = canvasTop + (y - cropTop) * scaleY
            val sx = (sourceRect.x + (canvasX - canvasRect.x) / canvasRect.width * sourceRect.width - 0.5)
                .coerceIn(sourceRect.x, sourceRect.maxX - 1.0)
            val sy = (sourceRect.y + (canvasY - canvasRect.y) / canvasRect.height * sourceRect.height - 0.5)
                .coerceIn(sourceRect.y, sourceRect.maxY - 1.0)
            val x0 = kotlin.math.floor(sx).toInt().coerceIn(0, image.width - 1)
            val y0 = kotlin.math.floor(sy).toInt().coerceIn(0, image.height - 1)
            val x1 = (x0 + 1).coerceAtMost(image.width - 1)
            val y1 = (y0 + 1).coerceAtMost(image.height - 1)
            val u = sx - x0; val v = sy - y0
            val samples = intArrayOf(image.getRGB(x0, y0), image.getRGB(x1, y0), image.getRGB(x0, y1), image.getRGB(x1, y1))
            var result = 0
            for (shift in intArrayOf(16, 8, 0)) {
                fun channel(index: Int) = ((samples[index] ushr shift) and 0xff).toDouble()
                val top = channel(0) * (1.0 - u) + channel(1) * u
                val bottom = channel(2) * (1.0 - u) + channel(3) * u
                result = result or ((top * (1.0 - v) + bottom * v + 0.5).toInt().coerceIn(0, 255) shl shift)
            }
            if (despillGreen) {
                val r = (result ushr 16) and 255; val g = (result ushr 8) and 255; val b = result and 255
                if (g - maxOf(r, b) >= 30) {
                    // Extend nearby painted clothing texels across residual chroma-key pinholes.
                    // Only the explicitly selected hidden patch samples can enter this path.
                    var best: Int? = null
                    var bestDistance = Int.MAX_VALUE
                    for (dy in -12..12) for (dx in -12..12) {
                        val px = x0 + dx; val py = y0 + dy
                        if (px !in 0 until image.width || py !in 0 until image.height) continue
                        val p = image.getRGB(px, py)
                        val pr = (p ushr 16) and 255; val pg = (p ushr 8) and 255; val pb = p and 255
                        val distance = dx * dx + dy * dy
                        if ((p ushr 24) != 0 && maxOf(pr, pg, pb) < 200 && pg - maxOf(pr, pb) < 20 && distance < bestDistance) {
                            best = p and 0xffffff; bestDistance = distance
                        }
                    }
                    if (best != null) return best
                }
            }
            return result
        }
    }
    val fillImage = layer["source_hole_fill_image"]?.jsonObject?.let { item ->
        require(holes != null) { "source_hole_fill_image requires source_holes" }
        val indices = item.getValue("hole_indices").jsonArray.map { it.jsonPrimitive.int }.toSet()
        require(indices.isNotEmpty()) { "source_hole_fill_image.hole_indices must not be empty" }
        val region = expanded(polygons("source_holes", indices), "source_holes_expand")!!
        val path = Path.of(item.getValue("path").jsonPrimitive.content)
        require(path.isAbsolute || manifestDirectory != null) { "Relative source_hole_fill_image.path requires the manifest directory" }
        val resolved = (if (path.isAbsolute) path else manifestDirectory!!.resolve(path)).normalize()
        require(Files.isRegularFile(resolved)) { "source_hole_fill_image does not exist: $resolved" }
        val image = ImageIO.read(resolved.toFile()) ?: error("Cannot decode source_hole_fill_image: $resolved")
        require(image.width.toLong() * image.height <= 67_108_864) { "source_hole_fill_image is too large" }
        fun rectangle(key: String): Rectangle2D.Double {
            val values = item.getValue(key).jsonArray.map { it.jsonPrimitive.double }
            require(values.size == 4 && values.all { it.isFinite() } && values[2] > 0.0 && values[3] > 0.0) {
                "source_hole_fill_image.$key must be finite [left,top,width,height] with positive dimensions"
            }
            return Rectangle2D.Double(values[0], values[1], values[2], values[3])
        }
        val sourceRect = rectangle("source_rect")
        require(sourceRect.x >= 0.0 && sourceRect.y >= 0.0 && sourceRect.width >= 1.0 && sourceRect.height >= 1.0 &&
            sourceRect.maxX <= image.width && sourceRect.maxY <= image.height) { "source_hole_fill_image.source_rect is outside its image" }
        val canvasRect = rectangle("canvas_rect")
        val crop = layer["crop"]?.jsonArray?.map { it.jsonPrimitive.int } ?: listOf(0, 0, width, height)
        require(crop.size == 4 && crop[2] > 0 && crop[3] > 0) { "Layer crop is invalid for source_hole_fill_image mapping" }
        val scale = layer.number("scale", 1.0)
        val targetWidth = layer.integer("w", (crop[2] * scale).roundToInt())
        val targetHeight = layer.integer("h", (crop[3] * scale).roundToInt())
        require(targetWidth > 0 && targetHeight > 0) { "Layer size is invalid for source_hole_fill_image mapping" }
        val scaleX = targetWidth.toDouble() / crop[2]; val scaleY = targetHeight.toDouble() / crop[3]
        val canvasLeft = layer.number("x", 0.0).roundToInt().toDouble()
        val canvasTop = layer.number("y", 0.0).roundToInt().toDouble()
        // Clip the image override's ownership to its stated canvas footprint. Any uncovered
        // portion of a hole continues to use the established sample/gradient/transparent path.
        region.intersect(Area(Rectangle2D.Double(crop[0] + (canvasRect.x - canvasLeft) / scaleX,
            crop[1] + (canvasRect.y - canvasTop) / scaleY, canvasRect.width / scaleX, canvasRect.height / scaleY)))
        val feather = item.number("feather_px", 0.0)
        require(feather.isFinite() && feather >= 0.0) { "source_hole_fill_image.feather_px must be non-negative" }
        val edges = mutableListOf<FeatherEdge>()
        if (feather > 0.0) {
            val iterator = region.getPathIterator(null, 0.15)
            val coords = DoubleArray(6)
            var startX = 0.0; var startY = 0.0; var lastX = 0.0; var lastY = 0.0
            while (!iterator.isDone) {
                when (iterator.currentSegment(coords)) {
                    PathIterator.SEG_MOVETO -> { startX = coords[0]; startY = coords[1]; lastX = startX; lastY = startY }
                    PathIterator.SEG_LINETO -> { edges += FeatherEdge(lastX, lastY, coords[0], coords[1]); lastX = coords[0]; lastY = coords[1] }
                    PathIterator.SEG_CLOSE -> edges += FeatherEdge(lastX, lastY, startX, startY)
                }
                iterator.next()
            }
        }
        HoleFillImage(image, region, sourceRect, canvasRect, crop[0].toDouble(), crop[1].toDouble(),
            canvasLeft, canvasTop, scaleX, scaleY, feather, edges, item.bool("despill_green", false))
    }
    if (fillPixel == null && holeColorFilters.isEmpty()) holes?.let { holeRegion ->
        // A gradients-only layer keeps unassigned holes transparent, matching the old no-fill path.
        val unfilled = Area(holeRegion)
        gradients.forEach { unfilled.subtract(it.region) }
        fillImage?.let { unfilled.subtract(it.region) }
        skinPatch?.region?.let { unfilled.subtract(it) }
        selected.subtract(unfilled)
    }
    // Background gaps are always transparent, independent of skin/hair hidden-hole fills.
    // These exclusions do not grow or repaint source RGB and share the existing AA sampling.
    polygons("source_alpha_holes")?.let { selected.subtract(it) }
    selected.intersect(Area(Rectangle2D.Double(0.0, 0.0, width.toDouble(), height.toDouble())))
    val bounds = selected.bounds2D
    val samplesPerAxis = if (layer.bool("source_mask_antialias", false)) 4 else 1
    val sampleCount = samplesPerAxis * samplesPerAxis
    val pixels = original.getRGB(0, 0, width, height, null, 0, width)
    for (y in 0 until height) for (x in 0 until width) {
        val index = y * width + x
        val sourceRgba = pixels[index]
        val colorSelected = selectedColorFilter?.accepts(sourceRgba) ?: true
        // This is explicitly requested hidden modeling data, not a recolor of visible source art.
        // Hole ownership uses the pixel centre; optional antialiasing still only affects outer alpha.
        if ((fillPixel != null || gradients.isNotEmpty() || fillImage != null || skinPatch?.mode == "base") && colorSelected && selected.contains(x + 0.5, y + 0.5) && inHole(x + 0.5, y + 0.5, sourceRgba)) {
            val gradient = gradients.lastOrNull { it.region.contains(x + 0.5, y + 0.5) }
            pixels[index] = gradient?.rgba(x + 0.5, y + 0.5) ?: fillPixel ?: pixels[index]
            if (skinPatch?.mode == "base" && skinPatch.region?.contains(x+0.5,y+0.5) == true) {
                pixels[index] = (pixels[index] and 0xff000000.toInt()) or (skinPatch.rgb(x,y) and 0x00ffffff)
            }
            if (fillImage?.region?.contains(x + 0.5, y + 0.5) == true) {
                // The external clean plate supplies hidden RGB only; retain original alpha.
                val fillRgb = fillImage.rgb(x + 0.5, y + 0.5)
                val weight = fillImage.weight(x + 0.5, y + 0.5)
                var blended = sourceRgba and 0xff000000.toInt()
                for (shift in intArrayOf(16, 8, 0)) {
                    val a = (sourceRgba ushr shift) and 255; val b = (fillRgb ushr shift) and 255
                    blended = blended or ((a * (1.0 - weight) + b * weight + 0.5).toInt().coerceIn(0, 255) shl shift)
                }
                pixels[index] = blended
            }
        }
        if (skinPatch?.mode == "feature") pixels[index] = skinPatch.foreground(x,y,pixels[index])
        val originalAlpha = pixels[index] ushr 24
        var covered = 0
        var featherCoverage = 0.0
        if (originalAlpha != 0 && colorSelected && bounds.intersects(x.toDouble(), y.toDouble(), 1.0, 1.0)) {
            for (sy in 0 until samplesPerAxis) for (sx in 0 until samplesPerAxis) {
                val px = x + (sx + 0.5) / samplesPerAxis
                val py = y + (sy + 0.5) / samplesPerAxis
                // An unfiltered overlapping hole still owns its pixels. A color-rejected lash
                // hole leaves the original light hair/skin in the base instead of moving it.
                val removedByFilteredHole = holeColorFilters.isNotEmpty() && fillPixel == null &&
                    inHole(px, py, sourceRgba) && gradients.none { it.region.contains(px, py) } &&
                    fillImage?.region?.contains(px, py) != true
                if (selected.contains(px, py) && !removedByFilteredHole) {
                    covered++
                    if (featherPixels > 0.0) featherCoverage += inwardFeather(px, py)
                }
            }
        }
        val maskedAlpha = if (featherPixels > 0.0) (originalAlpha * featherCoverage / sampleCount + 0.5).toInt().coerceIn(0, 255)
            else (originalAlpha * covered + sampleCount / 2) / sampleCount
        val alpha = if (fadeY == null) maskedAlpha else
            (maskedAlpha * ((fadeY[1] - (y + 0.5)) / (fadeY[1] - fadeY[0])).coerceIn(0.0, 1.0) + 0.5).toInt()
        pixels[index] = (pixels[index] and 0x00ffffff) or (alpha shl 24)
    }
    return BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB).also {
        it.setRGB(0, 0, width, height, pixels, 0, width)
    }
}

private data class ManifestLayer(
    override val id: LayerId, override val name: String, override val order: Int,
    override val bounds: LayerBounds, override val opacity: Float, override val raster: LayerRaster,
) : SourceLayer {
    override val groupPath = ""
    override val clipped = false
    override val blend = LayerBlend.Normal
}

private fun JsonObject.string(key: String, default: String) = this[key]?.jsonPrimitive?.content ?: default
private fun JsonObject.integer(key: String, default: Int) = this[key]?.jsonPrimitive?.int ?: default
private fun JsonObject.number(key: String, default: Double) = this[key]?.jsonPrimitive?.double ?: default
private fun JsonObject.bool(key: String, default: Boolean) = this[key]?.jsonPrimitive?.boolean ?: default

private fun imageToRgba(image: BufferedImage): ByteArray {
    val pixels = image.getRGB(0, 0, image.width, image.height, null, 0, image.width)
    return ByteArray(pixels.size * 4).also { bytes -> pixels.forEachIndexed { i, p ->
        bytes[i * 4] = (p ushr 16).toByte(); bytes[i * 4 + 1] = (p ushr 8).toByte()
        bytes[i * 4 + 2] = p.toByte(); bytes[i * 4 + 3] = (p ushr 24).toByte()
    } }
}

/** One actual interior pixel from every declared-matte component, including enclosed holes. */
private fun automaticBackgroundSeeds(image: BufferedImage, hex: String, tolerance: Int): List<JsonObject> {
    val w = image.width; val h = image.height; val bg = hex.removePrefix("#").toInt(16)
    val pixels = image.getRGB(0, 0, w, h, null, 0, w)
    val matches = BooleanArray(pixels.size) { i ->
        val p = pixels[i]
        (p ushr 24) > 0 && maxOf(kotlin.math.abs((p shr 16 and 255) - (bg shr 16 and 255)),
            kotlin.math.abs((p shr 8 and 255) - (bg shr 8 and 255)),
            kotlin.math.abs((p and 255) - (bg and 255))) <= tolerance
    }
    val visited = BooleanArray(pixels.size); val queue = IntArray(pixels.size)
    return buildList {
        for (start in pixels.indices) {
            if (!matches[start] || visited[start]) continue
            var head = 0; var tail = 0; var sumX = 0L; var sumY = 0L
            queue[tail++] = start; visited[start] = true
            while (head < tail) {
                val i = queue[head++]; sumX += i % w; sumY += i / w
                fun visit(j: Int) { if (matches[j] && !visited[j]) { visited[j] = true; queue[tail++] = j } }
                if (i % w > 0) visit(i - 1); if (i % w + 1 < w) visit(i + 1)
                if (i >= w) visit(i - w); if (i + w < pixels.size) visit(i + w)
            }
            val centerX = sumX.toDouble() / tail; val centerY = sumY.toDouble() / tail
            var seed = start; var nearest = Double.POSITIVE_INFINITY
            for (n in 0 until tail) {
                val i = queue[n]; val dx = i % w - centerX; val dy = i / w - centerY
                val distance = dx * dx + dy * dy
                if (distance < nearest) { nearest = distance; seed = i }
            }
            add(buildJsonObject { put("x", seed % w); put("y", seed / w) })
        }
    }
}

/** Chroma unmixing; the first pass is edge-only, the explicit no-green-art pass covers residual spill. */
private fun despillGreenEdges(image: BufferedImage, edgeOnly: Boolean = true, neutralSpill: Boolean = false): BufferedImage {
    val w = image.width; val h = image.height
    val pixels = image.getRGB(0, 0, w, h, null, 0, w)
    val distance = IntArray(pixels.size) { Int.MAX_VALUE }
    val queue = IntArray(pixels.size)
    var head = 0; var tail = 0
    for (i in pixels.indices) if ((pixels[i] ushr 24) < 16) {
        distance[i] = 0; queue[tail++] = i
    }
    while (head < tail) {
        val i = queue[head++]
        if (distance[i] >= 8) continue
        fun visit(j: Int) { if (distance[j] == Int.MAX_VALUE) {
            distance[j] = distance[i] + 1; queue[tail++] = j
        } }
        if (i % w > 0) visit(i - 1); if (i % w + 1 < w) visit(i + 1)
        if (i >= w) visit(i - w); if (i + w < pixels.size) visit(i + w)
    }
    for (i in pixels.indices) {
        val p = pixels[i]; val alpha = p ushr 24
        if (alpha == 0) { pixels[i] = 0; continue }
        if (edgeOnly && distance[i] > 8) continue
        val r = p shr 16 and 255; val g = p shr 8 and 255; val b = p and 255
        val neutralGreen = if (neutralSpill) (r + b) / 2 else maxOf(r, b)
        val excess = g - neutralGreen
        if (excess <= 6) continue
        // C = coverage * foreground + (1 - coverage) * pure green.
        val coverage = (1.0 - excess / 255.0).coerceIn(0.0, 1.0)
        val newAlpha = (alpha * coverage).roundToInt()
        if (newAlpha < 2 || coverage < 0.02) { pixels[i] = 0; continue }
        val newR = (r / coverage).roundToInt().coerceIn(0, 255)
        val newB = (b / coverage).roundToInt().coerceIn(0, 255)
        val newG = ((g - excess) / coverage).roundToInt().coerceIn(0, 255)
        pixels[i] = (newAlpha shl 24) or (newR shl 16) or (newG shl 8) or newB
    }
    return BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB).also { it.setRGB(0, 0, w, h, pixels, 0, w) }
}

/** Photoshop PSD v1, RGB 8-bit, cropped layers, ZIP channels, raw merged RGBA image. */
private fun writePsd(source: SourceArt, composite: BufferedImage, path: Path) {
    fun block(write: DataOutputStream.() -> Unit): ByteArray = ByteArrayOutputStream().also {
        DataOutputStream(it).use(write)
    }.toByteArray()
    fun zipped(bytes: ByteArray) = ByteArrayOutputStream().also {
        DeflaterOutputStream(it).use { zip -> zip.write(bytes) }
    }.toByteArray()
    // PSD records use painter's order, the same order expected by this project's PSD reader.
    val layers = source.layers
    val allChannels = layers.map { layer -> (0..3).map { channel ->
        block { writeShort(2); write(zipped(ByteArray(layer.raster.width * layer.raster.height) {
            layer.raster.rgba[it * 4 + channel]
        })) }
    } }
    val records = block {
        writeShort(-layers.size) // Merged image contains an alpha channel.
        layers.forEachIndexed { index, layer ->
            val b = layer.bounds
            writeInt(b.top); writeInt(b.left); writeInt(b.top + b.height); writeInt(b.left + b.width)
            writeShort(4)
            allChannels[index].forEachIndexed { channel, bytes ->
                writeShort(if (channel == 3) -1 else channel); writeInt(bytes.size)
            }
            writeBytes("8BIMnorm"); writeByte((layer.opacity * 255).toInt()); writeByte(0)
            writeByte(0); writeByte(0)
            val extra = block {
                writeInt(0); writeInt(0)
                val name = layer.name.toByteArray(Charsets.UTF_8).take(255).toByteArray()
                writeByte(name.size); write(name)
                repeat((4 - (name.size + 1) % 4) % 4) { writeByte(0) }
                writeBytes("8BIMlyid"); writeInt(4); writeInt(index + 1)
                val unicode = layer.name.toByteArray(Charsets.UTF_16BE)
                writeBytes("8BIMluni"); writeInt(4 + unicode.size)
                writeInt(unicode.size / 2); write(unicode)
            }
            writeInt(extra.size); write(extra)
        }
        allChannels.forEach { channels -> channels.forEach { write(it) } }
    }.let { if (it.size % 2 == 0) it else it + byteArrayOf(0) }
    DataOutputStream(Files.newOutputStream(path).buffered()).use { out ->
        out.writeBytes("8BPS"); out.writeShort(1); out.write(ByteArray(6)); out.writeShort(4)
        out.writeInt(source.heightPx); out.writeInt(source.widthPx); out.writeShort(8); out.writeShort(3)
        out.writeInt(0); out.writeInt(0)
        out.writeInt(records.size + 8); out.writeInt(records.size); out.write(records); out.writeInt(0)
        out.writeShort(0)
        val rgba = imageToRgba(composite)
        for (channel in 0..3) out.write(ByteArray(source.widthPx * source.heightPx) { rgba[it * 4 + channel] })
    }
}
