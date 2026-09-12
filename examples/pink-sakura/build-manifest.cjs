// Reproducible mask recipe for this particular reference, in original pixels.
// MIT; the reference artwork and resulting model use separate asset terms.
const fs = require('fs');
const path = require('path');
const root = __dirname;
const rect = (x,y,w,h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const body = JSON.parse(fs.readFileSync(path.join(root,'body-regions.json')));
const face = JSON.parse(fs.readFileSync(path.join(root,'face-regions.json')));
// Outer selection deliberately retains the original outline; a conservative
// border-connected white matte removes only the background around the head.
const head = [[334,225],[336,179],[337,149],[343,115],[354,92],[368,80],
 [384,75],[402,78],[420,60],[442,47],[434,45],[427,37],[427,27],
 [433,16],[446,8],[461,4],[476,6],[488,12],[499,23],[504,40],
 [521,38],[543,43],[566,53],[589,68],[608,88],[621,111],[632,135],
 [643,164],[650,193],[649,224],[640,251],[630,278],[616,297],
 [599,309],[579,312],[563,307],[535,317],[501,324],[473,315],
 [438,303],[421,306],[398,310],[377,305],[362,291],[347,265]];
function original(name, polygons, crop, z, extra={}) {
 return {name,path:'source/reference.png',source_polygons:polygons,
  source_mask_antialias:true,crop,x:crop[0],y:crop[1],z,...extra};
}
// Measurement files are intentionally separate from the exporter. A later
// correction updates its source contour, rather than changing an atlas by hand.
const manifest = {name:'PinkSakura',width:1024,height:1536,
 config:{atlas_size:2048,texture_padding:16,texture_edge_extrusion:16,
 mesh_spacing:16,source_pixel_head:true,source_closed_eyes:true,
 source_continuous_lid:true,source_lid_open_thickness:.3,
 source_eye_closure_depth:-8,head_strength:.22,body_strength:.25,
 head_roll_strength:.3,initial_head_angle_z:0,hair_follow_strength:.3,
 independent_hair_physics:true,hair_swing_strength:.07,
 cute_mouth_form:true,mouth_outline:false,tie_physics:false,
 face_bounds_override:[400,178,198,145]},layers:[]};
const layers = manifest.layers;
for (const layer of body.layers) {
 if (layer.name.startsWith('back hair-inner-')) continue;
 const clean = JSON.parse(JSON.stringify(layer));
 if (clean.name === 'topwear-original-visible') {
  // Retain the original cloth outside the actual hair footprints. The
  // generated body is only a local hidden fill, never a replacement portrait.
  clean.name = 'topwear';
  clean.source_holes = body.hidden_underpainting_required.flatMap(r=>r.footprint_polygons ?? []);
  const fillSelections=new Set(clean.source_holes.map(p=>JSON.stringify(p)));
  clean.source_alpha_holes=clean.source_alpha_holes.filter(p=>!fillSelections.has(JSON.stringify(p)));
  clean.source_hole_fill_image = {path:'source/body-underpainting-v1.png',
   source_rect:[0,0,1024,1536],canvas_rect:[10,116,983,1464],
   hole_indices:clean.source_holes.map((_,i)=>i),feather_px:1};
 }
 if(clean.name.startsWith('back hair-')) {
  // The complete generated base supplies hidden hair. These original outer
  // strands carry only visible hair, never leftover clothing/neck pixels.
  clean.source_alpha_holes.push(head,
   [[460,298],[540,298],[552,372],[444,372]],
   ...body.layers.filter(l=>l.name==='topwear-original-visible'||l.name.startsWith('front hair-')).flatMap(l=>l.source_polygons));
  clean.z=clean.name.includes('-arc-')?1:2;
 }
 layers.push(clean);
}
// Use the natural full silhouette, including actual curved strand tips. A
// manually truncated hidden plate exposes straight edges at large head rolls.
layers.push({name:'back hair-base',path:'source/rear-hair-underpainting-v1.png',
 crop:[0,100,1024,940],x:20,y:90,w:983,h:846,z:-1,
 // This pink/white plate has no intended green. Reject chroma-contaminated
 // source fringe texels before unmixing; otherwise clipping can turn them yellow.
 source_color_filter:{cool_min_blue:0,cool_max_red_blue:255,cool_max_green_blue:8},
 solid_background:'#00FF00',background_tolerance:32,auto_seed_matte:true,
 green_despill:true,neutral_green_despill:true,processing:{edge_width:3}});
const overlap = JSON.parse(fs.readFileSync(path.join(root,'body-topwear-patch.json')));
for (const update of overlap.layer_updates) {
 const layer=layers.find(item=>item.name===update.name);
 if (!layer) throw new Error(`Unknown overlap layer: ${update.name}`);
 Object.assign(layer,update.properties);
}
layers.push(original('neck',[[[472,303],[528,303],[530,328],[535,346],
 [523,357],[500,375],[478,353],[467,336]]],[460,301,80,76],19));
const features = ['r','l'].map(side=>face.reference[side]);
const lidFolds = features.map(f=>f.upper_lid_fold_polygon);
const eyeHoles = features.map(f=>f.eye_opening_polygon);
const lashHoles = features.map(f=>f.open_eyelash_polygon);
const mouth = face.reference.mouth_closed;
const allHoles=[...eyeHoles,...lashHoles,mouth.polygon,face.reference.r.open_eyelash_aux_polygon];
layers.push(original('face',[head],[325,0,343,342],30,{
 source_alpha_holes:body.background_head_alpha_holes,source_holes:allHoles,
 source_hole_expansions:[6,6,4,4,1,4],source_polygons_expand:1,
 source_hole_fill_image:{path:'source/eyeless-face-v1.png',source_rect:[0,0,1254,1254],
  canvas_rect:[300,0,400,400],hole_indices:[0,1,2,3,5],feather_px:3},
 source_skin_patch:{rect:mouth.skin_patch_rect_xywh,mode:'base',hole_indices:[4],contrast_floor:2}
}));
// Keep the original delicate upper-lid folds continuous. Thresholding them
// together with the dark moving lashes produces dotted brown fragments.
layers.push(original('face_detail-upper-lid-folds',lidFolds,[416,199,156,20],55,{
 source_mask_feather:.4,parent_deformer:'DeformFaceContour'}));
for (const side of ['r','l']) {
 const f=face.reference[side], g=face.generated_face[side];
 layers.push(original(`eyewhite-${side}`,[f.eye_opening_polygon],f.crop_xywh,40,{
  source_holes:[f.iris_polygon],source_holes_expand:2,
  source_hole_fill_sample:f.eyewhite_fill_sample,source_polygons_expand:1}));
 layers.push(original(`irides-${side}`,[f.iris_polygon],f.iris_crop_xywh,50,
  {source_polygons_expand:1}));
 layers.push(original(`eyelash-${side}`,[f.open_eyelash_polygon,...(f.open_eyelash_aux_polygon?[f.open_eyelash_aux_polygon]:[])],f.crop_xywh,60,{
  source_holes:[f.eye_opening_polygon],source_holes_expand:.5,source_polygons_expand:1,
  source_alpha_holes:[f.upper_lid_fold_polygon],
  source_color_filter:{dark_max:170,warm_min_red_green:18,warm_max_green:180}}));
 const [cx,cy,cw,ch]=g.closed_eyelash_crop_xywh;
 const target={x:Math.round(300+cx*400/1254),y:Math.round(cy*400/1254),
  w:Math.round(cw*400/1254),h:Math.round(ch*400/1254)};
 layers.push({name:`eye_close-${side}`,path:'source/face-parts-v1.png',
  source_polygons:[g.closed_eyelash_polygon],source_mask_antialias:true,
  source_color_filter:g.recommended_color_filter,
  crop:g.closed_eyelash_crop_xywh,...target,z:65});
 // Closed-pose contacts are calibrated to a shared baseline. The measured
 // open contacts remain in face-regions.json; openness=1 keeps original pixels.
 manifest.config[`source_eye_corners_${side}`]=f.eye_opening_contact_endpoints.map(([x])=>[x,232]);
 manifest.config[`source_closed_eye_corners_${side}`]=g.eye_opening_contact_endpoints.map(([x,y])=>
  [target.x+(x-cx)*target.w/cw,target.y+(y-cy)*target.h/ch]);
 manifest.config[`source_open_eye_curve_${side}`]=f.upper_lash_centerline_curve;
}
layers.push(original('mouth_close',[mouth.polygon],mouth.skin_patch_rect_xywh,62,{
 source_skin_patch:{rect:mouth.skin_patch_rect_xywh,mode:'feature',contrast_floor:2}}));
const mo=face.generated_face.mouth_open;
layers.push({name:'mouth_open',path:'source/face-parts-v1.png',
 source_polygons:[mo.outline_polygon],source_mask_antialias:true,source_mask_feather:1,
 crop:mo.crop_xywh,x:485,y:277,w:28,h:16,z:61});
if (process.argv.includes('--import-only')) manifest.import_only=true;
fs.writeFileSync(path.join(root,manifest.import_only?'manifest-import.json':'manifest.json'),
 JSON.stringify(manifest,null,2)+'\n');
console.log(`Prepared ${layers.length} layers for PinkSakura`);
