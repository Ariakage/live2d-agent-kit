import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.nio.file.*;
import java.util.*;
import java.util.List;
import java.util.function.Consumer;
import javax.imageio.ImageIO;

/** MIT: original geometric test fixture, not a finished character illustration. */
public class GenerateExample {
    static final int W=512,H=768;
    static Path output;
    static final List<String> layers=new ArrayList<>();
    static void layer(String name,int order,Consumer<Graphics2D> draw)throws Exception {
        BufferedImage im=new BufferedImage(W,H,BufferedImage.TYPE_INT_ARGB);
        Graphics2D g=im.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING,RenderingHints.VALUE_ANTIALIAS_ON);
        draw.accept(g);g.dispose();
        String filename=name.replace(' ','_')+".png";
        ImageIO.write(im,"png",output.resolve(filename).toFile());
        layers.add("{\"name\":\""+name+"\",\"path\":\""+filename+"\",\"x\":0,\"y\":0,\"z\":"+order+"}");
    }
    static void shape(Graphics2D g,String color,Shape shape){g.setColor(Color.decode(color));g.fill(shape);}
    public static void main(String[] args)throws Exception{
        if(args.length!=1)throw new IllegalArgumentException("Usage: java --source 21 GenerateExample.java NEW_OUTPUT_DIR");
        output=Path.of(args[0]).toAbsolutePath();
        if(Files.exists(output)){try(var s=Files.list(output)){if(s.findAny().isPresent())throw new IllegalArgumentException("Output must be empty");}}
        Files.createDirectories(output);
        layer("back hair",0,g->shape(g,"#6b87ad",new RoundRectangle2D.Double(158,110,196,330,120,120)));
        layer("body",10,g->shape(g,"#f4cfb5",new RoundRectangle2D.Double(230,270,52,100,20,20)));
        layer("topwear",20,g->{shape(g,"#304e69",new RoundRectangle2D.Double(168,320,176,310,70,70));
            shape(g,"#a0ccde",new RoundRectangle2D.Double(197,415,20,150,10,10));
            shape(g,"#a0ccde",new RoundRectangle2D.Double(295,415,20,150,10,10));});
        layer("neckwear",25,g->shape(g,"#63bec6",new Polygon(new int[]{245,269,278,256,234},new int[]{337,337,444,467,444},5)));
        layer("face",30,g->shape(g,"#f4cfb5",new Ellipse2D.Double(176,112,160,198)));
        for(String side:List.of("r","l")){
            int x=side.equals("r")?195:266;
            layer("eyebrow-"+side,55,g->{g.setColor(Color.decode("#496482"));g.setStroke(new BasicStroke(3,BasicStroke.CAP_ROUND,BasicStroke.JOIN_ROUND));
                g.draw(new Arc2D.Double(x+3,171,44,17,15,150,Arc2D.OPEN));});
            layer("eyewhite-"+side,40,g->shape(g,"#ffffff",new Ellipse2D.Double(x,193,50,35)));
            layer("irides-"+side,50,g->{shape(g,side.equals("r")?"#8367a6":"#378997",new Ellipse2D.Double(x+16,195,21,30));
                shape(g,"#ffffff",new Ellipse2D.Double(x+23,199,6,6));});
            layer("eyelash-"+side,60,g->{g.setColor(Color.decode("#334353"));g.setStroke(new BasicStroke(4,BasicStroke.CAP_ROUND,BasicStroke.JOIN_ROUND));
                g.draw(new Arc2D.Double(x,190,50,36,10,160,Arc2D.OPEN));});
        }
        layer("mouth_open",61,g->shape(g,"#99566a",new Ellipse2D.Double(246,246,20,26)));
        layer("mouth_close",62,g->{g.setColor(Color.decode("#99566a"));g.setStroke(new BasicStroke(3,BasicStroke.CAP_ROUND,BasicStroke.JOIN_ROUND));
            g.draw(new Arc2D.Double(242,247,28,12,185,170,Arc2D.OPEN));});
        layer("front hair",65,g->shape(g,"#94b7ce",new Polygon(new int[]{166,190,236,278,320,344,322,296,277,253,235,211,187},new int[]{177,112,93,99,122,180,169,142,182,136,175,142,175},13)));
        String manifest="{\n\"name\":\"Minimal\",\n\"width\":512,\"height\":768,\n\"config\":{\"atlas_size\":1024,\"mesh_spacing\":16,\"head_strength\":0.2,\"body_strength\":0.3,\"independent_hair_physics\":true,\"texture_padding\":16,\"texture_edge_extrusion\":16},\n\"layers\":[\n"+String.join(",\n",layers)+"\n]}\n";
        Files.writeString(output.resolve("manifest.json"),manifest);
        System.out.println("Generated "+layers.size()+" original fixture layers: "+output.resolve("manifest.json"));
    }
}
