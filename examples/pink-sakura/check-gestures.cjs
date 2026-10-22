#!/usr/bin/env node
// MIT. Completed-frame gesture playback and interruption checks; camera remains off.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromiumLaunchOptions,browserRuntimeInfo}=require('./check-poses.cjs');
const {progress}=require('./check-continuous.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function auditFrames(frames) {
 if(frames.length<100)throw new Error('Incomplete gesture sequence');
 let maximumFrameGapMs=0,raisedFramesWithoutHand=0;
 for(let i=0;i<frames.length;i++) {
  const f=frames[i],lift=f.parameters?.ParamArmRLift;
  if(!Number.isFinite(f.timeMs)||!Number.isFinite(lift)||!Number.isFinite(f.minimumTriangleAreaRatio))
   throw new Error('Invalid recorded frame');
  if(i) {const gap=f.timeMs-frames[i-1].timeMs;if(gap<0)throw new Error('Nonmonotonic capture');maximumFrameGapMs=Math.max(maximumFrameGapMs,gap);}
  if(f.minimumTriangleAreaRatio<=0||f.visibleHands>1)throw new Error('Invalid arm geometry or overlapping hand forms');
  if(lift>.05&&f.visibleHands!==1)raisedFramesWithoutHand++;
 }
 if(maximumFrameGapMs>250||raisedFramesWithoutHand)throw new Error('Capture gap or missing raised hand');
 return {passed:true,frames:frames.length,maximumFrameGapMs,raisedFramesWithoutHand};
}
async function run(url,out,mode="all") {
 if(!["all","hand-down"].includes(mode))throw new Error("Mode must be all or hand-down");
 if(!url||!out)throw new Error('Usage: check-gestures.cjs URL EMPTY_OUTPUT');
 if(fs.existsSync(out)&&fs.readdirSync(out).length)throw new Error('Output must be empty');
 fs.mkdirSync(out,{recursive:true});
 const moduleSpec=process.env.PLAYWRIGHT_MODULE||'playwright',launch=chromiumLaunchOptions();
 const browser=await require(moduleSpec).chromium.launch(launch),report={pass:false,cameraTested:false,vtubeStudioTested:false,visualReview:'pending',tracks:[],errors:[]};
 try {
  report.browser=browserRuntimeInfo(browser,moduleSpec,launch);
  const page=await browser.newPage({viewport:{width:1100,height:950},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(()=>{window.__devices=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{window.__devices++;throw new Error('Camera prohibited in this check');};});
  await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.previewApp?.viewer);
  report.ready=await page.evaluate(()=>window.previewApp.readyInfo);
  const manifestResponse=await page.request.get(new URL('preview-manifest.json',url).href);
  const manifestBytes=await manifestResponse.body();report.previewManifestSha256=sha(manifestBytes);report.files=JSON.parse(manifestBytes).files;
  await page.addScriptTag({content:`window.gestureProgress=${progress.toString()};`});
  let tracks=['HandToChin','FingerHeart','Wave'].map(group=>({name:'motion-'+group,group,seconds:8.2}));
  for(let pose=0;pose<3;pose++)tracks.push({name:'reverse-repeat-'+pose,pose,seconds:8});
  for(const from of ['HandToChin','FingerHeart','Wave'])for(const to of ['HandToChin','FingerHeart','Wave'])
   if(from!==to)tracks.push({name:from+'-to-'+to,from,to,seconds:11.5});
  const lowerTracks=["HandToChin","FingerHeart","Wave"].map(from=>({name:from+"-to-HandDown",from,to:"HandDown",seconds:7}));
  tracks=mode==="hand-down"?lowerTracks:[...tracks,...lowerTracks];
  report.selection=mode;
  for(const track of tracks) {
   const record={...track,frames:[]};report.tracks.push(record);
   const save='gestureSave'+report.tracks.length;
   await page.exposeFunction(save,frame=>{
    const bytes=Buffer.from(frame.image.split(',')[1],'base64');delete frame.image;
    const file=track.name+'-'+String(record.frames.length).padStart(4,'0')+'.png';
    fs.writeFileSync(path.join(out,file),bytes,{flag:'wx'});record.frames.push({...frame,file,sha256:sha(bytes)});
   });
   record.result=await page.evaluate(async({track,save})=>{
    const a=window.previewApp,v=a.viewer,canvas=document.querySelector('canvas');
    a.capture.stop();v.reset();v.setView('portrait');v.renderNow();
    const base=v.getDrawableState(),topology=v.getDrawableTopology();
    v.setParameter('ParamArmRLift',1);v.renderNow();const raised=v.getDrawableState();
    const arm=topology.ids.map((id,i)=>({id,i})).filter(({i})=>raised.positions[i].some((x,j)=>Math.abs(x-base.positions[i][j])>1e-6));
    const handIds=new Set();
    for(const form of [0,1,2,3]){v.setParameter('ParamHandRForm',form);v.renderNow();const state=v.getDrawableState();
     for(const {i}of arm)if(state.opacities[i]!==base.opacities[i])handIds.add(i);}
    if(handIds.size!==4)throw new Error('Expected four mutually exclusive hand forms');
    v.reset();v.setView('portrait');v.renderNow();
    if(arm.length!==6)throw new Error('Expected measured sleeve, cuff and four hand meshes: '+JSON.stringify(arm));
    const area=(p,a,b,c)=>(p[2*b]-p[2*a])*(p[2*c+1]-p[2*a+1])-(p[2*b+1]-p[2*a+1])*(p[2*c]-p[2*a]);
    let count=0,start,done=false,error=null,minimum=1,flips=0,switched=false,raf;
    const pending=[],original=PIXI.Renderer.prototype.render;
    let finish;const completed=new Promise(resolve=>{finish=resolve;});
    const timer=setTimeout(()=>{error='Timed out';done=true;finish();},(track.seconds+15)*1000);
    PIXI.Renderer.prototype.render=function(...args){const result=original.apply(this,args);if(done||this.view!==canvas)return result;
     try {
      const now=performance.now();start??=now;
      const p=v.getState().parameters,g=v.getDrawableState();let frameMin=1,visibleHands=0;
      for(const {id,i}of arm) {
       if(g.opacities[i]<.001)continue;
       if(handIds.has(i))visibleHands++;
       const indices=topology.indices[i];
       for(let j=0;j<indices.length;j+=3) {
        const tri=indices.slice(j,j+3),before=area(base.positions[i],...tri),after=area(g.positions[i],...tri);
        if(!Number.isFinite(after))throw new Error('Nonfinite gesture geometry');
        if(Math.abs(before)>1e-10){const ratio=after/before;frameMin=Math.min(frameMin,ratio);if(ratio<=0)flips++;}
       }
      }
      if(visibleHands>1)throw new Error('Multiple visible hands');minimum=Math.min(minimum,frameMin);
      const parameters=Object.fromEntries(Object.entries(p).filter(([id])=>/ArmR|HandR|Angle|SleeveR/.test(id)));
      pending.push(window[save]({timeMs:now-start,parameters,minimumTriangleAreaRatio:frameMin,visibleHands,image:v.capture()}));count++;
      if(now-start>=track.seconds*1000){done=true;finish();}
     }catch(e){error=e.message;done=true;finish();}return result;};
    const drive=now=>{
     if(done)return;
     const time=start===undefined?0:(now-start)/1000;
     if(track.pose!==undefined) {
      const lift=window.gestureProgress(time/track.seconds),w=Math.sin(time*1.8);
      for(const [id,value]of Object.entries({ParamArmRLift:lift,ParamArmRPose:track.pose,ParamHandRForm:track.pose+1,
       ParamHandRWave:track.pose===2?w*.55:0,ParamAngleX:w*12,ParamAngleZ:-w*7,ParamBodyAngleZ:w*5,ParamSleeveRSwing:w*.6}))v.setParameter(id,value);
     }
     if(track.to&&time>=3&&!switched){switched=true;v.playMotion(track.to).catch(e=>{error=e.message;done=true;finish();});}
     raf=requestAnimationFrame(drive);
    };
    try {
     if(track.group||track.from)if(!await v.playMotion(track.group||track.from))throw new Error('Motion failed');
     raf=requestAnimationFrame(drive);await completed;
    }finally{done=true;clearTimeout(timer);cancelAnimationFrame(raf);PIXI.Renderer.prototype.render=original;await Promise.all(pending);v.reset();}
    if(error)throw new Error(error);
    if(count<100||flips)throw new Error('Incomplete sequence or inverted native triangles: '+JSON.stringify({count,flips,minimum}));
    return {frames:count,minimumTriangleAreaRatio:minimum,flippedTriangles:flips,armDrawables:arm.map(x=>x.id)};
   },{track,save});
  }
  for(const track of report.tracks)track.frameAudit=auditFrames(track.frames);
  if(report.errors.length||await page.evaluate(()=>window.__devices))throw new Error('Browser errors or camera request');
  report.pass=true;
 }catch(e){report.failure=e.message;process.exitCode=1;}
 finally{await browser.close();fs.writeFileSync(path.join(out,'gestures.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({pass:report.pass,failure:report.failure,frames:report.tracks.reduce((sum,t)=>sum+t.frames.length,0)}));
}
if(require.main===module)run(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});

module.exports={auditFrames};
