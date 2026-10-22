import java.awt.image.BufferedImage;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;

/** MIT. Measured sprite registration; does not draw or invent artwork. */
public class PrepareArm {
    static double[][] points(String text) {
        return Arrays.stream(text.split(";")).map(p -> Arrays.stream(p.split(",")).mapToDouble(Double::parseDouble).toArray()).toArray(double[][]::new);
    }
    static double centre(double[][] line, double y) {
        for (int i=1;i<line.length;i++) if(y<=line[i][0]) {
            double t=(y-line[i-1][0])/(line[i][0]-line[i-1][0]);
            return line[i-1][1]*(1-t)+line[i][1]*t;
        }
        return line[line.length-1][1];
    }
    static int sample(BufferedImage im,double x,double y,int[] box) {
        int ix=(int)Math.floor(x),iy=(int)Math.floor(y);
        if(ix<box[0]||iy<box[1]||ix+1>=box[0]+box[2]||iy+1>=box[1]+box[3])return 0;
        double fx=x-ix,fy=y-iy,alpha=0;double[] rgb={0,0,0};
        for(int dy=0;dy<2;dy++)for(int dx=0;dx<2;dx++) {
            int c=im.getRGB(ix+dx,iy+dy),a=c>>>24;
            // Generated zero-alpha RGB is irrelevant; discard only near-zero matte dust.
            if(a<=3)continue;
            double weight=(dx==0?1-fx:fx)*(dy==0?1-fy:fy)*a;
            alpha+=weight;for(int k=0;k<3;k++)rgb[k]+=weight*((c>>>(16-8*k))&255);
        }
        if(alpha<.5)return 0;
        int result=((int)Math.round(alpha))<<24;
        for(int k=0;k<3;k++)result|=((int)Math.round(rgb[k]/alpha))<<(16-8*k);
        return result;
    }
    public static void main(String[] args)throws Exception {
        if(args.length!=9)throw new IllegalArgumentException("PrepareArm SOURCE OUTPUT NAME MODE BOX ANCHOR SCALE REST_AXIS CENTERLINE");
        var im=ImageIO.read(Path.of(args[0]).toFile());
        if(im.getWidth()!=1024||im.getHeight()!=1536||!im.getColorModel().hasAlpha())throw new IllegalArgumentException("Expected measured 1024x1536 RGBA sprite sheet");
        int[] box=Arrays.stream(args[4].split(",")).mapToInt(Integer::parseInt).toArray();
        double[] anchor=points(args[5])[0],scale=points(args[6])[0];
        double[][] axis=points(args[7]),line=points(args[8]);
        double vx=axis[1][0]-axis[0][0],vy=axis[1][1]-axis[0][1],length=Math.hypot(vx,vy),dx=vx/length,dy=vy/length;
        var out=new BufferedImage(1024,1536,BufferedImage.TYPE_INT_ARGB);
        int visible=0;
        for(int y=0;y<1536;y++)for(int x=0;x<1024;x++) {
            double px=x-axis[0][0],py=y-axis[0][1],along=px*dx+py*dy,across=px*dy-py*dx;
            double sx,sy;
            if(args[3].equals("sleeve")) {
                sy=anchor[1]+along/scale[1];sx=centre(line,sy)+across/scale[0];
            } else {
                // Hands point down the same relaxed arm axis; cuff hides the wrist root.
                sy=anchor[1]-(along-length)/scale[1];sx=anchor[0]-across/scale[0];
            }
            int color=sample(im,sx,sy,box);out.setRGB(x,y,color);if((color>>>24)>127)visible++;
        }
        if(visible<100)throw new IllegalArgumentException("Registration produced an empty sprite");
        Path target=Path.of(args[1]).resolve(args[2]+".png");Files.createDirectories(target.getParent());
        ImageIO.write(out,"png",target.toFile());System.out.println(args[2]+": opaque pixels="+visible);
    }
}
