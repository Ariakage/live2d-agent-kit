// SPDX-License-Identifier: GPL-3.0-only
package io.github.psd2live.agentkit

import io.github.psd2live.core.*
import kotlinx.serialization.json.*
import org.umamo.format.art.SourceArt
import org.umamo.render.eval.DrawableSpaceMapping
import org.umamo.render.eval.buildDeformerWorlds
import org.umamo.runtime.model.*
import java.nio.file.Files
import java.nio.file.Path
import kotlin.math.*

/** Measured example augmentation; never enabled for an arbitrary character. */
internal fun appendPinkSakuraDynamics(source: SourceArt, config: PipelineConfig,
    pipeline: PSD2LivePipeline, measurements: Path, reportPath: Path): PipelineConfig {
    val region = Json.parseToJsonElement(Files.readString(measurements)).jsonObject
    require(region.getValue("profile").jsonPrimitive.content == "pink-sakura-v1")
    require(region.getValue("canvas").jsonArray.map { it.jsonPrimitive.int } == listOf(source.widthPx, source.heightPx))
    require(source.widthPx == 1024 && source.heightPx == 1536)
    fun point(name: String) = region.getValue(name).jsonArray.map { it.jsonPrimitive.float }.also {
        require(it.size == 2 && it.all(Float::isFinite))
    }
    val waist = point("waist"); val bowAnchor = point("bowAnchor")
    val shoulders = region.getValue("shoulders").jsonObject.mapValues { (_, value) ->
        value.jsonArray.map { it.jsonPrimitive.float }.also { require(it.size == 2 && it.all(Float::isFinite)) }
    }
    val limits = region.getValue("limits").jsonObject
    fun limit(name: String) = limits.getValue(name).jsonPrimitive.float.also { require(it.isFinite() && it in 0f..12f) }
    val floatPixels = region.getValue("floatPixels").jsonPrimitive.float.also { require(it.isFinite() && it in 0f..10f) }
    val manual = listOf("ShoulderLiftL", "ShoulderLiftR", "ChestExpand", "WaistSway", "UpperArmLSwing", "UpperArmRSwing")
    val secondary = listOf("SleeveLSwing", "SleeveRSwing", "SkirtSwing", "BowSwing")
    val added = listOf("Float", "Wind", "WindSway") + manual + secondary
    var working = config.copy(rigEdits = config.rigEdits.copy(
        parameterEdits = config.rigEdits.parameterEdits + added.map {
            RigParameterEdit("Param$it", it.replace(Regex("([a-z])([A-Z])"), "$1 $2"), -1f, 1f, 0f, created = true)
        },
        physicsEdits = config.rigEdits.physicsEdits + listOf(
            RigPhysicsEdit("PhysicsAmbientWind", "Ambient wind", "ParamWind", "ParamWindSway", length=10f, mobility=.8f, delay=.6f, outputScale=.8f),
            RigPhysicsEdit("PhysicsSleeveL", "Left sleeve", "ParamBodyAngleZ", "ParamSleeveLSwing", length=10f, mobility=.75f, delay=.6f, outputScale=.65f),
            RigPhysicsEdit("PhysicsSleeveR", "Right sleeve", "ParamBodyAngleZ", "ParamSleeveRSwing", length=11f, mobility=.75f, delay=.65f, outputScale=.65f),
            RigPhysicsEdit("PhysicsSkirt", "Skirt hem", "ParamBodyAngleX", "ParamSkirtSwing", length=14f, mobility=.8f, delay=.75f, outputScale=.7f),
            RigPhysicsEdit("PhysicsBow", "Hair bow", "ParamAngleZ", "ParamBowSwing", length=8f, mobility=.72f, delay=.5f, outputScale=.7f)
        )))
    val base = pipeline.buildPreview(source, working)
    val puppet = base.rig.puppet
    val defaults = puppet.parameters.associate { it.id to it.default }
    fun findLayer(name: String): Drawable {
        val layer = source.layers.single { it.name == name }
        return puppet.drawables.single { base.rig.layerIdByDrawableId[it.id.raw] == layer.id.raw }
    }
    val body = findLayer(region.getValue("bodyLayer").jsonPrimitive.content)
    val bow = findLayer(region.getValue("bowLayer").jsonPrimitive.content)
    require(body.parentDeformerId?.raw == "DeformBodyZBreath")
    val edits = mutableListOf<RigKeyformSetEdit>()
    val reports = mutableListOf<JsonObject>()
    val keys = listOf(-1f, -.5f, 0f, .5f, 1f)

    // Float lives on the common root: face, hair, neck and clothing cannot separate.
    val root = puppet.deformers.single { it.id.raw == "DeformBodyXY" } as Deformer.Warp
    require(root.parent == null)
    val rootGrid = requireNotNull(root.geometryGrid)
    for (cell in rootGrid.cells) for (q in keys) {
        val controls = cell.form.controlPoints.copyOf()
        for (i in controls.indices step 2) controls[i + 1] -= q * floatPixels
        val coordinate = rootGrid.axes.indices.associate {
            rootGrid.axes[it].parameterId.raw to rootGrid.axes[it].keys[cell.coordinate[it]]
        } + ("ParamFloat" to q)
        edits += RigKeyformSetEdit(RigTargetRef(RigTargetKind.WARP_DEFORMER, root.id.raw), coordinate,
            RigKeyformGeometryEdit(controlPoints=controls.toList()))
    }

    val bodyIds = manual + secondary.filter { it != "BowSwing" }
    var parent = body.parentDeformerId!!.raw
    val warps = bodyIds.map { id ->
        RigWarpEdit("DeformExample$id", id, parent, listOf(body.id.raw), rows=24, columns=16).also { parent=it.id }
    }
    working = working.copy(rigEdits=working.rigEdits.copy(
        keyformSetEdits=working.rigEdits.keyformSetEdits+edits,
        warpEdits=working.rigEdits.warpEdits+warps))
    edits.clear()
    val posedBase = pipeline.buildPreview(source, working).rig.puppet
    val worlds = buildDeformerWorlds(posedBase.deformers, { defaults[it] ?: 0f })
    for ((index, id) in bodyIds.withIndex()) {
        val warp = posedBase.deformers.single { it.id.raw == warps[index].id } as Deformer.Warp
        val neutral = requireNotNull(warp.geometryGrid).cells.single().form.controlPoints
        val mapping = DrawableSpaceMapping(warp.parent?.let { worlds[it] })
        val world = mapping.localToWorld(neutral)
        val driver = when(id) {
            "ChestExpand" -> "ParamBodyAngleY"
            "WaistSway" -> "ParamBodyAngleX"
            in manual -> "ParamBodyAngleZ"
            else -> "ParamWindSway"
        }
        val driverKeys = if (driver=="ParamWindSway") listOf(-1f,0f,1f) else listOf(-10f,0f,10f)
        var minimumAreaRatio=1f; var maximumPixels=0f
        for (q in keys) for (drive in driverKeys) {
            val sideSign = if (id.endsWith("R") || id.startsWith("UpperArmR") || id.startsWith("SleeveR")) -1f else 1f
            val auto = if (driver=="ParamWindSway") drive*.35f else drive/10f*.22f*if (driver=="ParamBodyAngleZ") sideSign else 1f
            val amount = (q+auto).coerceIn(-1f,1f)
            val target=world.copyOf(); val affected=mutableSetOf<Int>()
            for (i in world.indices step 2) {
                val x=world[i]; val y=-world[i+1]
                val left=id.endsWith("L") || id.startsWith("UpperArmL") || id.startsWith("SleeveL")
                val side=if(left) smooth((x-520f)/100f) else smooth((480f-x)/100f)
                var dx=0f; var dy=0f
                when(id) {
                    "ShoulderLiftL", "ShoulderLiftR" -> {
                        val w=band(y,332f,382f,485f,620f)*side
                        dy=-limit("shoulderPixels")*amount*w
                    }
                    "ChestExpand" -> {
                        val w=band(y,375f,425f,505f,565f)*band(x,360f,430f,570f,640f)
                        dx=((x-waist[0])/75f).coerceIn(-1f,1f)*limit("chestPixels")*amount*w
                        dy=-amount*w
                    }
                    "WaistSway" -> {
                        val w=band(y,440f,550f,640f,810f)*band(x,260f,360f,640f,740f)
                        dx=limit("waistPixels")*amount*w
                    }
                    "UpperArmLSwing", "UpperArmRSwing" -> {
                        val anchor=shoulders.getValue(if(left) "L" else "R")
                        val armSide=if(left) smooth((x-570f)/100f) else smooth((430f-x)/100f)
                        val w=band(y,365f,455f,890f,1060f)*armSide
                        val angle=Math.toRadians((-limit("upperArmDegrees")*amount*sideSign).toDouble())
                        val u=x-anchor[0]; val v=y-anchor[1]
                        dx=((u*cos(angle)-v*sin(angle))-u).toFloat()*w
                        dy=((u*sin(angle)+v*cos(angle))-v).toFloat()*w
                    }
                    "SleeveLSwing", "SleeveRSwing" -> {
                        // The hand belongs to this connected bitmap: it follows the cuff field.
                        val w=band(y,490f,700f,885f,950f)*side
                        dx=limit("sleevePixels")*amount*sideSign*w
                        dy=.4f*amount*amount*w
                    }
                    "SkirtSwing" -> {
                        val w=band(y,585f,720f,790f,845f)*band(x,285f,335f,665f,715f)
                        dx=limit("skirtPixels")*amount*w
                    }
                }
                if(dx!=0f || dy!=0f) { target[i]+=dx; target[i+1]-=dy; affected+=i/2 }
                maximumPixels=max(maximumPixels,hypot(dx,dy))
            }
            val moved=if(amount==0f) neutral.copyOf() else mapping.worldToLocalLinearized(target,neutral,world,affected)
            if (id.startsWith("UpperArm") && amount!=0f && limit("upperArmDegrees")>0f) {
                val posed=mapping.localToWorld(moved)
                val wristControls=world.indices.step(2).filter {
                    -world[it+1] in 700f..850f && (if(sideSign>0f) world[it]>650f else world[it]<350f)
                }
                // Positive capture abduction must move each wrist away from the torso.
                require(wristControls.isNotEmpty() && wristControls.all {
                    (posed[it]-world[it])*amount*sideSign>0f
                }) { "$id reverses the outward capture direction" }
            }
            val ratio=latticeRatio(neutral,moved,warp.rows,warp.columns)
            require(ratio>=.8f) { "$id lattice folds/compresses: $ratio" }
            minimumAreaRatio=min(minimumAreaRatio,ratio)
            edits+=RigKeyformSetEdit(RigTargetRef(RigTargetKind.WARP_DEFORMER,warp.id.raw),
                mapOf("Param$id" to q,driver to drive),RigKeyformGeometryEdit(controlPoints=moved.toList()))
        }
        reports+=buildJsonObject {
            put("parameter","Param$id");put("deformer",warp.id.raw);put("driver",driver)
            put("keys",keys.size*driverKeys.size);put("maximumSourcePixelDisplacement",maximumPixels)
            put("minimumControlTriangleAreaRatio",minimumAreaRatio);put("neutralIdentity",true)
        }
    }

    // Add wind to the existing strand grids, preserving every zero-wind cell.
    val originalWorlds=buildDeformerWorlds(puppet.deformers,{ defaults[it] ?: 0f })
    val hairNames=source.layers.filter { it.name.startsWith("front hair") || it.name.startsWith("back hair") }.map { it.id.raw }.toSet()
    val strands=puppet.drawables.filter { drawable ->
        val layer=base.rig.layerIdByDrawableId[drawable.id.raw] ?: ""
        hairNames.any { layer==it || layer.startsWith("$it:") }
    }
    for (drawable in strands+bow) {
        val mesh=requireNotNull(drawable.mesh)
        val mapping=DrawableSpaceMapping(drawable.parentDeformerId?.let {originalWorlds[it]})
        val world=mapping.localToWorld(mesh.positions)
        val grid=drawable.geometryGrid ?: KeyformGrid(emptyList(),listOf(KeyformCell(intArrayOf(),MeshDeltaForm(FloatArray(mesh.positions.size)))))
        val isBow=drawable.id==bow.id
        val minY=world.indices.step(2).minOf {-world[it+1]}; val maxY=world.indices.step(2).maxOf {-world[it+1]}
        var minimumRatio=1f
        for (cell in grid.cells) for (wind in listOf(-1f,0f,1f)) for (q in if(isBow) keys else listOf(0f)) {
            val target=world.copyOf();val affected=mutableSetOf<Int>()
            for(i in world.indices step 2) {
                val x=world[i];val y=-world[i+1]
                val free=smooth(((y-minY)/(maxY-minY).coerceAtLeast(1f)-.2f)/.8f)
                if(isBow) {
                    val radius=hypot(x-bowAnchor[0],y-bowAnchor[1]);val w=smooth((radius-12f)/50f)
                    val angle=Math.toRadians((limit("bowDegrees")*(q+.35f*wind).coerceIn(-1f,1f)).toDouble())
                    val u=x-bowAnchor[0];val v=y-bowAnchor[1]
                    target[i]+=((u*cos(angle)-v*sin(angle))-u).toFloat()*w
                    target[i+1]-=((u*sin(angle)+v*cos(angle))-v).toFloat()*w
                } else target[i]+=3f*wind*free*free
                if(target[i]!=world[i] || target[i+1]!=world[i+1]) affected+=i/2
            }
            val local=if(affected.isEmpty()) mesh.positions else mapping.worldToLocalLinearized(target,mesh.positions,world,affected)
            val delta=FloatArray(local.size) { cell.form.positionDeltas[it]+if(it/2 in affected) local[it]-mesh.positions[it] else 0f }
            val moved=FloatArray(local.size) {mesh.positions[it]+delta[it]}
            val ratio=triangleRatio(mesh.positions,moved,mesh.indices)
            require(ratio>.6f) { "${drawable.id.raw} wind/bow triangles fold: $ratio" };minimumRatio=min(minimumRatio,ratio)
            val coord=grid.axes.indices.associate {grid.axes[it].parameterId.raw to grid.axes[it].keys[cell.coordinate[it]]}+mapOf("ParamWindSway" to wind)+(if(isBow) mapOf("ParamBowSwing" to q) else emptyMap())
            edits+=RigKeyformSetEdit(RigTargetRef(RigTargetKind.ART_MESH,drawable.id.raw),coord,RigKeyformGeometryEdit(positionDeltas=delta.toList()))
        }
        reports+=buildJsonObject {put("drawable",drawable.id.raw);put("windResponse",true);put("bowResponse",isBow);put("minimumMeshTriangleAreaRatio",minimumRatio)}
    }
    working=working.copy(rigEdits=working.rigEdits.copy(keyformSetEdits=working.rigEdits.keyformSetEdits+edits))
    Files.writeString(reportPath,Json {prettyPrint=true}.encodeToString(JsonObject.serializer(),buildJsonObject {
        put("profile","pink-sakura-v1");put("newParameters",added.size);put("nativeFloatPixels",floatPixels)
        put("sourceArtChanged",false);put("meshTopologyChanged",false);put("textureUvChanged",false)
        put("wholeModelNeutralPixelIdentityTested",false);put("fields",JsonArray(reports))
        put("limitations","Connected body raster permits restrained local motion only; no free elbow/hand gesture. Lattice checks do not replace Core interpolation and visual sequence checks. Root Float and inherited neutral face require real render comparison.")
    }))
    return working
}

private fun smooth(value:Float):Float {val t=value.coerceIn(0f,1f);return t*t*(3f-2f*t)}
private fun band(value:Float,a:Float,b:Float,c:Float,d:Float)=smooth((value-a)/(b-a))*(1f-smooth((value-c)/(d-c)))
private fun triangleRatio(before:FloatArray,after:FloatArray,indices:IntArray):Float {
    fun area(p:FloatArray,a:Int,b:Int,c:Int):Double=(p[b*2].toDouble()-p[a*2])*(p[c*2+1].toDouble()-p[a*2+1])-(p[b*2+1].toDouble()-p[a*2+1])*(p[c*2].toDouble()-p[a*2])
    var ratio=1.0
    for(i in indices.indices step 3) {val a=indices[i];val b=indices[i+1];val c=indices[i+2];val old=area(before,a,b,c);if(abs(old)>1e-12) ratio=min(ratio,area(after,a,b,c)/old)}
    return ratio.toFloat()
}
private fun latticeRatio(before:FloatArray,after:FloatArray,rows:Int,columns:Int):Float {
    val triangles=IntArray(rows*columns*6);var i=0
    for(r in 0 until rows) for(c in 0 until columns) {val a=r*(columns+1)+c;val b=a+1;val e=a+columns+1;val d=e+1;for(v in intArrayOf(a,b,e,b,d,e)) triangles[i++]=v}
    return triangleRatio(before,after,triangles)
}
