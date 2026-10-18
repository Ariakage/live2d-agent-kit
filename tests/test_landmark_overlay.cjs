const {test}=require('node:test');
const assert=require('node:assert/strict');
const {faceFixture,poseFixture}=require('./tracking_fixtures.cjs');

// Synthetic eye geometry exercises projection without any camera image or device.
function eyePoints() {
  const points=faceFixture().faceLandmarks[0];
  for(const [a,b,top,bottom,ring,x] of [[33,133,159,145,469,.35],[362,263,386,374,474,.65]]) {
    points[a]={x:x-.05,y:.4};points[b]={x:x+.05,y:.4};
    points[top]={x,y:.38};points[bottom]={x,y:.42};
    [[-.003,0],[0,-.003],[.003,0],[0,.003]].forEach(([dx,dy],i)=>{points[ring+i]={x:x+.01+dx,y:.405+dy};});
  }
  return points;
}
async function fixture() {
  const {LandmarkOverlay}=await import('../templates/web-preview/landmark-overlay.js');
  let now=1000,visible=true,nextTimer=0,disconnected=false;
  const timers=new Map(),calls=[];
  const context=Object.fromEntries(['clearRect','setTransform','save','beginPath','rect','clip','moveTo','lineTo','stroke','arc','fill','restore','closePath'].map(name=>[name,(...args)=>calls.push([name,...args])]));
  const canvas={width:0,height:0,getContext:()=>context},status={textContent:''};
  let box={width:320,height:240},onResize;
  const overlay=new LandmarkOverlay({canvas,viewport:{getBoundingClientRect:()=>box},status},{
    now:()=>now,visible:()=>visible,dpr:()=>2,
    setTimer:(fn,ms)=>{timers.set(++nextTimer,{fn,deadline:now+ms});return nextTimer;},clearTimer:id=>timers.delete(id),
    observeResize:fn=>{onResize=fn;return()=>{disconnected=true;};},
  });
  const payload={width:640,height:480,faceTimestamp:1000,poseTimestamp:1000,faceVisible:true,bodyVisible:true,
    faceLandmarks:eyePoints(),poseLandmarks:poseFixture().landmarks[0],eyeOpen:{left:1,right:1}};
  return {overlay,payload,timers,canvas,status,calls,disconnect:()=>disconnected,
    resize:b=>{box=b;onResize();},hide:()=>{visible=false;overlay.render();},
    advance:time=>{now=time;for(const [id,t] of [...timers])if(t.deadline<=now){timers.delete(id);t.fn();}}};
}

test('contain projection follows letterboxing and mirrors exactly once',async()=>{
  const {containRect,projectLandmark}=await import('../templates/web-preview/landmark-overlay.js');
  const rect=containRect(640,360,320,240);
  assert.deepEqual(rect,{x:0,y:30,width:320,height:180,scale:.5});
  assert.deepEqual(projectLandmark({x:.25,y:.5},rect),{x:240,y:120});
  assert.deepEqual(projectLandmark({x:.25,y:.5},rect,false),{x:80,y:120});
  assert.equal(containRect(0,480,320,240),null);
  assert.equal(projectLandmark({x:NaN,y:.5},rect),null);
  assert.equal(projectLandmark({x:1.1,y:.5},rect),null);
});

test('2D gaze requires open eyes, iris points and non-degenerate eyelids',async()=>{
  const {estimateIrisGaze}=await import('../templates/web-preview/landmark-overlay.js');
  const points=eyePoints(),opts={width:640,height:480,eyeOpen:{left:1,right:1}};
  const gaze=estimateIrisGaze(points,opts);
  assert.equal(gaze.length,2);assert.ok(gaze.every(g=>g.estimated&&g.source==='iris-relative-to-eyelids'&&g.vector.x>0&&g.vector.y>0));
  assert.equal(estimateIrisGaze(points,{...opts,eyeOpen:{left:0,right:1}}).length,1);
  assert.equal(estimateIrisGaze(points,{...opts,eyeOpen:{left:0,right:0}}).length,0);
  const missing=points.slice();missing[469]=null;assert.equal(estimateIrisGaze(missing,opts).length,1);
  const flat=points.slice();flat[159]=flat[145];assert.equal(estimateIrisGaze(flat,opts).length,1);
  assert.equal(estimateIrisGaze(points,{...opts,width:NaN}).length,0);
});

test('video, nodes and gaze are independent; overlay-off discards landmarks',async()=>{
  const f=await fixture(),o=f.overlay;
  o.update(f.payload);assert.equal(o.getState().hasLandmarks,false);
  o.setActive(true);o.setOptions({showNodes:true,showGaze:true});o.update(f.payload);
  assert.equal(o.getState().faceNodes,478);assert.equal(o.getState().poseNodes,8);assert.equal(o.getState().gazeVectors,2);
  assert.equal(o.getState().showVideo,false);assert.equal(f.canvas.width,640);assert.equal(f.canvas.height,480);
  o.setOptions({showVideo:true,showNodes:false});assert.equal(o.getState().gazeVectors,2);assert.equal(o.getState().faceNodes,0);
  o.setOptions({showVideo:false});assert.equal(o.getState().gazeVectors,2);
  o.setOptions({showGaze:false});assert.equal(o.getState().hasLandmarks,false);assert.equal(f.timers.size,0);
  o.update(f.payload);assert.equal(o.getState().hasLandmarks,false);
  assert.ok(!JSON.stringify(o.getState()).includes('faceLandmarks'));
  o.destroy();assert.equal(f.disconnect(),true);
});

test('face and pose expire independently without a new inference callback',async()=>{
  const f=await fixture(),o=f.overlay;
  o.setActive(true);o.setOptions({showNodes:true});o.update({...f.payload,poseTimestamp:900});
  f.advance(1251);assert.equal(o.getState().faceNodes,478);assert.equal(o.getState().poseNodes,0);
  f.advance(1351);assert.equal(o.getState().hasLandmarks,false);assert.equal(o.getState().faceNodes,0);assert.equal(f.timers.size,0);
  assert.equal(o.getState().lastClearReason,'stale-or-lost');o.destroy();
});

test('occluded joints are filtered, resize preserves projection, and loss/background/stop clear',async()=>{
  const f=await fixture(),o=f.overlay;
  f.payload.poseLandmarks[13].visibility=.1;
  o.setActive(true);o.setOptions({showNodes:true});o.update(f.payload);assert.equal(o.getState().poseNodes,7);
  f.resize({width:400,height:400});assert.deepEqual(o.getState().contentRect,{x:0,y:50,width:400,height:300,scale:.625});
  o.update({...f.payload,faceVisible:false,bodyVisible:false});assert.equal(o.getState().hasLandmarks,false);
  o.update(f.payload);o.setActive(false);assert.equal(o.getState().hasLandmarks,false);
  o.setActive(true);o.update(f.payload);f.hide();assert.equal(o.getState().hasLandmarks,false);assert.equal(f.timers.size,0);
  o.destroy();
});
