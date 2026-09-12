import java.awt.image.BufferedImage;
import java.nio.file.*;
import javax.imageio.ImageIO;

/** Technical alpha handling around dedicated NCNN RGB super-resolution; never changes the rig. */
public class AtlasAlpha {
    public static void main(String[] args) throws Exception {
        if (args.length < 3) throw new IllegalArgumentException("prepare atlas.png rgb.png | combine atlas.png neural-rgb.png rgba.png");
        BufferedImage src = ImageIO.read(Path.of(args[1]).toFile());
        int w = src.getWidth(), h = src.getHeight();
        int[] pixels = src.getRGB(0, 0, w, h, null, 0, w);
        if (args[0].equals("prepare")) {
            // Extend only RGB into transparent texels so the neural network does not see a black
            // background around white strands. The original alpha is read again during combine.
            int[] owner = new int[pixels.length], queue = new int[pixels.length];
            java.util.Arrays.fill(owner, -1);
            int head = 0, tail = 0;
            for (int i = 0; i < pixels.length; i++) if ((pixels[i] >>> 24) != 0) {
                owner[i] = i; queue[tail++] = i;
            }
            for (int depth = 0; depth < 32 && head < tail; depth++) {
                int end = tail;
                while (head < end) {
                    int i = queue[head++], x = i % w, y = i / w;
                    if (x > 0 && owner[i-1] < 0) { owner[i-1] = owner[i]; queue[tail++] = i-1; }
                    if (x+1 < w && owner[i+1] < 0) { owner[i+1] = owner[i]; queue[tail++] = i+1; }
                    if (y > 0 && owner[i-w] < 0) { owner[i-w] = owner[i]; queue[tail++] = i-w; }
                    if (y+1 < h && owner[i+w] < 0) { owner[i+w] = owner[i]; queue[tail++] = i+w; }
                }
            }
            int[] rgb = new int[pixels.length];
            for (int i = 0; i < pixels.length; i++) rgb[i] = owner[i] < 0 ? 0xffffff : pixels[owner[i]] & 0xffffff;
            BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
            out.setRGB(0, 0, w, h, rgb, 0, w);
            ImageIO.write(out, "png", Path.of(args[2]).toFile());
            System.out.println("Prepared RGB with 32px transparent-color extension: " + w + "x" + h);
        } else if (args[0].equals("combine") && args.length == 4) {
            BufferedImage rgb = ImageIO.read(Path.of(args[2]).toFile());
            int dw = rgb.getWidth(), dh = rgb.getHeight(), scale = dw / w;
            if (scale < 2 || scale > 4 || dw != w*scale || dh != h*scale) throw new IllegalArgumentException("Expected uniform integer 2/3/4x neural output");
            BufferedImage out = new BufferedImage(dw, dh, BufferedImage.TYPE_INT_ARGB);
            int[] row = new int[dw];
            double[][] weightsX = new double[dw][4];
            int[][] indicesX = new int[dw][4];
            for (int x = 0; x < dw; x++) {
                double px = (x+.5)/scale-.5; int bx = (int)Math.floor(px);
                for (int j = 0; j < 4; j++) { indicesX[x][j] = Math.max(0,Math.min(w-1,bx+j-1)); weightsX[x][j] = cubic(px-(bx+j-1)); }
            }
            for (int y = 0; y < dh; y++) {
                rgb.getRGB(0, y, dw, 1, row, 0, dw);
                double py = (y+.5)/scale-.5; int by = (int)Math.floor(py);
                double[] wy = new double[4]; int[] iy = new int[4];
                for (int j = 0; j < 4; j++) { iy[j] = Math.max(0,Math.min(h-1,by+j-1))*w; wy[j] = cubic(py-(by+j-1)); }
                for (int x = 0; x < dw; x++) {
                    double alpha = 0;
                    for (int j = 0; j < 4; j++) for (int k = 0; k < 4; k++) alpha += (pixels[iy[j]+indicesX[x][k]]>>>24)*wy[j]*weightsX[x][k];
                    int a = Math.max(0,Math.min(255,(int)Math.round(alpha)));
                    row[x] = (row[x]&0xffffff) | (a<<24);
                }
                out.setRGB(0, y, dw, 1, row, 0, dw);
            }
            ImageIO.write(out, "png", Path.of(args[3]).toFile());
            System.out.println("Combined neural RGB + independently bicubic alpha: " + dw + "x" + dh);
        } else throw new IllegalArgumentException("Unknown mode or arguments");
    }
    static double cubic(double value) {
        double x = Math.abs(value);
        if (x <= 1) return (1.5*x-2.5)*x*x+1;
        if (x < 2) return ((-.5*x+2.5)*x-4)*x+2;
        return 0;
    }
}
