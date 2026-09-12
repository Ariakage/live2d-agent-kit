import com.live2d.sdk.cubism.core.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;

/** Real native Cubism Core validation. Uses the locally installed Core; no SDK is bundled. */
public class validate_core {
    static final List<String> errors = new ArrayList<>();
    static final List<String> warnings = new ArrayList<>();
    static float ppu;
    static CubismParameterView[] params;
    static CubismDrawableView[] drawables;
    record Mesh(float[] xy, float opacity, int order) {}

    public static void main(String[] args) throws Exception {
        if (args.length < 1 || args.length > 2) {
            System.err.println("Usage: validate_core model.moc3 [report.json]");
            System.exit(2);
        }
        Path file = Path.of(args[0]).toAbsolutePath();
        Map<String,Object> report = obj("validator", "local-official-cubism-core", "checkedAt", Instant.now().toString(),
                "model", file.toString(), "passed", false);
        try {
            byte[] bytes = Files.readAllBytes(file);
            report.put("sha256", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
            report.put("fileBytes", bytes.length);
            // The public Core entry point loads the locally installed JNI library.
            report.put("coreVersion", Live2DCubismCore.getVersion().toString());
            report.put("latestMocVersion", Live2DCubismCore.getLatestMocVersion());
            report.put("mocVersion", Live2DCubismCore.getMocVersion(bytes));
            boolean consistency = Live2DCubismCore.hasMocConsistency(bytes);
            report.put("nativeConsistencyPassed", consistency);
            if (!consistency) throw new IllegalStateException("Official native Core rejected MOC consistency");
            try (CubismMoc moc = CubismMoc.instantiate(bytes); CubismModel model = moc.instantiateModel()) {
                if (model == null) throw new IllegalStateException("Native Core did not instantiate the model");
                params = model.getParameterViews();
                drawables = model.getDrawableViews();
                CubismCanvasInfo canvas = model.getCanvasInfo();
                ppu = canvas.getPixelsPerUnit();
                report.put("canvas", obj("sizeInPixels", canvas.getSizeInPixels(), "originInPixels", canvas.getOriginInPixels(), "pixelsPerUnit", ppu));
                if (!Float.isFinite(ppu) || ppu <= 0 || !finite(canvas.getSizeInPixels()) || !finite(canvas.getOriginInPixels())) errors.add("Invalid canvas dimensions or pixelsPerUnit");
                if (drawables.length == 0) errors.add("No drawable meshes");
                reset(model);
                Mesh[] neutral = snapshot();
                report.put("neutral", evaluate("neutral", neutral));
                List<Object> meshes = new ArrayList<>();
                int vertices = 0, triangles = 0;
                for (CubismDrawableView d : drawables) {
                    vertices += d.getVertexCount();
                    triangles += d.getIndices().length / 3;
                    meshes.add(obj("id", d.getId(), "vertices", d.getVertexCount(), "triangles", d.getIndices().length / 3,
                            "textureIndex", d.getTextureIndex(), "opacity", d.getOpacity(), "masks", d.getMasks(), "drawOrder", d.getDrawOrder()));
                    validateStaticMesh(d);
                }
                report.put("counts", obj("parameters", params.length, "drawables", drawables.length, "vertices", vertices, "triangles", triangles));
                report.put("meshes", meshes);
                List<Object> parameterReports = new ArrayList<>();
                List<String> ineffective = new ArrayList<>();
                for (CubismParameterView p : params) {
                    if (!finite(p.getMinimumValue(), p.getDefaultValue(), p.getMaximumValue()) ||
                            p.getMinimumValue() > p.getDefaultValue() || p.getDefaultValue() > p.getMaximumValue()) {
                        errors.add("Invalid parameter range: " + p.getId());
                        continue;
                    }
                    Map<String,Object> entry = obj("id", p.getId(), "min", p.getMinimumValue(), "default", p.getDefaultValue(), "max", p.getMaximumValue());
                    reset(model); p.setValue(p.getMinimumValue()); model.update();
                    Map<String,Object> min = evaluate(p.getId() + ":min", neutral);
                    reset(model); p.setValue(p.getMaximumValue()); model.update();
                    Map<String,Object> max = evaluate(p.getId() + ":max", neutral);
                    entry.put("minPose", min); entry.put("maxPose", max);
                    boolean effective = (int) min.get("changedMeshes") > 0 || (int) max.get("changedMeshes") > 0;
                    entry.put("affectsModel", effective);
                    if (!effective) ineffective.add(p.getId());
                    parameterReports.add(entry);
                }
                report.put("parameters", parameterReports);
                report.put("parametersWithoutMeasuredEffect", ineffective);
                if (!ineffective.isEmpty()) warnings.add("Parameters without a measurable direct vertex/opacity/order effect: " + String.join(", ", ineffective));
                List<Object> combined = new ArrayList<>();
                CubismParameterView ax = parameter(model,"ParamAngleX","PARAM_ANGLE_X"), ay = parameter(model,"ParamAngleY","PARAM_ANGLE_Y"), az = parameter(model,"ParamAngleZ","PARAM_ANGLE_Z");
                if (ax != null && ay != null) {
                    float[] zs = az == null ? new float[]{0} : new float[]{az.getMinimumValue(), az.getDefaultValue(), az.getMaximumValue()};
                    for (float x : new float[]{ax.getMinimumValue(), ax.getDefaultValue(), ax.getMaximumValue()})
                        for (float y : new float[]{ay.getMinimumValue(), ay.getDefaultValue(), ay.getMaximumValue()})
                            for (float z : zs) {
                                reset(model); ax.setValue(x); ay.setValue(y); if (az != null) az.setValue(z); model.update();
                                Map<String,Object> pose = evaluate("head:" + x + "," + y + "," + z, neutral);
                                pose.put("values", obj("ParamAngleX", x, "ParamAngleY", y, "ParamAngleZ", z)); combined.add(pose);
                            }
                }
                reset(model);
                Map<String,Object> expressionValues = new LinkedHashMap<>();
                for (String[] ids : List.of(new String[]{"ParamEyeLOpen","PARAM_EYE_L_OPEN"},new String[]{"ParamEyeROpen","PARAM_EYE_R_OPEN"})) {
                    CubismParameterView p = parameter(model,ids[0],ids[1]); if (p != null) { p.setValue(p.getMinimumValue()); expressionValues.put(p.getId(),p.getMinimumValue()); }
                }
                CubismParameterView mouth = parameter(model,"ParamMouthOpenY","PARAM_MOUTH_OPEN_Y");
                if (mouth != null) { mouth.setValue(mouth.getMaximumValue()); expressionValues.put(mouth.getId(),mouth.getMaximumValue()); }
                if (!expressionValues.isEmpty()) { model.update(); Map<String,Object> expression=evaluate("eyesClosedMouthOpen", neutral); expression.put("values",expressionValues); combined.add(expression); }
                // Probe only parameters actually declared by this model. Fractions are
                // mapped through each parameter's own range; another character may use
                // different limits, mesh IDs, or mouth opacity curves.
                float[][] heads = {{0,0,0,0,0,0,1,1,0,0}, {-1,0.5f,-0.7f,0,0,0.8f,0,0.5f,-1,0.8f},
                    {1,-0.5f,0.7f,0,0,-0.8f,0.5f,0,1,-0.8f}, {0,-0.8f,0.7f,-0.8f,0,-0.8f,0.85f,0.85f,-1,-1},
                    {0,0.8f,1,1,1,0,0,0,0,0}};
                String[] signals = {"ParamAngleX","ParamAngleY","ParamAngleZ","ParamBodyAngleX","ParamBodyAngleY",
                    "ParamBodyAngleZ","ParamEyeLOpen","ParamEyeROpen","ParamEyeBallX","ParamEyeBallY"};
                String[] legacySignals = {"PARAM_ANGLE_X","PARAM_ANGLE_Y","PARAM_ANGLE_Z","PARAM_BODY_ANGLE_X","PARAM_BODY_ANGLE_Y",
                    "PARAM_BODY_ANGLE_Z","PARAM_EYE_L_OPEN","PARAM_EYE_R_OPEN","PARAM_EYE_BALL_X","PARAM_EYE_BALL_Y"};
                CubismParameterView mouthForm = parameter(model,"ParamMouthForm","PARAM_MOUTH_FORM");
                int mouthCombinedCount=0;
                if (mouth != null && mouthForm != null) {
                    for(int h=0;h<heads.length;h++)for(float form:new float[]{-1,-0.5f,0,0.5f,1})
                        for(float open:new float[]{0,0.075f,0.15f,0.5f,1}) {
                            reset(model);
                            Map<String,Object> values=new LinkedHashMap<>();
                            for(int j=0;j<signals.length;j++) {
                                CubismParameterView signal=parameter(model,signals[j],legacySignals[j]);
                                if(signal!=null) {
                                    float value=(j==6||j==7) ? rangeFraction(signal,heads[h][j]) : signedFraction(signal,heads[h][j]);
                                    signal.setValue(value); values.put(signal.getId(),value);
                                }
                            }
                            float formValue=signedFraction(mouthForm,form), openValue=rangeFraction(mouth,open);
                            mouthForm.setValue(formValue); mouth.setValue(openValue);
                            values.put(mouthForm.getId(),formValue); values.put(mouth.getId(),openValue); model.update();
                            String label="mouth-combined:"+h+","+form+","+open;
                            Map<String,Object> pose=evaluate(label,neutral); pose.put("values",values);
                            Map<String,Object> mouthOpacities=new LinkedHashMap<>();
                            for(CubismDrawableView d:drawables) if(d.getId().toLowerCase(Locale.ROOT).contains("mouth"))
                                mouthOpacities.put(d.getId(),d.getOpacity());
                            pose.put("mouthOpacities",mouthOpacities); combined.add(pose); mouthCombinedCount++;
                        }
                } else warnings.add("Mouth form/open combined sweep skipped: both standard mouth parameters are required");
                report.put("mouthCombinedPoseCount",mouthCombinedCount);
                report.put("combinedPoses", combined);
                report.put("testedPoseCount", 1 + parameterReports.size() * 2 + combined.size());
                report.put("passed", errors.isEmpty());
                report.put("scope", "Official native parser and model update; neutral, every individual parameter minimum/maximum, head-angle combinations, closed eyes with open mouth, and, when both standard mouth parameters exist, 125 mouth form/open combinations with available head/body/eye inputs normalized to their declared ranges. Checks indices, UVs, finite vertices, opacity range and actual parameter effects. Reports triangle changes and mouth opacities without assuming a character-specific crossfade formula; visible seams require texture/alpha and rendered-image review. Does not assess artistic quality or VTube Studio tracking.");
            }
        } catch (Throwable e) {
            report.put("passed",false);
            errors.add(e.getClass().getSimpleName() + ": " + e.getMessage());
            e.printStackTrace(System.err);
        }
        report.put("errors", errors); report.put("warnings", warnings);
        String json = json(report, 0) + "\n";
        if (args.length == 2) {
            Path out = Path.of(args[1]).toAbsolutePath();
            Files.createDirectories(out.getParent()); Files.writeString(out, json);
            System.out.println("Core validation " + (Boolean.TRUE.equals(report.get("passed")) ? "PASSED" : "FAILED") + ": " + out);
        } else System.out.print(json);
        if (!Boolean.TRUE.equals(report.get("passed"))) System.exit(1);
    }

    static void reset(CubismModel model) { for (CubismParameterView p : params) p.setValue(p.getDefaultValue()); model.update(); }
    static CubismParameterView parameter(CubismModel model,String modern,String legacy) { CubismParameterView p=model.findParameterView(modern);return p!=null?p:model.findParameterView(legacy); }
    static float rangeFraction(CubismParameterView p,float fraction) {
        return p.getMinimumValue() + fraction * (p.getMaximumValue()-p.getMinimumValue());
    }
    static float signedFraction(CubismParameterView p,float fraction) {
        float base=p.getDefaultValue();
        return fraction<0 ? base + (-fraction)*(p.getMinimumValue()-base) : base + fraction*(p.getMaximumValue()-base);
    }
    static Mesh[] snapshot() {
        Mesh[] result = new Mesh[drawables.length];
        for (int i = 0; i < drawables.length; i++) {
            CubismDrawableView d = drawables[i]; result[i] = new Mesh(d.getVertexPositions().clone(), d.getOpacity(), d.getDrawOrder());
        }
        return result;
    }
    static void validateStaticMesh(CubismDrawableView d) {
        String id = d.getId(); int n = d.getVertexCount();
        if (d.getVertexPositions().length != 2*n || d.getVertexUvs().length != 2*n) errors.add("Vertex/UV size mismatch: " + id);
        if (d.getIndices().length % 3 != 0) errors.add("Triangle index count not divisible by three: " + id);
        for (short ix : d.getIndices()) if (Short.toUnsignedInt(ix) >= n) { errors.add("Out-of-range triangle index: " + id); break; }
        for (float uv : d.getVertexUvs()) if (!Float.isFinite(uv)) { errors.add("Non-finite UV: " + id); break; }
        for (int mask : d.getMasks()) if (mask < 0 || mask >= drawables.length) errors.add("Invalid clipping mask index: " + id);
        if (d.getTextureIndex() < 0) errors.add("Negative texture index: " + id);
    }
    static Map<String,Object> evaluate(String name, Mesh[] neutral) {
        int changed = 0, active = 0, nonFinite = 0, invalidOpacity = 0, degenerate = 0, inverted = 0;
        double distance = 0, opacityDifference = 0, minX = Double.POSITIVE_INFINITY, minY = minX, maxX = -minX, maxY = maxX;
        List<String> changedIds = new ArrayList<>();
        List<Object> flippedMeshes = new ArrayList<>();
        List<Object> degenerateMeshes = new ArrayList<>();
        for (int i = 0; i < drawables.length; i++) {
            CubismDrawableView d = drawables[i]; float[] xy = d.getVertexPositions(); Mesh base = neutral[i];
            boolean delta = d.getDrawOrder() != base.order(); double localMax = 0;
            if (d.getOpacity() > 1e-6) active++;
            if (!Float.isFinite(d.getOpacity()) || d.getOpacity() < -1e-5 || d.getOpacity() > 1.00001) invalidOpacity++;
            double od = Math.abs(d.getOpacity() - base.opacity()); opacityDifference = Math.max(opacityDifference, od); delta |= od > 1e-7;
            for (int v = 0; v+1 < xy.length; v += 2) {
                if (!finite(xy[v], xy[v+1])) { nonFinite++; continue; }
                minX = Math.min(minX, xy[v]); maxX = Math.max(maxX, xy[v]); minY = Math.min(minY, xy[v+1]); maxY = Math.max(maxY, xy[v+1]);
                double movement = Math.hypot(xy[v] - base.xy()[v], xy[v+1] - base.xy()[v+1]); localMax = Math.max(localMax, movement);
            }
            distance = Math.max(distance, localMax); delta |= localMax > 1e-7;
            if (delta) { changed++; changedIds.add(d.getId()); }
            short[] ix = d.getIndices();
            int localFlips = 0;
            int localDegenerate = 0;
            double localFlipAreaPixels = 0, localMaxFlipAreaPixels = 0;
            for (int k = 0; k+2 < ix.length; k += 3) {
                int a=Short.toUnsignedInt(ix[k])*2, b=Short.toUnsignedInt(ix[k+1])*2, c=Short.toUnsignedInt(ix[k+2])*2;
                if (Math.max(a,Math.max(b,c))+1 >= xy.length) continue;
                double area = area(xy,a,b,c), before = area(base.xy(),a,b,c);
                if (Math.abs(area) < 1e-12) { degenerate++; localDegenerate++; }
                if (area * before < -1e-14) { inverted++; localFlips++; double pixelArea=Math.abs(area)*ppu*ppu/2; localFlipAreaPixels+=pixelArea; localMaxFlipAreaPixels=Math.max(localMaxFlipAreaPixels,pixelArea); }
            }
            if(localFlips>0)flippedMeshes.add(obj("id",d.getId(),"triangles",localFlips,"opacity",d.getOpacity(),"masks",d.getMasks(),"totalAreaPixels",localFlipAreaPixels,"largestTriangleAreaPixels",localMaxFlipAreaPixels));
            if(localDegenerate>0)degenerateMeshes.add(obj("id",d.getId(),"triangles",localDegenerate,"opacity",d.getOpacity()));
        }
        if (nonFinite > 0) errors.add(name + ": " + nonFinite + " non-finite vertices");
        if (invalidOpacity > 0) errors.add(name + ": " + invalidOpacity + " invalid opacities");
        return obj("name", name, "finite", nonFinite == 0 && invalidOpacity == 0, "activeMeshes", active, "changedMeshes", changed,
                "changedMeshIds", changedIds, "maxVertexDisplacementPixels", distance * ppu, "maxOpacityChange", opacityDifference,
                "degenerateTriangles", degenerate,"degenerateMeshes",degenerateMeshes, "trianglesFlippedFromNeutral", inverted,"flippedMeshes",flippedMeshes, "boundsModelUnits", new double[]{minX,minY,maxX,maxY});
    }
    static double area(float[] v, int a,int b,int c) { return (v[b]-v[a])*(double)(v[c+1]-v[a+1])-(v[b+1]-v[a+1])*(double)(v[c]-v[a]); }
    static boolean finite(float... values) { for(float v:values) if(!Float.isFinite(v)) return false; return true; }
    static Map<String,Object> obj(Object... pairs) { Map<String,Object> result = new LinkedHashMap<>(); for(int i=0;i<pairs.length;i+=2) result.put((String)pairs[i],pairs[i+1]); return result; }
    static String quote(String s) {
        StringBuilder b=new StringBuilder("\"");
        for(char c:s.toCharArray()) switch(c) { case '"' -> b.append("\\\""); case '\\' -> b.append("\\\\"); case '\n' -> b.append("\\n"); case '\r' -> b.append("\\r"); case '\t' -> b.append("\\t"); default -> { if(c<32)b.append(String.format("\\u%04x",(int)c));else b.append(c); } }
        return b.append('"').toString();
    }
    static String json(Object value,int level) {
        if(value==null)return "null";
        if(value instanceof String s)return quote(s);
        if(value instanceof Number n)return Double.isFinite(n.doubleValue())?n.toString():"null";
        if(value instanceof Boolean)return value.toString();
        if(value.getClass().isArray()) { List<Object> list=new ArrayList<>(); for(int i=0;i<java.lang.reflect.Array.getLength(value);i++)list.add(java.lang.reflect.Array.get(value,i));return json(list,level); }
        if(value instanceof Map<?,?> m) {
            StringJoiner j=new StringJoiner(",\n","{\n","\n"+"  ".repeat(level)+"}");
            for(var e:m.entrySet())j.add("  ".repeat(level+1)+quote(e.getKey().toString())+": "+json(e.getValue(),level+1));return j.toString();
        }
        if(value instanceof Iterable<?> items) { StringJoiner j=new StringJoiner(", ","[","]");for(Object item:items)j.add(json(item,level));return j.toString(); }
        return quote(value.toString());
    }
}
