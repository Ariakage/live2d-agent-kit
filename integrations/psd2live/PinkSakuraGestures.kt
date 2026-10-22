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

private data class ArmPoint(val x: Float, val y: Float) {
    operator fun plus(p: ArmPoint) = ArmPoint(x + p.x, y + p.y)
    operator fun minus(p: ArmPoint) = ArmPoint(x - p.x, y - p.y)
    operator fun times(s: Float) = ArmPoint(x * s, y * s)
    fun length() = hypot(x, y)
    fun unit() = this * (1f / length().coerceAtLeast(1e-6f))
}
private fun armMix(a: ArmPoint, b: ArmPoint, t: Float) = a * (1f - t) + b * t
private fun armSmooth(x: Float): Float { val t = x.coerceIn(0f, 1f); return t * t * (3f - 2f * t) }
private fun armPoint(value: JsonElement): ArmPoint {
    val p = value.jsonArray.map { it.jsonPrimitive.float }
    require(p.size == 2 && p.all(Float::isFinite) && p[0] in 0f..1024f && p[1] in 0f..1536f)
    return ArmPoint(p[0], p[1])
}
/** Material coordinates are measured along one straight, registered shoulder-to-cuff source. */
private class ArmPath(val points: List<ArmPoint>, val angles: List<Float>, val restLength: Float) {
    fun sample(u: Float): Triple<ArmPoint, Float, Float> {
        val last = points.lastIndex
        if (u < 0f) return Triple(points.first() + ArmPoint(cos(angles.first()), sin(angles.first())) * (u*restLength), angles.first(), 0f)
        if (u > 1f) return Triple(points.last() + ArmPoint(cos(angles.last()), sin(angles.last())) * ((u-1f)*restLength), angles.last(), 0f)
        val p = u * last; val a = floor(p).toInt().coerceAtMost(last-1); val f = p-a
        val curvature = abs(angles[a+1]-angles[a]) / (points[a+1]-points[a]).length().coerceAtLeast(.01f)
        return Triple(armMix(points[a], points[a+1], f), angles[a]*(1-f)+angles[a+1]*f, curvature)
    }
}

private fun armGuide(shoulder: ArmPoint, elbow: ArmPoint, wrist: ArmPoint): List<ArmPoint> {
    val sign=if(wrist.x>shoulder.x) 1f else -1f
    val radius=abs(wrist.x-shoulder.x)/2f
    require(radius in 30f..90f) { "A broad sleeve needs at least 60px horizontal wrist offset" }
    val upper=(elbow.y-shoulder.y-radius).coerceAtLeast(105f)
    val lower=shoulder.y+upper-wrist.y
    require(lower>60f)
    val arc=PI.toFloat()*radius;val length=upper+arc+lower
    return (0..128).map { i ->
        val distance=length*i/128f
        when {
            distance<upper -> shoulder+ArmPoint(0f,distance)
            distance<upper+arc -> {
                val a=(distance-upper)/radius
                shoulder+ArmPoint(sign*radius*(1f-cos(a)),upper+radius*sin(a))
            }
            else -> ArmPoint(wrist.x,shoulder.y+upper-(distance-upper-arc))
        }
    }
}

/** Interpolating directions before integration avoids the zero-length wrist at a 180-degree bend. */
private fun armPath(shoulder: ArmPoint, wrist: ArmPoint, guide: List<ArmPoint>, amount: Float): ArmPath {
    val rest = wrist-shoulder; val length = rest.length(); val initial = atan2(rest.y, rest.x)
    if (amount==0f) return ArmPath((0..128).map { shoulder+rest*(it/128f) },List(129){initial},length)
    var previous = initial
    val segments = guide.zipWithNext().map { (a,b) ->
        val delta = b-a; var angle = atan2(delta.y,delta.x)
        while (angle-previous > PI) angle -= (2*PI).toFloat()
        while (angle-previous < -PI) angle += (2*PI).toFloat()
        previous = angle
        (initial+(angle-initial)*amount) to (length/128*(1-amount)+delta.length()*amount)
    }
    val points = ArrayList<ArmPoint>(); points += shoulder
    for ((angle, distance) in segments) points += points.last()+ArmPoint(cos(angle),sin(angle))*distance
    val angles = (0..128).map { i -> if (i==0) segments.first().first else if(i==128) segments.last().first else (segments[i-1].first+segments[i].first)*.5f }
    return ArmPath(points, angles, length)
}

private fun armAreaRatio(before: FloatArray, after: FloatArray, indices: IntArray): Float {
    fun area(p: FloatArray, a: Int, b: Int, c: Int) =
        (p[b*2].toDouble()-p[a*2])*(p[c*2+1].toDouble()-p[a*2+1]) -
        (p[b*2+1].toDouble()-p[a*2+1])*(p[c*2].toDouble()-p[a*2])
    var result = Double.POSITIVE_INFINITY
    for (i in indices.indices step 3) {
        val a=indices[i]; val b=indices[i+1]; val c=indices[i+2]; val old=area(before,a,b,c)
        if (abs(old)>1e-12) result=min(result,area(after,a,b,c)/old)
    }
    return result.toFloat()
}

internal fun appendPinkSakuraGestures(source: SourceArt, config: PipelineConfig, pipeline: PSD2LivePipeline,
    region: JsonObject, reportPath: Path): PipelineConfig {
    val shoulder=armPoint(region.getValue("restShoulder")); val wrist=armPoint(region.getValue("restWrist"))
    val rest=(wrist-shoulder); val restLength=rest.length(); val direction=rest.unit(); val normal=ArmPoint(-direction.y,direction.x)
    require(restLength in 300f..550f) { "Expected the measured Pink Sakura shoulder-to-wrist registration" }
    
    val poses=region.getValue("poses").jsonArray.also { require(it.size==3) }
    val radii=poses.map { abs(armPoint(it.jsonObject.getValue("wrist")).x-shoulder.x)/2f }
    val guides=poses.map { p -> armGuide(shoulder,armPoint(p.jsonObject.getValue("elbow")),
        armPoint(p.jsonObject.getValue("wrist"))) }
    val parameters=listOf(
        RigParameterEdit("ParamArmRLift","Right arm gesture lift",0f,1f,0f,created=true),
        RigParameterEdit("ParamArmRPose","Right arm pose: chin / heart / wave",0f,2f,0f,created=true),
        RigParameterEdit("ParamHandRForm","Right hand: rest / chin / heart / wave",0f,3f,0f,created=true),
        RigParameterEdit("ParamHandRWave","Right wrist wave",-1f,1f,0f,created=true))
    var working=config.copy(rigEdits=config.rigEdits.copy(parameterEdits=config.rigEdits.parameterEdits+parameters))
    val built=pipeline.buildPreview(source,working)
    val model=built.rig.puppet;val defaults=model.parameters.associate { it.id to it.default }
    val worlds=buildDeformerWorlds(model.deformers,{defaults[it]?:0f})
    fun layer(name:String):Drawable {
        val id=source.layers.single{it.name==name}.id.raw
        return model.drawables.single{built.rig.layerIdByDrawableId[it.id.raw]==id}.also {
            require(it.geometryGrid?.axes.isNullOrEmpty()) { "Gesture source must not carry unrelated mesh keys: $name" }
        }
    }
    val sleeve=layer(region.getValue("sleeveLayer").jsonPrimitive.content)
    val cuff=layer(region.getValue("cuffLayer").jsonPrimitive.content)
    val handNames=region.getValue("handLayers").jsonObject
    val hands=listOf("rest","chin","heart","wave").map{layer(handNames.getValue(it).jsonPrimitive.content)}
    require((listOf(sleeve)+hands).all{it.parentDeformerId==sleeve.parentDeformerId})
    val mapping=DrawableSpaceMapping(sleeve.parentDeformerId?.let{worlds[it]})
    val liftKeys=(0..16).map{it/16f};val poseKeys=(0..16).map{it/8f}
    val paths=liftKeys.map { lift -> poseKeys.map { pose ->
        val choice=pose.roundToInt().coerceIn(0,2)
        val amount=lift*armSmooth(1f-abs(pose-choice)*2f)
        armPath(shoulder,wrist,guides[choice],amount)
    } }
    val edits=ArrayList<RigKeyformSetEdit>()
    val wholeWorld=mapping.localToWorld(requireNotNull(sleeve.mesh).positions)
    val maximumAcross=wholeWorld.indices.step(2).maxOf { i ->
        val relative=ArmPoint(wholeWorld[i],-wholeWorld[i+1])-shoulder
        abs(relative.x*normal.x+relative.y*normal.y)
    }
    var minimumWidthScale=1f
    var minimumKeyRatio=1f;var minimumInterpolatedRatio=1f;var interpolationSamples=0
    for (piece in listOf(sleeve,cuff)) {
    val mesh=requireNotNull(piece.mesh);val neutralWorld=mapping.localToWorld(mesh.positions)
    val sleeveCells=liftKeys.indices.map { li -> poseKeys.indices.map { pi ->
        val path=paths[li][pi];val target=neutralWorld.copyOf()
        for(i in target.indices step 2) {
            val p=ArmPoint(neutralWorld[i],-neutralWorld[i+1]);val relative=p-shoulder
            val u=(relative.x*direction.x+relative.y*direction.y)/restLength
            val across=relative.x*normal.x+relative.y*normal.y
            val (centre,angle,_)=path.sample(u)
            val pose=poseKeys[pi];val choice=pose.roundToInt().coerceIn(0,2)
            val amount=liftKeys[li]*armSmooth(1f-abs(pose-choice)*2f)
            // One uniform cross-section scale preserves triangle spacing at the inner elbow.
            val widthScale=if(amount<=.00001f) 1f else min(1f,.72f*radii[choice]/(maximumAcross*amount))
            val width=across*widthScale
            if(abs(across)>.01f) minimumWidthScale=min(minimumWidthScale,abs(width/across))
            val q=centre+ArmPoint(-sin(angle),cos(angle))*width
            target[i]=q.x;target[i+1]=-q.y
        }
        val local=if(liftKeys[li]==0f || abs(poseKeys[pi] % 1f-.5f)<1e-6f) mesh.positions.copyOf()
            else mapping.worldToLocalLinearized(target,mesh.positions,neutralWorld,mesh.positions.indices.step(2).map{it/2}.toSet())
        edits+=RigKeyformSetEdit(RigTargetRef(RigTargetKind.ART_MESH,piece.id.raw),
            mapOf("ParamArmRLift" to liftKeys[li],"ParamArmRPose" to poseKeys[pi]),
            RigKeyformGeometryEdit(positionDeltas=local.indices.map{local[it]-mesh.positions[it]}))
        local
    } }
    for(row in sleeveCells) for(cell in row) {
        val ratio=armAreaRatio(mesh.positions,cell,mesh.indices)
        minimumKeyRatio=min(minimumKeyRatio,ratio)
    }
    for(li in 0 until liftKeys.lastIndex) for(pi in 0 until poseKeys.lastIndex)
        for(a in listOf(.25f,.5f,.75f)) for(b in listOf(.25f,.5f,.75f)) {
            val mixed=FloatArray(mesh.positions.size){j ->
                sleeveCells[li][pi][j]*(1-a)*(1-b)+sleeveCells[li+1][pi][j]*a*(1-b)+
                    sleeveCells[li][pi+1][j]*(1-a)*b+sleeveCells[li+1][pi+1][j]*a*b}
            minimumInterpolatedRatio=min(minimumInterpolatedRatio,armAreaRatio(mesh.positions,mixed,mesh.indices));interpolationSamples++
        }
    if(piece==cuff) for(lift in listOf(0f,1f)) edits+=RigKeyformSetEdit(
        RigTargetRef(RigTargetKind.ART_MESH,piece.id.raw),mapOf("ParamArmRLift" to lift),
        channels=RigKeyformChannelsEdit(drawOrder=1000f))
    }
    for((form,hand) in hands.withIndex()) {
        val handMesh=requireNotNull(hand.mesh);val world=mapping.localToWorld(handMesh.positions)
        val formKeys=(listOf(0f,3f)+listOf(-.5f,-.25f,-.125f,0f,.125f,.25f,.5f).map{(form+it).coerceIn(0f,3f)}).distinct().sorted()
        val waveKeys=if(form==3) listOf(-1f,0f,1f) else listOf(0f)
        for(f in formKeys) {
            val opacity=(1f-abs(f-form)/.25f).coerceIn(0f,1f)
            edits+=RigKeyformSetEdit(RigTargetRef(RigTargetKind.ART_MESH,hand.id.raw),mapOf("ParamHandRForm" to f),
                channels=RigKeyformChannelsEdit(opacity=opacity,drawOrder=999f))
        }
        for(li in liftKeys.indices) for(pi in poseKeys.indices) for(f in formKeys) for(wave in waveKeys) {
            val path=paths[li][pi];val wristPoint=path.points.last()
            val angle=path.angles.last()-atan2(direction.y,direction.x)+wave*liftKeys[li]*(PI/15).toFloat()
            val retreat=95f*armSmooth((abs(f-form)/.5f).coerceIn(0f,1f))
            val tangent=ArmPoint(cos(path.angles.last()),sin(path.angles.last()))
            val target=world.copyOf()
            for(i in target.indices step 2) {
                val relative=ArmPoint(world[i],-world[i+1])-wrist
                val q=wristPoint+ArmPoint(relative.x*cos(angle)-relative.y*sin(angle),relative.x*sin(angle)+relative.y*cos(angle))-tangent*retreat
                target[i]=q.x;target[i+1]=-q.y
            }
            val local=mapping.worldToLocalLinearized(target,handMesh.positions,world,world.indices.step(2).map{it/2}.toSet())
            edits+=RigKeyformSetEdit(RigTargetRef(RigTargetKind.ART_MESH,hand.id.raw),
                mapOf("ParamArmRLift" to liftKeys[li],"ParamArmRPose" to poseKeys[pi],"ParamHandRForm" to f)+
                    (if(form==3) mapOf("ParamHandRWave" to wave) else emptyMap()),
                RigKeyformGeometryEdit(positionDeltas=local.indices.map{local[it]-handMesh.positions[it]}))
        }
    }
    val maximumSimultaneousHands=(0..120).maxOf { step ->
        val form=step/40f
        (0..3).count { (1f-abs(form-it)/.25f).coerceIn(0f,1f)>0f }
    }
    require(maximumSimultaneousHands==1)
    val passed=minimumKeyRatio>.015f && minimumInterpolatedRatio>.015f
    Files.writeString(reportPath,Json{prettyPrint=true}.encodeToString(JsonObject.serializer(),buildJsonObject {
        put("profile","pink-sakura-arm-v1");put("passedLocalGeometry",passed)
        put("newParameters",parameters.size);put("liftKeyCount",liftKeys.size);put("poseKeyCount",poseKeys.size)
        put("sleeveKeyPoses",liftKeys.size*poseKeys.size);put("interpolationSamples",interpolationSamples)
        put("minimumSleeveKeyTriangleAreaRatio",minimumKeyRatio);put("minimumSleeveInterpolatedTriangleAreaRatio",minimumInterpolatedRatio)
        put("minimumWidthScale",minimumWidthScale);put("elbowRadii",JsonArray(radii.map{JsonPrimitive(it)}));put("singleContinuousSleeveMesh",true);put("matchingCuffOverlay",true)
        put("fractionalPoseReturnsThroughRest",true);put("handOpacitySamples",121);put("maximumSimultaneousVisibleHands",maximumSimultaneousHands)
        put("limitations","Local sleeve mesh keys and quarter-cell interpolants only. Geometry positivity does not prove appearance, parent-combination safety or VTS acceptance. Hand-form switching retracts into the cuff and has an intentionally hidden interval.")
    }))
    require(passed) { "Gesture sleeve folds or collapses; inspect $reportPath" }
    working=working.copy(rigEdits=working.rigEdits.copy(keyformSetEdits=working.rigEdits.keyformSetEdits+edits))
    return working
}
