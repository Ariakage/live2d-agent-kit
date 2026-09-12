#!/usr/bin/env node
/** Explicit physical-camera regression. No recordings, snapshots or fake-device fallback. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
if(!args.includes('--physical-camera')){console.error('Usage: node scripts/check-camera.cjs --physical-camera --url http://127.0.0.1:8860/ [--duration 15] [--output work/camera-check.json] [--headless]\nThis command requests the real camera. No camera is accessed without --physical-camera.');process.exit(2);}
const url=arg('--url','http://127.0.0.1:8860/'),duration=Number(arg('--duration',15)),output=path.resolve(arg('--output','work/camera-check.json'));
if(!Number.isFinite(duration)||duration<5||duration>120){console.error('--duration must be 5..120 seconds');process.exit(2);}
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname)){console.error('This local-camera test requires a loopback preview URL.');process.exit(2);}
let chromium;try{({chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'));}catch{console.error('Provide separately installed Playwright with PLAYWRIGHT_MODULE.');process.exit(2);}
const report={schemaVersion:1,mode:'physical-camera',scope:'Actual getUserMedia video and local MediaPipe inference against the loaded Core model. No fake device, camera screenshot, recording or landmark dump. Torso pitch requires visible hips; this test records availability without claiming full-body accuracy.',passed:false,checks:[],errors:[],externalRequestOrigins:[],blockedExternalRequests:[],loadedResources:[]};
const check=(name,ok,detail)=>{report.checks.push({name,passed:!!ok,detail});if(!ok)throw new Error(name);};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function includeRange(ranges,values){for(const [name,value]of Object.entries(values||{})){if(!Number.isFinite(value))continue;const r=ranges[name]??={min:value,max:value};r.min=Math.min(r.min,value);r.max=Math.max(r.max,value);}}
(async()=>{let browser,page;const reads=[],outside=new Set(),external=new Map();try{
 browser=await chromium.launch({headless:args.includes('--headless'),...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});report.browserVersion=browser.version();
 const context=await browser.newContext({permissions:['camera'],viewport:{width:1440,height:1040}});page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('request',request=>{const target=new URL(request.url());if(/^https?:$/.test(target.protocol)&&target.origin!==new URL(url).origin){outside.add(target.origin);external.set(request,{origin:target.origin,method:request.method(),failure:null,response:false});}});
 page.on('requestfailed',request=>{if(external.has(request))external.get(request).failure=request.failure()?.errorText||'unknown';});
 page.on('response',response=>{const target=new URL(response.url());if(external.has(response.request()))external.get(response.request()).response=true;if(!/\.(moc3|png|model3\.json)$/.test(target.pathname)||!target.pathname.includes('/model/'))return;
  reads.push((async()=>{const bytes=await response.body();report.loadedResources.push({file:target.pathname.split('/').at(-1),sha256:digest(bytes),bytes:bytes.length,status:response.status()});})().catch(error=>report.errors.push(error.message)));});
 await page.addInitScript(()=>{window.__cameraAudit={requests:[],tracks:[],blocked:[]};document.addEventListener('securitypolicyviolation',event=>{let origin;try{origin=new URL(event.blockedURI).origin;}catch{origin=event.blockedURI;}window.__cameraAudit.blocked.push({origin,directive:event.effectiveDirective});});const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async c=>{window.__cameraAudit.requests.push({video:!!c.video,audio:c.audio===false?false:!!c.audio});const stream=await get(c);window.__cameraAudit.tracks.push(...stream.getTracks());return stream;};});
 const mainResponse=await page.goto(url,{waitUntil:'networkidle'});report.contentSecurityPolicy=mainResponse.headers()['content-security-policy']||'';
 check('server blocks connections outside the preview origin',report.contentSecurityPolicy.split(';').some(d=>d.trim()==="connect-src 'self'"));
 await page.waitForFunction(()=>window.previewApp?.viewer,{timeout:60000});
 check('opening preview does not request devices',await page.evaluate(()=>window.__cameraAudit.requests.length===0));
 check('camera dependencies were prepared',await page.locator('#camera-start').isEnabled());
 await page.click('[data-view="portrait"]');await page.click('#camera-start');
 await page.waitForFunction(()=>['running','error'].includes(window.previewApp.camera.getState().status),{timeout:90000});
 const initial=await page.evaluate(()=>window.previewApp.camera.getState());check('physical camera and recognizers start',initial.status==='running',{status:initial.status,code:initial.code,message:initial.message});
 const ranges={},nativeRanges={},fps=[],inferenceMs=[];let faceSamples=0,bodySamples=0,pitchSamples=0,last;
 for(let i=0;i<duration*4;i++){
  await page.waitForTimeout(250);last=await page.evaluate(()=>({camera:window.previewApp.camera.getState(),capture:window.previewApp.capture.getState(),native:window.previewApp.viewer.getState().parameters}));
  if(last.camera.status!=='running')throw new Error(last.camera.message);
  if(last.camera.faceVisible)faceSamples++;if(last.camera.bodyVisible)bodySamples++;if(last.camera.metrics.bodyPitchAvailable)pitchSamples++;
  includeRange(ranges,last.capture.inputs);includeRange(nativeRanges,last.native);
  if(last.camera.metrics.inferenceFps>0)fps.push(last.camera.metrics.inferenceFps);
  if(Number.isFinite(last.camera.metrics.inferenceMs))inferenceMs.push(last.camera.metrics.inferenceMs);
 }
 report.measurements={samples:duration*4,faceSamples,bodySamples,hipPitchSamples:pitchSamples,inferenceFrames:last.camera.metrics.frames,inputRanges:ranges,nativeParameterRanges:nativeRanges,inferenceFps:fps.length?{min:Math.min(...fps),max:Math.max(...fps),mean:fps.reduce((a,b)=>a+b,0)/fps.length}:null,inferenceMs:inferenceMs.length?{min:Math.min(...inferenceMs),max:Math.max(...inferenceMs)}:null};
 check('real video frames reach face inference',faceSamples>0&&last.camera.metrics.frames>0);
 check('shoulder tracking produced valid samples',bodySamples>0,{hipPitchSamples:pitchSamples,scope:'Shoulders only when hips are outside the frame'});
 check('camera results drive native model parameters',Object.entries(nativeRanges).some(([key,r])=>key!=='ParamBreath'&&r.max-r.min>.005));
 // A single sample may land in a blink; wait for a real usable neutral frame.
 await page.waitForFunction(()=>window.previewApp.camera.calibrate()===true,{timeout:20000,polling:250});
 report.calibration=await page.evaluate(()=>window.previewApp.camera.getState().calibrated);
 check('visible face accepts neutral calibration',report.calibration===true);
 // Pause a decoded video, not the hardware, to test stale-result neutralization.
 await page.evaluate(()=>document.querySelector('#camera-video').pause());await page.waitForTimeout(1500);
 const stale=await page.evaluate(()=>({state:window.previewApp.capture.getState(),values:window.previewApp.viewer.getState().parameters,defaults:window.previewApp.viewer.getParameters()}));
 const tracked=Object.keys(stale.state.parameters);
 report.staleDecoder={mode:stale.state.mode,detection:stale.state.lastDetection,differences:stale.defaults.filter(p=>tracked.includes(p.id)).map(p=>({id:p.id,value:stale.values[p.id],default:p.default,absoluteError:Math.abs(stale.values[p.id]-p.default)}))};
 check('stalled decoder loses tracking and returns mapped targets to neutral',!stale.state.lastDetection.face&&!stale.state.lastDetection.body&&stale.defaults.filter(p=>tracked.includes(p.id)).every(p=>Math.abs(stale.values[p.id]-p.default)<.015),report.staleDecoder);
 await page.evaluate(()=>document.querySelector('#camera-video').play());await page.waitForFunction(()=>window.previewApp.camera.getState().faceVisible,{timeout:20000});
 await page.locator('#parameters input[data-id="ParamAngleX"]').evaluate(el=>{el.value='4';el.dispatchEvent(new Event('input',{bubbles:true}));});
 check('manual parameter control releases the physical camera',await page.evaluate(()=>window.__cameraAudit.tracks.every(t=>t.readyState==='ended')&&window.previewApp.capture.mode==='idle'));
 await page.uncheck('#camera-body');await page.click('#camera-start');await page.waitForFunction(()=>['running','error'].includes(window.previewApp.camera.getState().status),{timeout:90000});
 check('face-only mode starts without pose inference',await page.evaluate(()=>{const s=window.previewApp.camera.getState();return s.status==='running'&&!s.bodyEnabled;}));
 await page.click('[data-profile="all"]');
 check('simulation releases camera and takes exclusive input ownership',await page.evaluate(()=>window.__cameraAudit.tracks.every(t=>t.readyState==='ended')&&window.previewApp.capture.mode==='simulation'));
 report.deviceRequests=await page.evaluate(()=>window.__cameraAudit.requests);check('only video was requested',report.deviceRequests.length>=2&&report.deviceRequests.every(c=>c.video&&!c.audio));
 await page.waitForTimeout(300);await Promise.all(reads);report.externalRequestOrigins=[...outside];
 report.blockedExternalRequests=await page.evaluate(()=>window.__cameraAudit.blocked);report.externalRequestOutcomes=[...external.values()];
 check('no external connection passed the browser policy',[...external.values()].every(r=>!r.response&&r.failure?.includes('BLOCKED_BY_CSP')),{attemptedOrigins:[...outside],blockedByPolicy:report.blockedExternalRequests});check('no uncaught browser error',report.errors.length===0,report.errors);report.passed=true;
}catch(error){report.error=error.message;}
finally{if(page)try{report.cleanup=await page.evaluate(()=>{window.previewApp?.capture.stop();window.previewApp?.camera.stop();return{allTracksEnded:window.__cameraAudit.tracks.every(t=>t.readyState==='ended'),audioTracks:window.__cameraAudit.tracks.filter(t=>t.kind==='audio').length};});}catch(error){report.cleanup={error:error.message};}
 const cleaned=report.cleanup?.allTracksEnded===true&&report.cleanup.audioTracks===0;
 report.checks.push({name:'final cleanup ends every video track without audio',passed:cleaned,detail:report.cleanup});
 if(!cleaned)report.passed=false;
 await browser?.close();fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks:report.checks,measurements:report.measurements?{faceSamples:report.measurements.faceSamples,bodySamples:report.measurements.bodySamples,inferenceFrames:report.measurements.inferenceFrames,inferenceFps:report.measurements.inferenceFps}:null,error:report.error,output},null,2));if(!report.passed)process.exitCode=1;}
})();
