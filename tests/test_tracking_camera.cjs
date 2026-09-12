const {test}=require('node:test');
const assert=require('node:assert/strict');
const {faceFixture,poseFixture}=require('./tracking_fixtures.cjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function track(){return {readyState:'live',muted:false,stops:0,handlers:new Map(),
  addEventListener(n,f){this.handlers.set(n,f);},removeEventListener(n){this.handlers.delete(n);},
  stop(){this.stops++;this.readyState='ended';}};}
function stream(){const tracks=[track(),track()];return {tracks,getTracks:()=>tracks,getVideoTracks:()=>[tracks[0]]};}
async function fixture(options={}) {
  const {CameraTracker}=await import('../templates/web-preview/camera-tracker.js');
  const media=stream(),frames=[],states=[],rafs=new Map(),calls={permission:0,load:0,faceCreate:0,poseCreate:0,faceDetect:0,poseDetect:0,faceClose:0,poseClose:0};
  let clock=1000,next=0;
  const video={srcObject:null,paused:true,readyState:4,videoWidth:640,videoHeight:480,currentTime:0,
    play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;}};
  const detectors={face:()=>faceFixture(),pose:()=>poseFixture()};
  const face={detectForVideo(){calls.faceDetect++;return detectors.face();},close(){calls.faceClose++;}};
  const pose={detectForVideo(){calls.poseDetect++;return detectors.pose();},close(){calls.poseClose++;}};
  const vision={FilesetResolver:{forVisionTasks:async()=>({})},
    FaceLandmarker:{createFromOptions:async(files,config)=>{calls.faceCreate++;calls.faceConfig=config;return options.faceCreation ? options.faceCreation.promise : face;}},
    PoseLandmarker:{createFromOptions:async()=>{calls.poseCreate++;if(options.poseError)throw Error('model failed');return pose;}}};
  const tracker=new CameraTracker({video,assets:options.noAssets?null:{visionModule:'tracking/vision_bundle.mjs',wasmRoot:'tracking/wasm',faceModel:'tracking/models/face.task',poseModel:'tracking/models/pose.task'},onFrame:f=>frames.push(f),onState:s=>states.push(s)},
    {now:()=>clock,requestFrame:cb=>{rafs.set(++next,cb);return next;},cancelFrame:id=>rafs.delete(id),secureContext:()=>true,baseURL:()=> 'http://127.0.0.1:8837/',
      getUserMedia:async constraints=>{calls.permission++;calls.constraints=constraints;if(options.permissionError)throw options.permissionError;return options.permission?options.permission.promise:media;},
      loadVision:async()=>{calls.load++;return vision;}});
  function tick(ms=100,{newVideo=true}={}){clock+=ms;if(newVideo)video.currentTime+=ms/1000;const callbacks=[...rafs.values()];rafs.clear();for(const cb of callbacks)cb();}
  return {tracker,media,video,frames,states,rafs,calls,face,pose,detectors,tick};
}

test('constructor is inert with assets:null and unavailable setup cannot open a device',async()=>{
  const f=await fixture({noAssets:true});assert.equal(f.calls.permission,0);assert.equal(f.calls.load,0);assert.equal(f.tracker.getState().status,'idle');
  await assert.rejects(f.tracker.start(),{code:'assets-missing'});assert.equal(f.calls.permission,0);
});
test('duplicate starts share one initialization, request video only and face-only mode does not load pose',async()=>{
  const f=await fixture();const one=f.tracker.start({bodyEnabled:false}),two=f.tracker.start({bodyEnabled:true});
  assert.equal(one,two);await one;assert.equal(f.calls.permission,1);assert.equal(f.calls.poseCreate,0);
  assert.equal(f.calls.constraints.audio,false);assert.equal(f.calls.faceConfig.runningMode,'VIDEO');assert.equal(f.calls.faceConfig.baseOptions.delegate,'CPU');
  f.tick();assert.equal(f.frames.at(-1).faceVisible,true);assert.equal(f.frames.at(-1).bodyVisible,false);
  assert.equal(f.tracker.calibrate(),true);f.tracker.stop();
  assert.ok(f.media.tracks.every(t=>t.stops===1));assert.equal(f.calls.faceClose,1);assert.equal(f.rafs.size,0);assert.equal(f.video.srcObject,null);
  f.tracker.stop();assert.equal(f.calls.faceClose,1);
});
test('stop before camera permission resolves closes all late tracks without starting inference',async()=>{
  const permission=deferred(),f=await fixture({permission});const started=f.tracker.start();f.tracker.stop();permission.resolve(f.media);
  await assert.rejects(started,{name:'AbortError'});assert.ok(f.media.tracks.every(t=>t.stops===1));assert.equal(f.calls.load,0);assert.equal(f.rafs.size,0);
});
test('stop during model loading releases a late-created landmarker and suppresses callbacks',async()=>{
  const faceCreation=deferred(),f=await fixture({faceCreation});const started=f.tracker.start();await turn();
  assert.equal(f.calls.faceCreate,1);f.tracker.stop();faceCreation.resolve(f.face);
  await assert.rejects(started,{name:'AbortError'});assert.equal(f.calls.faceClose,1);assert.equal(f.calls.poseCreate,0);assert.equal(f.frames.length,0);
});
test('model failure releases the camera and the already created face model',async()=>{
  const f=await fixture({poseError:true});await assert.rejects(f.tracker.start(),{code:'tracking-unavailable'});
  assert.ok(f.media.tracks.every(t=>t.stops===1));assert.equal(f.calls.faceClose,1);assert.equal(f.tracker.getState().status,'error');assert.equal(f.video.srcObject,null);
});
test('permission rejection has a usable error and never imports inference code',async()=>{
  const f=await fixture({permissionError:Object.assign(new Error('device-specific private message'),{name:'NotAllowedError'})});
  await assert.rejects(f.tracker.start(),{code:'permission-denied'});assert.equal(f.calls.load,0);
  assert.ok(!JSON.stringify(f.tracker.getState()).includes('device-specific'));
});
test('DOMException numeric error codes do not bypass the permission explanation',async()=>{
  const f=await fixture({permissionError:Object.assign(new Error('private origin details'),{name:'SecurityError',code:18})});
  await assert.rejects(f.tracker.start(),{code:'permission-denied'});
  assert.equal(f.calls.load,0);assert.ok(!JSON.stringify(f.tracker.getState()).includes('private origin'));
});
test('face loss and frozen video emit neutral values, without synthesizing another input source',async()=>{
  const f=await fixture();await f.tracker.start();f.tick();assert.equal(f.frames.at(-1).faceVisible,true);
  f.detectors.face=()=>({faceLandmarks:[]});f.tick();assert.equal(f.frames.at(-1).faceVisible,false);assert.equal(f.frames.at(-1).inputs.EyeOpenLeft,1);
  f.detectors.face=()=>faceFixture({jawOpen:.7});f.tick();assert.ok(f.frames.at(-1).inputs.MouthOpen>.6);
  f.tick(400,{newVideo:false});const last=f.frames.at(-1);assert.equal(last.faceVisible,false);assert.equal(last.bodyVisible,false);assert.equal(last.inputs.MouthOpen,0);
  const serialized=JSON.stringify(f.tracker.getState());assert.ok(!serialized.includes('faceLandmarks'));assert.ok(!serialized.includes('srcObject'));f.tracker.stop();
});
test('inference frame rate is bounded and video-track end releases resources',async()=>{
  const f=await fixture();await f.tracker.start();for(let i=0;i<120;i++)f.tick(1000/120);
  assert.ok(f.calls.faceDetect<=16);assert.ok(f.calls.poseDetect<=9);assert.equal(f.rafs.size,1);
  f.media.tracks[0].handlers.get('ended')();assert.equal(f.tracker.getState().code,'camera-ended');assert.equal(f.rafs.size,0);assert.equal(f.calls.poseClose,1);
});
test('muted or paused video immediately becomes unavailable and cannot calibrate a cached face',async()=>{
  const f=await fixture();await f.tracker.start();f.tick();assert.equal(f.tracker.getState().faceVisible,true);
  f.media.tracks[0].muted=true;f.tick(100,{newVideo:false});
  assert.equal(f.frames.at(-1).faceVisible,false);assert.equal(f.frames.at(-1).bodyVisible,false);assert.equal(f.tracker.calibrate(),false);
  f.media.tracks[0].muted=false;f.tick();assert.equal(f.frames.at(-1).faceVisible,true);
  f.video.paused=true;f.tick();assert.equal(f.frames.at(-1).faceVisible,false);assert.equal(f.tracker.calibrate(),false);f.tracker.stop();
});
test('visibility counters count fresh inference results instead of repeated output frames',async()=>{
  const f=await fixture();await f.tracker.start();f.tick();const before=f.tracker.getState().metrics;
  f.tick(100,{newVideo:false});const after=f.tracker.getState().metrics;
  assert.equal(f.frames.at(-1).faceVisible,true);assert.equal(after.frames,before.frames);
  assert.equal(after.faceFrames,before.faceFrames);assert.equal(after.bodyFrames,before.bodyFrames);f.tracker.stop();
});
test('cross-origin assets are rejected before requesting a camera',async()=>{
  const f=await fixture();f.tracker.assets.faceModel='https://example.com/face.task';
  await assert.rejects(f.tracker.start(),{code:'assets-origin'});assert.equal(f.calls.permission,0);assert.equal(f.calls.load,0);
});
test('an inference failure releases the stream, models and scheduler',async()=>{
  const f=await fixture();await f.tracker.start();f.detectors.face=()=>{throw Error('inference failed');};f.tick();
  assert.equal(f.tracker.getState().status,'error');assert.equal(f.rafs.size,0);
  assert.ok(f.media.tracks.every(t=>t.readyState==='ended'));assert.equal(f.calls.faceClose,1);assert.equal(f.calls.poseClose,1);
});
test('a cancelled late permission result cannot stop or replace a newer running session',async()=>{
  const f=await fixture(),late=deferred(),oldMedia=stream(),newMedia=stream();let requested=0;
  f.tracker.platform.getUserMedia=()=>++requested===1?late.promise:Promise.resolve(newMedia);
  const oldStart=f.tracker.start();f.tracker.stop();await f.tracker.start();
  late.resolve(oldMedia);await assert.rejects(oldStart,{name:'AbortError'});
  assert.equal(f.tracker.getState().status,'running');assert.equal(f.video.srcObject,newMedia);assert.equal(f.video.paused,false);
  assert.ok(oldMedia.tracks.every(t=>t.readyState==='ended'));assert.ok(newMedia.tracks.every(t=>t.readyState==='live'));
  f.tick();assert.equal(f.frames.at(-1).faceVisible,true);f.tracker.stop();assert.ok(newMedia.tracks.every(t=>t.readyState==='ended'));
});
