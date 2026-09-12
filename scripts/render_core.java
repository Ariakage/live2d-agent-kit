// SPDX-License-Identifier: MIT
import com.live2d.sdk.cubism.core.*;
import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.nio.file.*;
import java.util.*;
import java.util.List;

/** Generic diagnostic rasterizer of geometry evaluated by a local official Core.
 * This is not the official Cubism renderer and does not evaluate physics3.json.
 */
public class render_core {
    static CubismDrawableView[] drawables;
    static List<BufferedImage> textures = new ArrayList<>();
    static int width, height;
    static Color background=null;
    static double scale, pixelsPerUnit, originX, originY, canvasHeight, margin;
    static Map<String,BufferedImage> masks = new HashMap<>();

    public static void main(String[] args) throws Exception {
        if(args.length == 1 && (args[0].equals("--help") || args[0].equals("-h"))) {
            usage(); return;
        }
        if(args.length < 3) {
            usage();
            System.exit(2);
        }
        Path mocPath=Path.of(args[0]), output=Path.of(args[1]);
        int maxSize=1800;
        int demoFrames=60;
        Path demoDir=null;
        Map<String,Float> values=new LinkedHashMap<>();
        for(int i=2;i<args.length;i++) {
            if(args[i].equals("--size"))maxSize=Integer.parseInt(optionValue(args,++i));
            else if(args[i].equals("--margin"))margin=Double.parseDouble(optionValue(args,++i));
            else if(args[i].equals("--background"))background=Color.decode(optionValue(args,++i));
            else if(args[i].equals("--demo-dir"))demoDir=Path.of(optionValue(args,++i));
            else if(args[i].equals("--frames"))demoFrames=Integer.parseInt(optionValue(args,++i));
            else if(args[i].equals("--set")) {
                for(String pair:optionValue(args,++i).split(",",-1)) {
                    String[] kv=pair.split("=",2);
                    if(kv.length!=2 || kv[0].isBlank() || kv[1].isBlank())throw new IllegalArgumentException("Expected --set ParameterId=value[,ParameterId=value]");
                    float value=Float.parseFloat(kv[1]);
                    if(!Float.isFinite(value))throw new IllegalArgumentException("Parameter value must be finite: "+kv[0]);
                    values.put(kv[0],value);
                }
            } else {
                if(args[i].startsWith("--"))throw new IllegalArgumentException("Unknown option: "+args[i]);
                Path texturePath=Path.of(args[i]);
                if(texturePath.toAbsolutePath().normalize().equals(output.toAbsolutePath().normalize()))throw new IllegalArgumentException("Output must not overwrite a texture input");
                BufferedImage image=ImageIO.read(texturePath.toFile());
                if(image==null)throw new IllegalArgumentException("Unreadable texture: "+args[i]);
                textures.add(image);
            }
        }
        if(textures.isEmpty())throw new IllegalArgumentException("At least one texture page is required, in Model3 Textures order");
        if(maxSize<1 || maxSize>4096)throw new IllegalArgumentException("--size must be between 1 and 4096");
        if(!Double.isFinite(margin) || margin<0 || margin>16384)throw new IllegalArgumentException("--margin must be finite and between 0 and 16384 canvas pixels");
        if(demoDir!=null && (demoFrames<2 || demoFrames>600))throw new IllegalArgumentException("--frames must be between 2 and 600");
        if(demoDir!=null && Files.exists(demoDir)) {
            if(!Files.isDirectory(demoDir))throw new IllegalArgumentException("--demo-dir must be a directory");
            try(var files=Files.list(demoDir)) {
                if(files.findAny().isPresent())throw new IllegalArgumentException("--demo-dir is nonempty; select a new diagnostic output directory");
            }
        }
        if(mocPath.toAbsolutePath().normalize().equals(output.toAbsolutePath().normalize()))throw new IllegalArgumentException("Output must not overwrite the source MOC3");
        byte[] bytes=Files.readAllBytes(mocPath);
        if(!Live2DCubismCore.hasMocConsistency(bytes))throw new IllegalStateException("Official native Core rejected MOC consistency");
        try(CubismMoc moc=CubismMoc.instantiate(bytes);CubismModel model=moc.instantiateModel()) {
            for(CubismParameterView p:model.getParameterViews())p.setValue(p.getDefaultValue());
            for(var e:values.entrySet()) {
                CubismParameterView p=model.findParameterView(e.getKey());
                if(p==null)throw new IllegalArgumentException("Unknown parameter: "+e.getKey());
                if(e.getValue()<p.getMinimumValue() || e.getValue()>p.getMaximumValue())throw new IllegalArgumentException("Parameter outside declared range: "+e.getKey()+" ("+p.getMinimumValue()+".."+p.getMaximumValue()+")");
                p.setValue(e.getValue());
            }
            model.update();
            drawables=model.getDrawableViews();
            CubismCanvasInfo canvas=model.getCanvasInfo();
            float[] size=canvas.getSizeInPixels(),origin=canvas.getOriginInPixels();
            pixelsPerUnit=canvas.getPixelsPerUnit();originX=origin[0];originY=origin[1];canvasHeight=size[1];
            if(!Float.isFinite(size[0]) || !Float.isFinite(size[1]) || size[0]<=0 || size[1]<=0 || !Double.isFinite(pixelsPerUnit) || pixelsPerUnit<=0 || !Double.isFinite(originX) || !Double.isFinite(originY))throw new IllegalStateException("Invalid model canvas metadata");
            scale=Math.min(1.0,maxSize/(Math.max(size[0],size[1])+2*margin));
            width=Math.max(1,(int)Math.round((size[0]+2*margin)*scale));height=Math.max(1,(int)Math.round((size[1]+2*margin)*scale));
            if(output.toAbsolutePath().getParent()!=null)Files.createDirectories(output.toAbsolutePath().getParent());
            ImageIO.write(renderFrame(model),"PNG",output.toFile());
            System.out.println("Rendered "+drawables.length+" meshes at "+width+"x"+height+" using native Core "+Live2DCubismCore.getVersion()+": "+output.toAbsolutePath());
            if(demoDir!=null) {
                Files.createDirectories(demoDir);
                StringBuilder manifest=new StringBuilder("{\"source\":\"official-native-core-parameter-demo\",\"durationSeconds\":6,\"frameCount\":"+demoFrames+",\"fps\":"+(demoFrames/6.0)+",\"trackingTested\":false,\"frames\":[\n");
                for(int frame=0;frame<demoFrames;frame++) {
                    double t=frame/(double)demoFrames,phase=2*Math.PI*t;
                    for(CubismParameterView p:model.getParameterViews())p.setValue(p.getDefaultValue());
                    animate(model,"ParamAngleX","PARAM_ANGLE_X",0.75*Math.sin(phase));
                    animate(model,"ParamAngleY","PARAM_ANGLE_Y",0.60*Math.sin(phase*2));
                    animate(model,"ParamAngleZ","PARAM_ANGLE_Z",0.38*Math.sin(phase));
                    animate(model,"ParamBodyAngleX","PARAM_BODY_ANGLE_X",0.20*Math.sin(phase-0.2));
                    animate(model,"ParamBodyAngleZ","PARAM_BODY_ANGLE_Z",0.12*Math.sin(phase-0.4));
                    animate(model,"ParamEyeBallX","PARAM_EYE_BALL_X",0.30*Math.sin(phase));
                    animate(model,"ParamEyeBallY","PARAM_EYE_BALL_Y",0.18*Math.sin(phase*2));
                    animate(model,"ParamHairFront","PARAM_HAIR_FRONT",0.65*Math.sin(phase*2-0.4));
                    animate(model,"ParamHairBack","PARAM_HAIR_BACK",0.60*Math.sin(phase-0.7));
                    // Independent strand outputs are explicit demo inputs, not a simulation of
                    // physics3.json. Different phases make each exported mesh response reviewable.
                    int strandIndex=0;
                    for(CubismParameterView p:model.getParameterViews()) {
                        String id=p.getId();
                        if(id.endsWith("Swing") && (id.startsWith("ParamFrontHair")||id.startsWith("ParamBackHair"))) {
                            boolean rear=id.startsWith("ParamBackHair");
                            animate(model,id,id,(rear?0.60:0.50)*Math.sin(phase*(rear?1:2)-0.35-strandIndex*0.19));
                            strandIndex++;
                        }
                    }
                    animate(model,"ParamMouthForm","PARAM_MOUTH_FORM",0.45+0.25*Math.sin(phase));
                    animate(model,"ParamTieSwing","PARAM_TIE_SWING",0.55*Math.sin(phase*2-0.9));
                    fraction(model,"ParamBreath","PARAM_BREATH",(1-Math.cos(phase))/2);
                    fraction(model,"ParamMouthOpenY","PARAM_MOUTH_OPEN_Y",0.80*Math.pow(Math.sin(phase*2),2));
                    double blink=Math.max(pulse(t,0.2,0.040),pulse(t,0.7,0.040));
                    fraction(model,"ParamEyeLOpen","PARAM_EYE_L_OPEN",1-blink);
                    fraction(model,"ParamEyeROpen","PARAM_EYE_R_OPEN",1-blink);
                    // Manual settings deliberately pin those parameters throughout the demo.
                    // They were checked against this model's IDs/ranges before the first frame.
                    for(var e:values.entrySet())model.findParameterView(e.getKey()).setValue(e.getValue());
                    model.update();
                    for(CubismDrawableView d:drawables)for(float value:d.getVertexPositions())if(!Float.isFinite(value))throw new IllegalStateException("Nonfinite demo vertex at frame "+frame+" in "+d.getId());
                    ImageIO.write(renderFrame(model),"PNG",demoDir.resolve(String.format("frame_%03d.png",frame)).toFile());
                    if(frame>0)manifest.append(",\n");
                    manifest.append("{\"index\":").append(frame).append(",\"timeSeconds\":").append(t*6).append(",\"parameters\":{");
                    boolean first=true;
                    for(CubismParameterView p:model.getParameterViews()) { if(!first)manifest.append(',');first=false;manifest.append('"').append(p.getId().replace("\\","\\\\").replace("\"","\\\"")).append("\":").append(p.getValue()); }
                    manifest.append("}}");
                    if(frame%10==0)System.out.println("Demo frame "+frame+"/"+demoFrames);
                }
                Files.writeString(demoDir.resolve("frames.json"),manifest.append("\n]}\n").toString());
                System.out.println("Rendered "+demoFrames+" frames for a 6-second cyclic parameter demo: "+demoDir.toAbsolutePath());
            }
            System.out.println("Diagnostic only: Java2D triangle sampling/clipping approximates rendering. Blend modes, multiply/screen colors and Cubism edge behavior are not reproduced exactly; physics3.json and tracking are not evaluated. Confirm appearance in a real Cubism renderer.");
        }
    }
    static void usage() {
        System.err.println("Usage: render_core model.moc3 output.png atlas0.png [atlas1.png ...] [--size 1800] [--margin 0] [--background '#FFFFFF'] [--set ParameterId=value,...] [--demo-dir frames --frames 60]");
        System.err.println("Canvas size/origin and parameter ranges come from the model. Missing standard demo parameters are skipped; explicit --set IDs must exist. --size is a maximum output dimension (no upscaling). No camera or physics simulation.");
    }
    static String optionValue(String[] args,int index) {
        if(index>=args.length)throw new IllegalArgumentException("Missing value for "+args[index-1]);
        return args[index];
    }
    static double pulse(double t,double center,double width) { double x=Math.abs(t-center);return x>=width?0:(1+Math.cos(Math.PI*x/width))/2; }
    static CubismParameterView parameter(CubismModel model,String id,String legacy) { CubismParameterView p=model.findParameterView(id);return p!=null?p:model.findParameterView(legacy); }
    static void animate(CubismModel model,String id,String legacy,double normalized) {
        CubismParameterView p=parameter(model,id,legacy);if(p==null)return;
        float d=p.getDefaultValue();p.setValue((float)(d+normalized*(normalized>=0?p.getMaximumValue()-d:d-p.getMinimumValue())));
    }
    static void fraction(CubismModel model,String id,String legacy,double fraction) {
        CubismParameterView p=parameter(model,id,legacy);if(p!=null)p.setValue((float)(p.getMinimumValue()+(p.getMaximumValue()-p.getMinimumValue())*fraction));
    }
    static BufferedImage renderFrame(CubismModel model) {
            masks.clear();
            BufferedImage frame=blank();Graphics2D g=graphics(frame);
            if(background!=null){g.setColor(background);g.fillRect(0,0,width,height);}
            Integer[] order=new Integer[drawables.length];for(int i=0;i<order.length;i++)order[i]=i;
            int[] renderOrders=model.getRenderOrders();
            Arrays.sort(order,Comparator.comparingInt(i->renderOrders.length==drawables.length?renderOrders[i]:drawables[i].getDrawOrder()));
            for(int index:order) {
                CubismDrawableView d=drawables[index];
                if(d.getOpacity()<=0)continue;
                if(d.getTextureIndex()<0||d.getTextureIndex()>=textures.size())throw new IllegalArgumentException("Missing texture index "+d.getTextureIndex());
                BufferedImage layer=blank();Graphics2D layerGraphics=graphics(layer);
                layerGraphics.setComposite(AlphaComposite.SrcOver.derive(Math.max(0,Math.min(1,d.getOpacity()))));
                paintTriangles(layerGraphics,d);
                if(d.getMasks().length>0) {
                    String key=Arrays.toString(d.getMasks());BufferedImage mask=masks.get(key);
                    if(mask==null) {
                        mask=blank();Graphics2D mg=graphics(mask);
                        for(int maskIndex:d.getMasks()) {
                            if(maskIndex<0 || maskIndex>=drawables.length)throw new IllegalStateException("Invalid mask index in "+d.getId());
                            paintTriangles(mg,drawables[maskIndex]);
                        }
                        mg.dispose();masks.put(key,mask);
                    }
                    boolean inverted=(d.getConstantFlag()&CubismDrawableFlag.ConstantFlag.IS_INVERTED_MASK)!=0;
                    layerGraphics.setComposite(inverted?AlphaComposite.DstOut:AlphaComposite.DstIn);
                    layerGraphics.drawImage(mask,0,0,null);
                }
                layerGraphics.dispose();g.drawImage(layer,0,0,null);
            }
            g.dispose();
            return frame;
    }
    static BufferedImage blank(){return new BufferedImage(width,height,BufferedImage.TYPE_INT_ARGB);}
    static Graphics2D graphics(BufferedImage image) {
        Graphics2D g=image.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        // Binary triangle clips avoid translucent cracks along internal mesh edges.
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING,RenderingHints.VALUE_ANTIALIAS_OFF);
        return g;
    }
    static void paintTriangles(Graphics2D g,CubismDrawableView d) {
        int textureIndex=d.getTextureIndex();if(textureIndex<0||textureIndex>=textures.size())return;
        BufferedImage texture=textures.get(textureIndex);
        float[] v=d.getVertexPositions(),uv=d.getVertexUvs();short[] indices=d.getIndices();
        for(int i=0;i+2<indices.length;i+=3) {
            int ia=Short.toUnsignedInt(indices[i])*2,ib=Short.toUnsignedInt(indices[i+1])*2,ic=Short.toUnsignedInt(indices[i+2])*2;
            if(Math.max(ia,Math.max(ib,ic))+1>=v.length || Math.max(ia,Math.max(ib,ic))+1>=uv.length)throw new IllegalStateException("Invalid vertex/UV index in "+d.getId());
            for(int p:new int[]{ia,ib,ic})if(!Float.isFinite(v[p]) || !Float.isFinite(v[p+1]) || !Float.isFinite(uv[p]) || !Float.isFinite(uv[p+1]))throw new IllegalStateException("Non-finite vertex/UV in "+d.getId());
            double ax=(margin+originX+v[ia]*pixelsPerUnit)*scale,ay=(margin+canvasHeight-originY-v[ia+1]*pixelsPerUnit)*scale;
            double bx=(margin+originX+v[ib]*pixelsPerUnit)*scale,by=(margin+canvasHeight-originY-v[ib+1]*pixelsPerUnit)*scale;
            double cx=(margin+originX+v[ic]*pixelsPerUnit)*scale,cy=(margin+canvasHeight-originY-v[ic+1]*pixelsPerUnit)*scale;
            double ta=uv[ia]*texture.getWidth(),sa=(1-uv[ia+1])*texture.getHeight();
            double tb=uv[ib]*texture.getWidth(),sb=(1-uv[ib+1])*texture.getHeight();
            double tc=uv[ic]*texture.getWidth(),sc=(1-uv[ic+1])*texture.getHeight();
            double det=(tb-ta)*(sc-sa)-(tc-ta)*(sb-sa);if(Math.abs(det)<1e-10)continue;
            double m00=((bx-ax)*(sc-sa)-(cx-ax)*(sb-sa))/det;
            double m01=((cx-ax)*(tb-ta)-(bx-ax)*(tc-ta))/det;
            double m10=((by-ay)*(sc-sa)-(cy-ay)*(sb-sa))/det;
            double m11=((cy-ay)*(tb-ta)-(by-ay)*(tc-ta))/det;
            AffineTransform transform=new AffineTransform(m00,m10,m01,m11,ax-m00*ta-m01*sa,ay-m10*ta-m11*sa);
            Path2D triangle=new Path2D.Double();triangle.moveTo(ax,ay);triangle.lineTo(bx,by);triangle.lineTo(cx,cy);triangle.closePath();
            g.setClip(triangle);g.drawImage(texture,transform,null);
        }
        g.setClip(null);
    }
}
