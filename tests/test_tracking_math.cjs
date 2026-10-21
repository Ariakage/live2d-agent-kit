const {test}=require('node:test');
const assert=require('node:assert/strict');
const {rotation,faceFixture,poseFixture}=require('./tracking_fixtures.cjs');
const math=()=>import('../templates/web-preview/tracking-math.js');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('column-major transform extracts all three signed angles and ignores translation/uniform scale',async()=>{
  const {matrixToHeadAngles}=await math();
  for(const scale of [1,2.5]) {
    const r=matrixToHeadAngles(rotation({pitch:12,yaw:23,roll:-17,scale}));
    close(r.FaceAngleX,23);close(r.FaceAngleY,-12);close(r.FaceAngleZ,17);
  }
});
test('invalid, reflected, sheared and singular transform matrices do not yield a plausible head pose',async()=>{
  const {matrixToHeadAngles}=await math();
  assert.equal(matrixToHeadAngles({rows:4,columns:4,data:Array(16).fill(0)}),null);
  let m=rotation();m.data[0]=NaN;assert.equal(matrixToHeadAngles(m),null);
  m=rotation();m.data[0]=-1;assert.equal(matrixToHeadAngles(m),null);
  m=rotation();m.data[4]=.8;assert.equal(matrixToHeadAngles(m),null);
  assert.equal(matrixToHeadAngles(rotation({yaw:90})),null);
});
test('blink/gaze/brows keep anatomical sides and mouth scores stay bounded',async()=>{
  const {faceResultToInputs}=await math();
  const r=faceResultToInputs(faceFixture({eyeBlinkLeft:1,eyeLookOutLeft:.4,eyeLookInRight:.3,
    eyeLookUpLeft:.6,mouthSmileLeft:1.5,mouthSmileRight:.5,jawOpen:1.2,browDownLeft:.7,browOuterUpRight:1}));
  assert.equal(r.visible,true);assert.equal(r.inputs.EyeOpenLeft,0);assert.equal(r.inputs.EyeOpenRight,1);
  close(r.inputs.EyeLeftX,.4);close(r.inputs.EyeRightX,.3);close(r.inputs.EyeLeftY,.6);
  close(r.inputs.BrowLeftY,-.7);close(r.inputs.BrowRightY,.45);
  close(r.inputs.MouthSmile,.75);close(r.inputs.MouthOpen,1);
});
test('missing face, nonfinite expressions and off-screen landmarks invalidate the face instead of retaining it',async()=>{
  const {faceResultToInputs}=await math();
  assert.equal(faceResultToInputs({faceLandmarks:[]}).visible,false);
  assert.equal(faceResultToInputs(faceFixture({jawOpen:NaN})).visible,false);
  const face=faceFixture();face.faceLandmarks[0][1].x=2;
  assert.equal(faceResultToInputs(face).visible,false);
});
test('pose uses visible shoulders and requires hips only for pitch',async()=>{
  const {poseResultToInputs}=await math();const pose=poseFixture();
  pose.worldLandmarks[0][11].z=-.1;pose.worldLandmarks[0][12].z=.1;
  let r=poseResultToInputs(pose);assert.equal(r.visible,true);assert.ok(r.inputs.MocopiBodyAngleX>20);assert.equal(r.pitchAvailable,true);
  pose.landmarks[0][23].visibility=.1;r=poseResultToInputs(pose);
  assert.equal(r.visible,true);assert.equal(r.pitchAvailable,false);assert.equal(r.inputs.MocopiBodyAngleY,0);
  pose.landmarks[0][11].presence=.1;assert.equal(poseResultToInputs(pose).visible,false);
});
test('pose NaN and reversed/degenerate shoulders cannot generate body rotation',async()=>{
  const {poseResultToInputs}=await math();const pose=poseFixture();
  pose.landmarks[0][12].x=NaN;assert.equal(poseResultToInputs(pose).visible,false);
  const reversed=poseFixture();reversed.landmarks[0][11].x=.2;assert.equal(poseResultToInputs(reversed).visible,false);
  const invalidDepth=poseFixture();invalidDepth.worldLandmarks[0][11].z=NaN;
  assert.equal(poseResultToInputs(invalidDepth).visible,false);
  const invalidConfidence=poseFixture();invalidConfidence.landmarks[0][11].presence=NaN;
  assert.equal(poseResultToInputs(invalidConfidence).visible,false);
  const withoutWorld=poseFixture();delete withoutWorld.worldLandmarks;
  assert.equal(poseResultToInputs(withoutWorld).visible,true);
});
test('loss, expired timestamps, future timestamps and disabled body return finite neutral inputs',async()=>{
  const {TrackingMapper,neutralTrackingInputs}=await math();const mapper=new TrackingMapper();
  mapper.update({faceResult:faceFixture({},rotation({yaw:25})),poseResult:poseFixture(),faceTimestamp:100,poseTimestamp:100,timestamp:100});
  for(const timestamp of [500,90,NaN]) {
    const r=mapper.update({faceResult:faceFixture(),poseResult:poseFixture(),faceTimestamp:100,poseTimestamp:100,timestamp});
    assert.equal(r.faceVisible,false);assert.equal(r.bodyVisible,false);assert.deepEqual(r.inputs,neutralTrackingInputs());
  }
  const r=mapper.update({faceResult:faceFixture(),poseResult:poseFixture(),faceTimestamp:600,poseTimestamp:600,timestamp:600,bodyEnabled:false});
  assert.equal(r.faceVisible,true);assert.equal(r.bodyVisible,false);assert.equal(r.inputs.MocopiBodyAngleZ,0);
});
test('calibration removes pose/expression offsets without changing left-eye closure or producing stale calibration',async()=>{
  const {TrackingMapper}=await math();const mapper=new TrackingMapper();
  const baseline=faceFixture({jawOpen:.1,eyeBlinkLeft:.1,eyeLookOutLeft:.2,browDownLeft:.2},rotation({yaw:12,pitch:5,roll:3}));
  mapper.update({faceResult:baseline,faceTimestamp:1000,timestamp:1000,bodyEnabled:false});
  assert.equal(mapper.calibrate(1001).ok,true);
  const r=mapper.update({faceResult:baseline,faceTimestamp:1050,timestamp:1050,bodyEnabled:false});
  close(r.inputs.FaceAngleX,0);close(r.inputs.FaceAngleY,0);close(r.inputs.FaceAngleZ,0);
  close(r.inputs.MouthOpen,0);close(r.inputs.EyeOpenLeft,1);close(r.inputs.EyeLeftX,0);close(r.inputs.BrowLeftY,0);
  const blink=faceFixture({eyeBlinkLeft:1},rotation({yaw:12}));
  close(mapper.update({faceResult:blink,faceTimestamp:1100,timestamp:1100}).inputs.EyeOpenLeft,0);
  assert.equal(mapper.calibrate(1500).ok,false);
});
test('calibration rejects closed eyes/open mouth and cannot retain body calibration across reset',async()=>{
  const {TrackingMapper}=await math();const mapper=new TrackingMapper();
  mapper.update({faceResult:faceFixture({eyeBlinkRight:.95}),faceTimestamp:10,timestamp:10});
  assert.equal(mapper.calibrate(11).ok,false);
  mapper.update({faceResult:faceFixture({jawOpen:.8}),faceTimestamp:20,timestamp:20});
  assert.equal(mapper.calibrate(21).ok,false);
  mapper.update({faceResult:faceFixture(),poseResult:poseFixture(),faceTimestamp:30,poseTimestamp:30,timestamp:30});
  assert.equal(mapper.calibrate(31).body,true);mapper.reset();
  assert.equal(mapper.faceCalibrated,false);assert.equal(mapper.bodyCalibrated,false);assert.equal(mapper.calibrate(40).ok,false);
});

function upperBodyFixture() {
  const pose=poseFixture();
  pose.landmarks[0][13]={x:.7,y:.58,z:0,visibility:.99,presence:.99};
  pose.landmarks[0][14]={x:.3,y:.58,z:0,visibility:.99,presence:.99};
  return pose;
}
function bodyUpdate(mapper,pose,timestamp,face=faceFixture()) {
  return mapper.update({faceResult:face,poseResult:pose,faceTimestamp:timestamp,poseTimestamp:timestamp,timestamp});
}
test('six body proxies begin at neutral and map relative shoulder, chest, waist and independent arm movement',async()=>{
  const {TrackingMapper}=await math(),mapper=new TrackingMapper(),base=upperBodyFixture();
  const initial=bodyUpdate(mapper,base,10);
  for(const key of Object.keys(initial.inputs).filter(k=>k.startsWith('Body'))) close(initial.inputs[key],0);
  const lifted=upperBodyFixture();lifted.landmarks[0][11].y-=.05;
  assert.ok(bodyUpdate(mapper,lifted,20).inputs.BodyShoulderLiftL>0);
  const expanded=upperBodyFixture();expanded.worldLandmarks[0][11].x+=.04;expanded.worldLandmarks[0][12].x-=.04;
  assert.ok(bodyUpdate(mapper,expanded,30).inputs.BodyChestExpand>0);
  const shifted=upperBodyFixture();shifted.landmarks[0][23].x+=.04;shifted.landmarks[0][24].x+=.04;
  assert.ok(bodyUpdate(mapper,shifted,40).inputs.BodyWaistSway>0);
  const arms=upperBodyFixture();arms.landmarks[0][13].x+=.12;arms.landmarks[0][14].x-=.06;
  const result=bodyUpdate(mapper,arms,50).inputs;
  assert.ok(result.BodyUpperArmLSwing>result.BodyUpperArmRSwing && result.BodyUpperArmRSwing>0);
  assert.equal(mapper.calibrate(51).ok,true);
  for(const key of Object.keys(result).filter(k=>k.startsWith('Body'))) close(bodyUpdate(mapper,arms,60).inputs[key],0);
});
test('body-only detection works and partial landmark loss neutralizes only unavailable body proxies',async()=>{
  const {TrackingMapper}=await math(),mapper=new TrackingMapper();
  bodyUpdate(mapper,upperBodyFixture(),10);
  const pose=upperBodyFixture();pose.landmarks[0][13].x+=.12;pose.landmarks[0][14].x-=.12;
  let frame=bodyUpdate(mapper,pose,20,{});
  assert.equal(frame.faceVisible,false);assert.equal(frame.bodyVisible,true);assert.ok(frame.inputs.BodyUpperArmLSwing>0);
  pose.landmarks[0][13].visibility=.1;pose.landmarks[0][23].visibility=.1;
  frame=bodyUpdate(mapper,pose,30,{});
  assert.equal(frame.inputs.BodyUpperArmLSwing,0);assert.ok(frame.inputs.BodyUpperArmRSwing>0);
  for(const id of ['BodyShoulderLiftL','BodyShoulderLiftR','BodyChestExpand','BodyWaistSway']) assert.equal(frame.inputs[id],0);
  pose.landmarks[0][12].visibility=.1;
  frame=bodyUpdate(mapper,pose,40);
  assert.equal(frame.bodyVisible,false);
  for(const key of Object.keys(frame.inputs).filter(k=>k.startsWith('Body'))) assert.equal(frame.inputs[key],0);
});
test('relative body proxies resist uniform camera zoom and clear calibration across reset',async()=>{
  const {TrackingMapper}=await math(),mapper=new TrackingMapper(),pose=upperBodyFixture();
  bodyUpdate(mapper,pose,10);
  for(const point of pose.landmarks[0]) {point.x=.5+(point.x-.5)*.8;point.y=.5+(point.y-.5)*.8;point.z*=.8;}
  for(const point of pose.worldLandmarks[0]) for(const axis of ['x','y','z']) point[axis]*=.8;
  let frame=bodyUpdate(mapper,pose,20);
  for(const key of Object.keys(frame.inputs).filter(k=>k.startsWith('Body'))) close(frame.inputs[key],0);
  pose.landmarks[0][13].x+=.15;assert.ok(bodyUpdate(mapper,pose,30).inputs.BodyUpperArmLSwing>0);
  mapper.reset();frame=bodyUpdate(mapper,pose,40);
  for(const key of Object.keys(frame.inputs).filter(k=>k.startsWith('Body'))) close(frame.inputs[key],0);
});
