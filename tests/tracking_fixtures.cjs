/* Synthetic MediaPipe result shapes for unit tests, never camera/inference evidence. */
function rotation({pitch=0,yaw=0,roll=0,scale=1}={}) {
  const [x,y,z]=[pitch,yaw,roll].map(v=>v*Math.PI/180);
  const cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
  return {rows:4,columns:4,data:[
    cy*cz*scale,cy*sz*scale,-sy*scale,0,
    (cz*sy*sx-sz*cx)*scale,(sz*sy*sx+cz*cx)*scale,cy*sx*scale,0,
    (cz*sy*cx+sz*sx)*scale,(sz*sy*cx-cz*sx)*scale,cy*cx*scale,0,
    12,25,-60,1,
  ]};
}
function faceFixture(scores={}, matrix=rotation()) {
  const names=['eyeBlinkLeft','eyeBlinkRight','jawOpen','mouthSmileLeft','mouthSmileRight',
    'eyeLookInLeft','eyeLookOutLeft','eyeLookUpLeft','eyeLookDownLeft',
    'eyeLookInRight','eyeLookOutRight','eyeLookUpRight','eyeLookDownRight',
    'browDownLeft','browDownRight','browInnerUp','browOuterUpLeft','browOuterUpRight'];
  const points=Array.from({length:478},()=>({x:.5,y:.5,z:0}));
  points[234].x=.2;points[454].x=.8;points[10].y=.15;points[152].y=.8;
  return {faceLandmarks:[points],facialTransformationMatrixes:[matrix],
    faceBlendshapes:[{categories:names.map(categoryName=>({categoryName,score:scores[categoryName]??0}))}]};
}
function poseFixture() {
  const landmarks=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:.99,presence:.99}));
  const worldLandmarks=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:.99,presence:.99}));
  landmarks[11]={x:.7,y:.3,z:0,visibility:.99,presence:.99};
  landmarks[12]={x:.3,y:.3,z:0,visibility:.99,presence:.99};
  landmarks[23]={x:.6,y:.8,z:0,visibility:.99,presence:.99};
  landmarks[24]={x:.4,y:.8,z:0,visibility:.99,presence:.99};
  worldLandmarks[11]={x:.2,y:-.5,z:0};worldLandmarks[12]={x:-.2,y:-.5,z:0};
  worldLandmarks[23]={x:.15,y:0,z:0};worldLandmarks[24]={x:-.15,y:0,z:0};
  return {landmarks:[landmarks],worldLandmarks:[worldLandmarks]};
}
module.exports={rotation,faceFixture,poseFixture};
