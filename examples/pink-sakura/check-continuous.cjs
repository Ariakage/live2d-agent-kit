#!/usr/bin/env node
// MIT. Actual completed WebGL frames; no camera or production-runtime changes.
// PLAYWRIGHT_MODULE=/path/to/playwright node check-continuous.cjs URL EMPTY_DIR
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parameterMap,validateValues,pngDimensions,chromiumLaunchOptions,browserRuntimeInfo,redactBrowserError}=require('./check-poses.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

// Hold, reverse before returning, then repeat. Smooth joins keep velocity bounded.
function progress(t) {
 const times=[0,.18,.3,.42,.52,.68,.84,1],values=[0,1,1,.35,.75,0,1,0];
 t=Math.max(0,Math.min(1,t));
 const i=Math.min(times.length-2,Math.max(0,times.findIndex(x=>x>=t)-1));
 const x=(t-times[i])/(times[i+1]-times[i]),s=x*x*(3-2*x);
 return values[i]+(values[i+1]-values[i])*s;
}
function syntheticValues(kind,t,parameters) {
 const u=progress(t),values={};
 for(const p of parameters) values[p.id]=p.default;
 if(kind==='face-cycle') Object.assign(values,{
  ParamEyeLOpen:1-u,ParamEyeROpen:1-u,ParamBrowLY:u,ParamBrowRY:-u,
  ParamMouthOpenY:.8*u,ParamMouthForm:Math.sin(u*Math.PI*2),ParamAngleX:12*u});
 else {
  const wave=Math.sin(2*Math.PI*t)*u;
  Object.assign(values,{ParamAngleX:30*wave,ParamAngleY:-15*wave,ParamAngleZ:20*wave,
   ParamBodyAngleX:-10*wave,ParamBreath:u});
  for(const p of parameters.filter(p=>/hair/i.test(p.id))) values[p.id]=wave*(wave<0?-p.min:p.max);
 }
 return values;
}
function timing(frames) {
 if(frames.length<2) throw new Error('Fewer than two completed frames.');
 const gaps=frames.slice(1).map((f,i)=>f.timeMs-frames[i].timeMs);
 if(gaps.some(g=>!Number.isFinite(g)||g<=0)) throw new Error('Non-monotonic rendered timestamps.');
 return {frames:frames.length,durationMs:frames.at(-1).timeMs-frames[0].timeMs,
  maxGapMs:Math.max(...gaps),gapsOver100ms:gaps.filter(g=>g>100).length};
}
function matchResources(expected,observed,manifest,root) {
 return expected.map(url=>{
  const target=new URL(url),base=new URL(root);
  if(target.origin!==base.origin||!target.pathname.startsWith(base.pathname)) throw new Error('Resource outside prepared preview.');
  const file=decodeURIComponent(target.pathname.slice(base.pathname.length)),hash=manifest.files[file];
  const responses=observed.filter(r=>r.url===url);
  if(!hash||!responses.length||responses.some(r=>r.status!==200||r.sha256!==hash)) throw new Error('Loaded bytes do not match prepared manifest: '+file);
  return {file,sha256:hash,bytes:responses[0].bytes};
 });
}
async function run(url,out) {
 if(!url||!out||!['http:','https:'].includes(new URL(url).protocol)) throw new Error('Usage: node check-continuous.cjs HTTP_URL EMPTY_DIR');
 if(fs.existsSync(out)&&fs.readdirSync(out).length) throw new Error('Output must be empty.');
 fs.mkdirSync(out,{recursive:true});
 const report={schema:'pink-continuous-review-v1',startedAt:new Date().toISOString(),url,
  pass:false,visualReview:'pending',cameraTested:false,vtubeStudioTested:false,errors:[],tracks:[]};
 let browser;
 try {
  const moduleSpec=process.env.PLAYWRIGHT_MODULE||'playwright',launch=chromiumLaunchOptions();
  browser=await require(moduleSpec).chromium.launch(launch);
  report.browser=browserRuntimeInfo(browser,moduleSpec,launch);
  const page=await browser.newPage({viewport:{width:1000,height:850},deviceScaleFactor:1,permissions:[]});
  page.on('pageerror',e=>report.errors.push(redactBrowserError(e.message)));
  await page.addInitScript(()=>{
   window.__deviceRequests=0;
   if(navigator.mediaDevices) for(const key of ['getUserMedia','getDisplayMedia'])
    navigator.mediaDevices[key]=async()=>{window.__deviceRequests++;throw new Error('Devices disabled during motion review');};
  });
  const observed=[],reads=[],bodies=new Map();
  page.on('response',response=>{
   if(!/\.(json|moc3|png|js)$/i.test(new URL(response.url()).pathname))return;
   reads.push((async()=>{const bytes=await response.body();observed.push({url:response.url(),status:response.status(),sha256:sha(bytes),bytes:bytes.length});
    if(/\.json$/i.test(new URL(response.url()).pathname))bodies.set(response.url(),bytes);})().catch(e=>report.errors.push(redactBrowserError(e.message))));
  });
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.previewApp?.readyInfo);
  report.ready=await page.evaluate(()=>window.previewApp.readyInfo);
  if(report.ready.renderer!=='WebGL')throw new Error('Actual WebGL required.');
  const descriptors=parameterMap(report.ready.parameters);
  await Promise.all(reads);
  const entry=report.ready.modelUrl,settings=JSON.parse(bodies.get(entry)),refs=settings.FileReferences;
  const expected=[entry,refs.Moc,...refs.Textures,refs.Physics,refs.DisplayInfo,
   ...Object.values(refs.Motions).flat().map(m=>m.File)].filter(Boolean).map(file=>new URL(file,entry).href);
  const manifestURL=new URL('preview-manifest.json',url).href;
  const response=await page.request.get(manifestURL);
  if(!response.ok())throw new Error('Prepared preview manifest is required.');
  const manifestBytes=await response.body(),manifest=JSON.parse(manifestBytes);
  report.manifestSha256=sha(manifestBytes);
  report.loadedResources=matchResources(expected,observed,manifest,new URL('./',manifestURL).href);
  report.loadedCode=observed.filter(r=>new URL(r.url).pathname.endsWith('.js')).map(r=>({file:new URL(r.url).pathname,sha256:r.sha256}));
  await page.addScriptTag({content:`window.__continuousValues=${syntheticValues.toString()};window.progress=${progress.toString()};`});
  const tracks=Object.entries(refs.Motions).map(([group,list])=>{
   const motion=JSON.parse(bodies.get(new URL(list[0].File,entry).href));
   const duration=motion.Meta.Duration;
   if(!Number.isFinite(duration)||duration<=0||duration>10)throw new Error('Unsupported motion duration');
   return {name:'motion-'+group,group,duration:duration+.5,view:'portrait'};
  }).concat([{name:'face-cycle',duration:6,view:'face'},{name:'body-hair-cycle',duration:6,view:'portrait'}]);
  for(const track of tracks) {
   const record={...track,frames:[]};report.tracks.push(record);
   // Validate the whole synthetic path before it reaches the viewer's clamping API.
   if(!track.group) for(let i=0;i<=600;i++) validateValues(syntheticValues(track.name,i/600,report.ready.parameters),descriptors);
   await page.exposeFunction('saveFrame'+report.tracks.length,frame=>{
    const bytes=Buffer.from(frame.image.split(',')[1],'base64');delete frame.image;
    const dimensions=pngDimensions(bytes),file=`${track.name}-${String(record.frames.length).padStart(4,'0')}.png`;
    fs.writeFileSync(path.join(out,file),bytes,{flag:'wx'});
    record.frames.push({...frame,file,sha256:sha(bytes),...dimensions});
   });
   const result=await page.evaluate(async({track,save,parameters})=>{
    const a=window.previewApp,v=a.viewer,canvas=document.querySelector('canvas');
    a.capture.stop();v.reset();v.setView(track.view);v.renderNow();
    const neutral=async()=>{
     const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;
     const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0);
     const bytes=ctx.getImageData(0,0,c.width,c.height).data;
     return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
    };
    const before=await neutral(),original=PIXI.Renderer.prototype.render;
    const pending=[];let start,requested=null,frame=0,failure=null,stopped=false;
    let finish;const completed=new Promise(resolve=>{finish=resolve;});
    const timeout=setTimeout(()=>{failure='Render capture timed out';finish();},(track.duration+10)*1000);
    if(!track.group) for(const [id,value]of Object.entries(window.__continuousValues(track.name,0,parameters)))v.setParameter(id,value);
    // Capture only after Pixi finishes the model draw. Never count RAF as rendered.
    PIXI.Renderer.prototype.render=function(...args){
     const result=original.apply(this,args);
     if(stopped||this.view!==canvas)return result;
     try {
      const now=performance.now();start??=now;
      const state=v.getState(),geometry=v.getDrawableState();
      if(geometry.positions.some(p=>p.some(x=>!Number.isFinite(x)))||geometry.opacities.some(x=>!Number.isFinite(x)||x<0||x>1.0001))throw new Error('Invalid native geometry/opacity');
      if(requested&&Object.entries(requested).some(([id,value])=>Math.abs(state.parameters[id]-value)>.0001))throw new Error('Requested parameters differ from rendered Core values');
      if(++frame>2400)throw new Error('Capture frame budget exceeded');
      pending.push(window[save]({timeMs:now-start,parameters:state.parameters,requested,image:v.capture()}));
      if(now-start>=track.duration*1000){stopped=true;finish();}
     }catch(e){failure=e.message;stopped=true;finish();}
     return result;
    };
    let raf;
    const drive=now=>{
     if(stopped)return;
     const t=start===undefined?0:Math.min(1,(now-start)/(track.duration*1000));
     requested=window.__continuousValues(track.name,t,parameters);
     for(const [id,value]of Object.entries(requested))v.setParameter(id,value);
     raf=requestAnimationFrame(drive);
    };
    try {
     if(track.group&&!await v.playMotion(track.group))throw new Error('Motion did not start: '+track.group);
     if(!track.group)raf=requestAnimationFrame(drive);
     await completed;
    } finally {
     stopped=true;clearTimeout(timeout);cancelAnimationFrame(raf);PIXI.Renderer.prototype.render=original;
     await Promise.all(pending);
    }
    if(failure)throw new Error(failure);
    v.reset();v.setView(track.view);v.renderNow();
    return {neutralBefore:before,neutralAfter:await neutral(),frameCount:frame};
   },{track,save:'saveFrame'+report.tracks.length,parameters:report.ready.parameters});
   Object.assign(record,result,{timing:timing(record.frames)});
   record.neutralRestored=result.neutralBefore===result.neutralAfter;
   if(result.frameCount!==record.frames.length||!record.neutralRestored)throw new Error('Missing frame or neutral reset mismatch');
   if(record.timing.maxGapMs>250)throw new Error('Rendered gap over 250 ms; rerun or inspect performance');
   if(!record.frames.some(f=>Object.entries(f.parameters).some(([id,value])=>Math.abs(value-descriptors.get(id).default)>.01)))throw new Error('Track never changed native parameters');
   console.log(track.name+': '+record.frames.length+' completed frames');
  }
  report.deviceRequests=await page.evaluate(()=>window.__deviceRequests);
  if(report.deviceRequests||report.errors.length)throw new Error('Device request or browser error');
  report.pass=true;
 }catch(e){report.failure=redactBrowserError(e.message);process.exitCode=1;}
 finally{
  await browser?.close();report.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(out,'continuous.json'),JSON.stringify(report,null,2)+'\n');
 }
 console.log(JSON.stringify({pass:report.pass,failure:report.failure,frames:report.tracks.reduce((n,t)=>n+t.frames.length,0)}));
 return report;
}
module.exports={progress,syntheticValues,timing,matchResources};
if(require.main===module)run(...process.argv.slice(2)).catch(e=>{console.error(redactBrowserError(e.message));process.exitCode=1;});
