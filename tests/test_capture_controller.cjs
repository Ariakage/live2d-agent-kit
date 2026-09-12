/* Controller contract only: these fixtures do not claim camera or Core execution. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
let raf=0,lastTick;global.requestAnimationFrame=callback=>{lastTick=callback;return ++raf;};global.cancelAnimationFrame=()=>{};
async function fixture(options={}){
 const {CaptureController}=await import('../templates/web-preview/capture-controller.js');
 const descriptors=[{id:'ParamAngleX',min:-30,max:30,default:0},{id:'ParamEyeLOpen',min:0,max:1,default:1},{id:'ParamEyeROpen',min:0,max:1,default:1},{id:'ParamBrowLY',min:-1,max:1,default:0},{id:'ParamBrowRY',min:-1,max:1,default:0},{id:'ParamBodyAngleZ',min:-10,max:10,default:0},{id:'ParamBreath',min:0,max:1,default:0},{id:'ParamEyeBallForm',min:-1,max:1,default:.2},{id:'ParamTieSwing',min:-1,max:1,default:0}];
 let params=Object.fromEntries(descriptors.map(p=>[p.id,p.default])),released=0,lastCapture={},captureWrites=0;
 const viewer={getParameters:()=>descriptors,getState:()=>({parameters:{...params}}),setCaptureParameters(p){lastCapture={...p};captureWrites++;Object.assign(params,p);},clearCaptureParameters(){},clearParameters(){},setParameter:(id,v)=>params[id]=v,renderNow(){},setAutoPlay(){},setPointerFollow(){},setExpression(){}};
 const controller=new CaptureController({...options,getViewer:()=>viewer,onSourceStop:()=>released++});controller.setOptions({smoothing:0});
 return {controller,viewer,params,get released(){return released;},get lastCapture(){return lastCapture;},get captureWrites(){return captureWrites;}};
}
test('camera frames independently map eyebrows and reset missing body without synthetic breathing',async()=>{
 const {controller:c,params}=await fixture();c.startCameraInput();
 assert.equal(c.updateCameraFrame({timestamp:10,faceVisible:true,bodyVisible:false,inputs:{BrowLeftY:.7,BrowRightY:-.4,FaceAngleX:15,EyeOpenLeft:0,MocopiBodyAngleZ:9}}),true);c.apply(.016,true);
 assert.equal(params.ParamBrowLY,.7);assert.equal(params.ParamBrowRY,-.4);assert.equal(params.ParamEyeLOpen,0);assert.equal(params.ParamBodyAngleZ,0);assert.equal(params.ParamBreath,0);
 assert.equal(c.updateCameraFrame({timestamp:9,faceVisible:true,inputs:{FaceAngleX:-30}}),false);assert.equal(params.ParamAngleX,15);
});
test('loss, NaN and stale camera input return native defaults instead of retaining the last pose',async()=>{
 const {controller:c,params}=await fixture();c.startCameraInput();c.updateCameraFrame({timestamp:1,faceVisible:true,bodyVisible:true,inputs:{FaceAngleX:27,BrowLeftY:1,MocopiBodyAngleZ:8}});c.apply(.02,true);
 c.cameraSeenAt=-1000;c.apply(.02,true);assert.equal(params.ParamAngleX,0);assert.equal(params.ParamBrowLY,0);assert.equal(params.ParamBodyAngleZ,0);
 c.updateCameraFrame({timestamp:2,faceVisible:true,bodyVisible:false,inputs:{FaceAngleX:NaN,BrowLeftY:Infinity}});c.apply(.02,true);assert.equal(params.ParamAngleX,0);assert.equal(params.ParamBrowLY,0);
 c.updateCameraFrame({timestamp:3,faceVisible:false,bodyVisible:false,inputs:{FaceAngleX:30,EyeOpenLeft:0}});c.apply(.02,true);assert.equal(params.ParamAngleX,0);assert.equal(params.ParamEyeLOpen,1);
});
test('switching away from camera releases source once; delayed results cannot take over manual or simulation',async()=>{
 const f=await fixture(),c=f.controller;c.startSimulation();assert.equal(f.released,0);c.startCameraInput();c.startManualInput();assert.equal(f.released,1);
 assert.equal(c.updateCameraFrame({timestamp:1,faceVisible:true,inputs:{FaceAngleX:30}}),false);c.startCameraInput();c.startSimulation('blink');assert.equal(f.released,2);c.stop();assert.equal(f.released,2);
});
test('pause freezes applied values and resume requires a new camera frame',async()=>{
 const {controller:c,params}=await fixture();c.startCameraInput();c.updateCameraFrame({timestamp:1,faceVisible:true,inputs:{FaceAngleX:22}});c.apply(.02,true);c.pause();
 assert.equal(c.updateCameraFrame({timestamp:2,faceVisible:true,inputs:{FaceAngleX:-22}}),false);assert.equal(params.ParamAngleX,22);
 c.resume();assert.equal(params.ParamAngleX,0);c.updateCameraFrame({timestamp:3,faceVisible:true,inputs:{FaceAngleX:-22}});c.apply(.02,true);assert.equal(params.ParamAngleX,-22);c.stop();
});

test('a delayed render frame expires camera input using elapsed wall time',async()=>{
 const {controller:c,params}=await fixture();c.setOptions({smoothing:.3});c.startCameraInput();
 c.updateCameraFrame({timestamp:1,faceVisible:true,inputs:{FaceAngleX:30}});c.apply(.016,true);
 assert.equal(params.ParamAngleX,30);c.cameraSeenAt=-1000;c.lastTime=performance.now()-1500;
 lastTick(performance.now());assert.ok(Math.abs(params.ParamAngleX)<.015);c.stop();
});

test('default capture leaves unmapped physics parameters unowned',async()=>{
 const f=await fixture();f.viewer.setParameter('ParamEyeBallForm',.8);f.viewer.setParameter('ParamTieSwing',-.6);
 f.controller.startSimulation('all');f.controller.apply(.016,true);
 assert.equal(Object.hasOwn(f.lastCapture,'ParamEyeBallForm'),false);assert.equal(Object.hasOwn(f.lastCapture,'ParamTieSwing'),false);
 assert.equal(f.params.ParamEyeBallForm,.8);assert.equal(f.params.ParamTieSwing,-.6);f.controller.stop();
});

test('explicit capture holds use native defaults in every source mode and ignore nonexistent IDs',async()=>{
 const f=await fixture({holdParameterDefaults:['ParamEyeBallForm','ParamNotInModel','ParamBreath']});
 for(const start of [()=>f.controller.startSimulation(),()=>f.controller.startManualInput(),()=>f.controller.startCameraInput()]){
  start();f.viewer.setParameter('ParamEyeBallForm',.9);f.viewer.setParameter('ParamTieSwing',.7);
  f.controller.setOptions({smoothing:1});f.controller.apply(.016);
  assert.equal(f.params.ParamEyeBallForm,.2);assert.equal(f.params.ParamTieSwing,.7);assert.equal(f.params.ParamBreath,0);
  assert.equal(Object.hasOwn(f.lastCapture,'ParamNotInModel'),false);assert.equal(Object.hasOwn(f.lastCapture,'ParamTieSwing'),false);
 }
 f.controller.stop();
});

test('mapped input targets take priority over a capture default hold',async()=>{
 const f=await fixture({holdParameterDefaults:['ParamAngleX','ParamBrowLY']});f.controller.startCameraInput();
 f.controller.updateCameraFrame({timestamp:1,faceVisible:true,bodyVisible:true,inputs:{FaceAngleX:17,BrowLeftY:.8}});f.controller.apply(.016,true);
 assert.equal(f.params.ParamAngleX,17);assert.equal(f.params.ParamBrowLY,.8);f.controller.stop();
});

test('native manual and static parameter control is not held after capture stops',async()=>{
 const f=await fixture({holdParameterDefaults:['ParamEyeBallForm']});f.controller.startManualInput();assert.equal(f.params.ParamEyeBallForm,.2);
 f.controller.stop({reset:false});const writes=f.captureWrites;
 f.viewer.setParameter('ParamEyeBallForm',-.75);f.viewer.renderNow();f.controller.apply(.1,true);
 assert.equal(f.params.ParamEyeBallForm,-.75);assert.equal(f.captureWrites,writes);assert.equal(f.controller.mode,'idle');
});
