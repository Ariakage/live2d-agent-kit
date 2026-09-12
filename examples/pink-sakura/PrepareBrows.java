import java.awt.image.BufferedImage;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;

/** MIT. Source-pixel matte decomposition only: never generates or redraws a face. */
public class PrepareBrows {
    static int channel(int color,int shift){return (color>>>shift)&255;}
    static double center(double[][] curve,double x){
        for(int i=1;i<curve.length;i++) if(x<=curve[i][0]){
            double t=(x-curve[i-1][0])/(curve[i][0]-curve[i-1][0]);
            return curve[i-1][1]*(1-t)+curve[i][1]*t;
        }
        return curve[curve.length-1][1];
    }
    public static void main(String[] args)throws Exception{
        if(args.length!=4)throw new IllegalArgumentException("PrepareBrows SOURCE OUTPUT_DIR r:x,y;x,y... l:x,y;x,y...");
        var source=ImageIO.read(Path.of(args[0]).toFile());
        int w=source.getWidth(),h=source.getHeight();
        int[] original=source.getRGB(0,0,w,h,null,0,w),base=original.clone();
        Path output=Path.of(args[1]);Files.createDirectories(output);
        long changed=0;int maxReconstructionError=0;
        for(int side=2;side<4;side++){
            String[] specification=args[side].split(":",3);
            if(!Set.of("r","l").contains(specification[0]))throw new IllegalArgumentException("Invalid side");
            double[][] curve=Arrays.stream(specification[1].split(";")).map(p->Arrays.stream(p.split(",")).mapToDouble(Double::parseDouble).toArray()).toArray(double[][]::new);
            int[][] protectedColumns=specification.length<3?new int[0][]:Arrays.stream(specification[2].split(";")).map(p->Arrays.stream(p.split(",")).mapToInt(Integer::parseInt).toArray()).toArray(int[][]::new);
            int[] foreground=new int[original.length];
            for(int x=(int)Math.ceil(curve[0][0]);x<=Math.floor(curve[curve.length-1][0]);x++){
                boolean protectedHair=false;
                for(int[] range:protectedColumns)if(x>=range[0]&&x<=range[1])protectedHair=true;
                if(protectedHair)continue;
                double cy=center(curve,x);
                int top=(int)Math.floor(cy-4.5),bottom=(int)Math.ceil(cy+4.5);
                if(x<0||x>=w||top<0||bottom>=h)throw new IllegalArgumentException("Curve outside source");
                int upper=original[top*w+x],lower=original[bottom*w+x];
                // A strong crossing hair contour belongs to the stationary head.
                if(Math.abs(channel(upper,8)-channel(lower,8))>30)continue;
                for(int y=(int)Math.ceil(cy-2.8);y<=Math.floor(cy+2.8);y++){
                    int c=original[y*w+x];double t=(y-top)/(double)(bottom-top);
                    int[] b=new int[3],shifts={16,8,0};
                    double brightest=0;
                    for(int k=0;k<3;k++){
                        b[k]=(int)Math.round(channel(upper,shifts[k])*(1-t)+channel(lower,shifts[k])*t);
                        brightest=Math.max(brightest,channel(c,shifts[k])-b[k]);
                    }
                    if(b[1]-channel(c,8)<1.5||brightest>2)continue;
                    // Unmix original ink from its local base. Ignore positive/white
                    // residuals instead of putting compensating pale patches on a brow.
                    double opacity=0;
                    for(int k=0;k<3;k++)opacity=Math.max(opacity,(b[k]-channel(c,shifts[k]))/Math.max(1.0,b[k]-Math.min(80,channel(c,shifts[k]))));
                    int alpha=Math.max(1,Math.min(255,(int)Math.ceil(opacity*255)));
                    double a=alpha/255.0;int ink=alpha<<24,clean=0xff000000;
                    for(int k=0;k<3;k++){
                        int value=Math.max(0,Math.min(255,(int)Math.round((channel(c,shifts[k])-b[k]*(1-a))/a)));
                        ink|=value<<shifts[k];clean|=b[k]<<shifts[k];
                        maxReconstructionError=Math.max(maxReconstructionError,Math.abs((int)Math.round(value*a+b[k]*(1-a))-channel(c,shifts[k])));
                    }
                    foreground[y*w+x]=ink;base[y*w+x]=clean;changed++;
                }
            }
            var layer=new BufferedImage(w,h,BufferedImage.TYPE_INT_ARGB);layer.setRGB(0,0,w,h,foreground,0,w);
            ImageIO.write(layer,"png",output.resolve("eyebrow-"+specification[0]+"-v1.png").toFile());
        }
        var clean=new BufferedImage(w,h,BufferedImage.TYPE_INT_RGB);clean.setRGB(0,0,w,h,base,0,w);
        ImageIO.write(clean,"png",output.resolve("eyebrow-base-v1.png").toFile());
        System.out.println("Separated original eyebrow ink pixels="+changed+", max neutral reconstruction channel error="+maxReconstructionError);
    }
}
