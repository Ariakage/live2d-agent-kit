#!/usr/bin/env node
/**
 * Capture a bounded visual review matrix from the real WebGL/Core canvas.
 * MIT. No camera, screenshots of HTML stand-ins, dependency downloads, or model edits.
 *
 * Usage:
 *   PLAYWRIGHT_MODULE=/absolute/path/to/playwright node check-poses.cjs \
 *     --url http://127.0.0.1:8843/ --output work/pose-review
 *   node check-poses.cjs URL OUTPUT_DIR    # compatible positional form
 * Optional: PLAYWRIGHT_CHROMIUM_EXECUTABLE selects an existing Chromium binary.
 *
 * The output directory must be empty. The report validates parameter delivery,
 * loaded resource hashes, and finite geometry; a human must judge the images.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pngMagic = Buffer.from([137,80,78,71,13,10,26,10]);

function chromiumLaunchOptions() {
  const supplied=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  return {headless:true,...(supplied?.trim()?{executablePath:supplied}:{})};
}
function playwrightPackageInfo(moduleSpec) {
  try {
    let directory=path.dirname(require.resolve(moduleSpec));
    while(true) {
      const file=path.join(directory,'package.json');
      if(fs.existsSync(file)) {
        const info=JSON.parse(fs.readFileSync(file,'utf8'));
        if(['playwright','playwright-core','@playwright/test'].includes(info.name)) return {name:info.name,version:info.version};
      }
      const parent=path.dirname(directory); if(parent===directory) break; directory=parent;
    }
  } catch { /* A wrapper may not expose package metadata; never invent a version. */ }
  return {name:null,version:null};
}
function browserRuntimeInfo(browser,moduleSpec,launchOptions) {
  const info=playwrightPackageInfo(moduleSpec);
  return {name:'chromium',version:browser?.version()??null,playwrightPackage:info.name,
    playwrightVersion:info.version,explicitExecutablePath:Boolean(launchOptions.executablePath)};
}
function redactBrowserError(message) {
  let safe=String(message);
  const supplied=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if(supplied?.trim()) safe=safe.split(supplied).join('[explicit Chromium executable]');
  const userHome=process.env.HOME||process.env.USERPROFILE;
  if(userHome) safe=safe.split(userHome).join('[home]');
  return safe;
}

function usage() {
  return 'Usage: node check-poses.cjs --url HTTP_URL --output EMPTY_DIR [--max-frames 96] [--timeout-ms 60000]\n' +
    '       node check-poses.cjs HTTP_URL EMPTY_DIR\n' +
    'Install Playwright separately or set PLAYWRIGHT_MODULE to its module path.\n' +
    'Optional PLAYWRIGHT_CHROMIUM_EXECUTABLE selects an existing browser binary.\n' +
    'Produces canvas PNGs and poses.json; automated pass does not mean visual acceptance.';
}
function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return {help:true};
  const options = {maxFrames:96, timeoutMs:60000};
  const positional = [];
  for (let i=0; i<args.length; i++) {
    const key=args[i];
    if (!key.startsWith('--')) { positional.push(key); continue; }
    const field = {'--url':'url','--output':'output','--max-frames':'maxFrames','--timeout-ms':'timeoutMs'}[key];
    if (!field || !args[i+1] || args[i+1].startsWith('--')) throw new Error('Unknown or incomplete option: '+key);
    options[field] = args[++i];
  }
  if (positional.length) {
    if (positional.length!==2 || options.url || options.output) throw new Error('Use either URL OUTPUT_DIR or named options.');
    [options.url,options.output] = positional;
  }
  if (!options.url || !options.output) throw new Error(usage());
  const parsed = new URL(options.url);
  if (!['http:','https:'].includes(parsed.protocol)) throw new Error('Preview URL must use HTTP or HTTPS.');
  options.url=parsed.href; options.output=path.resolve(options.output);
  options.maxFrames=Number(options.maxFrames); options.timeoutMs=Number(options.timeoutMs);
  if (!Number.isInteger(options.maxFrames) || options.maxFrames<1 || options.maxFrames>500) throw new Error('--max-frames must be an integer from 1 through 500.');
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs<1000 || options.timeoutMs>300000) throw new Error('--timeout-ms must be from 1000 through 300000.');
  return options;
}
function parameterMap(parameters) {
  if (!Array.isArray(parameters) || !parameters.length) throw new Error('No native parameter descriptors.');
  const map = new Map();
  for (const p of parameters) {
    if (typeof p.id!=='string' || !p.id || map.has(p.id) || ![p.min,p.max,p.default].every(Number.isFinite) || p.min>p.max || p.default<p.min || p.default>p.max) throw new Error('Invalid or duplicate native parameter descriptor: '+JSON.stringify(p));
    map.set(p.id,p);
  }
  return map;
}
function validateValues(values, parameters) {
  for (const [id,value] of Object.entries(values)) {
    const p=parameters.get(id);
    if (!p) throw new Error('Unknown requested parameter: '+id);
    if (!Number.isFinite(value) || value<p.min || value>p.max) throw new Error(`${id}=${value} is outside declared [${p.min},${p.max}]. No silent clamping is permitted.`);
  }
}
function makePoseMatrix(parameters) {
  const map=parameterMap(parameters), poses=[], skipped=[];
  function add(name,values,views=['face'],category='face') {
    const missing=Object.keys(values).filter(id=>!map.has(id));
    if(missing.length) { skipped.push({name,reason:'Parameters absent from this model',missing}); return; }
    validateValues(values,map); poses.push({name,values,views,category});
  }
  add('neutral',{},['face','full'],'baseline');
  const eyeNames=new Map([[0,'eyes-closed'],[0.25,'eyes-25'],[0.5,'eyes-half'],[0.75,'eyes-75'],[0.85,'eyes-85'],[0.95,'eyes-95'],[1,'eyes-open']]);
  for (const [open,name] of eyeNames) add(name,{ParamEyeLOpen:open,ParamEyeROpen:open});
  add('wink-l',{ParamEyeLOpen:0}); add('wink-r',{ParamEyeROpen:0});
  for(const form of [-1,0,1]) for(const open of [0,.075,.15,.5,1]) {
    const name=open===1&&form===1?'mouth-smile-open':open===1&&form===-1?'mouth-frown-open':`mouth-form-${form}-open-${String(open).replace('.','p')}`;
    add(name,{ParamMouthForm:form,ParamMouthOpenY:open});
  }
  for(const axis of ['X','Y','Z']) {
    const id='ParamAngle'+axis,p=map.get(id);
    if(!p) { skipped.push({name:'head-'+axis,reason:'Parameter absent',missing:[id]}); continue; }
    for(const edge of ['min','max']) add(`head-${axis.toLowerCase()}-${edge}`,{[id]:p[edge]},['face','full'],'head');
  }
  // Two opposing diagonals supplement axis extremes without a Cartesian explosion.
  for(const [name,reverse] of [['head-left',false],['head-right',true]]) {
    const values={};
    for(const [i,axis] of ['X','Y','Z'].entries()) {
      const edge=((i%2===0)!==reverse)?'min':'max';
      const head='ParamAngle'+axis,body='ParamBodyAngle'+axis;
      if(map.has(head)) values[head]=map.get(head)[edge];
      if(map.has(body)) values[body]=map.get(body)[edge==='min'?'max':'min'];
    }
    if(Object.keys(values).length) add(name,values,['face','full'],'head-body-opposed');
  }
  for(const axis of ['X','Y','Z']) {
    const id='ParamBodyAngle'+axis,p=map.get(id);
    if(!p) { skipped.push({name:'body-'+axis,reason:'Parameter absent',missing:[id]}); continue; }
    for(const edge of ['min','max']) add(`body-${axis.toLowerCase()}-${edge}`,{[id]:p[edge]},['full'],'body');
  }
  for(const p of parameters.filter(p=>/hair/i.test(p.id))) for(const edge of ['min','max']) {
    // Numeric ordering avoids unsafe filenames if a model uses punctuation in IDs.
    const index=parameters.indexOf(p),safe=p.id.replace(/[^a-zA-Z0-9_-]/g,'_');
    add(`hair-${index}-${safe}-${edge}`,{[p.id]:p[edge]},['full','portrait'],'hair');
  }
  return {poses,skipped,frames:poses.reduce((n,p)=>n+p.views.length,0)};
}
function assertActualValues(state,requested,parameters) {
  if (!state || !state.parameters) throw new Error('Viewer did not return native parameter state.');
  for(const p of parameters.values()) {
    const expected=Object.hasOwn(requested,p.id)?requested[p.id]:p.default;
    const actual=state.parameters[p.id], tolerance=Math.max(0.0001,Math.abs(p.max-p.min)*1e-6);
    if(!Number.isFinite(actual)||Math.abs(actual-expected)>tolerance) throw new Error(`${p.id}: actual ${actual}, expected ${expected}, tolerance ${tolerance}`);
  }
  if(state.autoPlay || state.captureActive || state.pointerFollow) throw new Error('Pose capture was not in a deterministic paused state.');
}
function pngDimensions(bytes) {
  if(bytes.length<24||!bytes.subarray(0,8).equals(pngMagic)) throw new Error('Canvas did not return a valid PNG stream.');
  const result={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  if(result.width<2||result.height<2) throw new Error('Canvas dimensions are empty or degenerate.');
  return result;
}
function geometrySummary(drawables) {
  if(!Array.isArray(drawables?.positions)||!Array.isArray(drawables?.opacities)) throw new Error('Native drawable geometry is unavailable.');
  let coordinates=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const vertices of drawables.positions) {
    if(!Array.isArray(vertices)||vertices.length%2) throw new Error('Malformed native vertex array.');
    for(let i=0;i<vertices.length;i+=2) {
      const x=vertices[i],y=vertices[i+1];
      if(!Number.isFinite(x)||!Number.isFinite(y)) throw new Error('Non-finite native vertex.');
      minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y); coordinates+=2;
    }
  }
  if(!coordinates||drawables.opacities.some(x=>!Number.isFinite(x)||x<0||x>1.0001)) throw new Error('Invalid native drawables/opacities.');
  return {sha256:digest(JSON.stringify(drawables)),vertices:coordinates/2,bounds:{minX,minY,maxX,maxY},visibleDrawables:drawables.opacities.filter(x=>x>0).length,opacities:drawables.opacities};
}
async function run(options) {
  if(fs.existsSync(options.output)&&fs.readdirSync(options.output).length) throw new Error('Output directory is not empty; choose a new path: '+options.output);
  fs.mkdirSync(options.output,{recursive:true});
  const report={schema:'live2d-canvas-pose-review-v1',url:options.url,startedAt:new Date().toISOString(),automatedChecksPassed:false,visualReview:'pending',cameraRequests:[],errors:[],warnings:[],records:[]};
  const observed=[],pendingReads=[],modelBodies=new Map();
  let browser,page;
  const writeReport=()=>fs.writeFileSync(path.join(options.output,'poses.json'),JSON.stringify(report,null,2)+'\n');
  try {
    let chromium;
    const playwrightModule=process.env.PLAYWRIGHT_MODULE||'playwright';
    try { ({chromium}=require(playwrightModule)); }
    catch { throw new Error('Playwright is unavailable. Install it separately or set PLAYWRIGHT_MODULE; this script does not download dependencies.'); }
    const launchOptions=chromiumLaunchOptions();
    report.browser=browserRuntimeInfo(null,playwrightModule,launchOptions);
    browser=await chromium.launch(launchOptions);
    report.browser.version=browser.version();
    if(!report.browser.playwrightVersion) report.warnings.push('Playwright package version is unavailable from the selected module.');
    const context=await browser.newContext({viewport:{width:1200,height:1000},deviceScaleFactor:1,permissions:[]});
    page=await context.newPage(); page.setDefaultTimeout(options.timeoutMs);
    await page.addInitScript(()=>{
      window.__poseDeviceRequests=[];
      const deny=kind=>async()=>{window.__poseDeviceRequests.push(kind);throw new Error('Device capture is disabled during model pose review.');};
      if(navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia=deny('getUserMedia');
        navigator.mediaDevices.getDisplayMedia=deny('getDisplayMedia');
      }
      for(const key of ['getUserMedia','webkitGetUserMedia','mozGetUserMedia']) if(key in navigator) navigator[key]=deny(key);
    });
    page.on('pageerror',error=>report.errors.push(redactBrowserError(error.message)));
    page.on('response',response=>{
      const url=response.url(),pathname=new URL(url).pathname;
      if(!/\.(model3\.json|moc3|png)$/i.test(pathname)) return;
      pendingReads.push((async()=>{
        const record={url,status:response.status(),source:'actual-browser-response'}; observed.push(record);
        try {
          const bytes=await response.body(); record.bytes=bytes.length;record.sha256=digest(bytes);
          if(/\.png$/i.test(pathname)) record.dimensions=pngDimensions(bytes);
          if(/\.model3\.json$/i.test(pathname)) modelBodies.set(url,bytes);
        } catch(error) { record.readError=redactBrowserError(error.message); }
      })());
    });
    await page.goto(options.url,{waitUntil:'networkidle',timeout:options.timeoutMs});
    await page.waitForFunction(()=>window.previewApp?.viewer && window.previewApp.readyInfo);
    report.ready=await page.evaluate(()=>window.previewApp.readyInfo);
    report.counts=await page.evaluate(()=>window.previewApp.viewer.getModelCounts());
    if(report.ready.renderer!=='WebGL'||!report.ready.coreVersion||report.counts.drawables<1) throw new Error('Expected actual WebGL + Cubism Core with native drawables.');
    await Promise.all(pendingReads);
    const entryURL=report.ready.modelUrl,entry=modelBodies.get(entryURL);
    if(!entry) throw new Error('No captured browser response for the actual loaded model3 entry.');
    const settings=JSON.parse(entry.toString('utf8'));
    const expected=[{kind:'model3',url:entryURL},{kind:'moc3',url:new URL(settings.FileReferences.Moc,entryURL).href},...settings.FileReferences.Textures.map(file=>({kind:'texture',url:new URL(file,entryURL).href}))];
    for(const resource of expected) {
      const records=observed.filter(r=>r.url===resource.url);
      if(!records.length||records.some(r=>!r.sha256||r.readError||r.status<200||r.status>=400)) throw new Error('Could not prove loaded resource bytes: '+resource.url);
      if(resource.kind==='texture'&&Number.isFinite(report.ready.maxTextureSize)&&records.some(r=>r.dimensions.width>report.ready.maxTextureSize||r.dimensions.height>report.ready.maxTextureSize)) throw new Error('Loaded texture exceeds the actual WebGL limit.');
    }
    report.loadedResources={modelUrl:entryURL,expected,observed};
    const descriptors=parameterMap(report.ready.parameters),matrix=makePoseMatrix(report.ready.parameters);
    report.declaredParameters=report.ready.parameters;
    report.matrix={poses:matrix.poses.length,plannedFrames:matrix.frames,skipped:matrix.skipped,maxFrames:options.maxFrames};
    if(matrix.frames>options.maxFrames) throw new Error(`Pose matrix needs ${matrix.frames} frames, exceeding --max-frames ${options.maxFrames}. Raise the limit explicitly if this model has many hair parameters.`);
    for(const pose of matrix.poses) for(const view of pose.views) {
      validateValues(pose.values,descriptors);
      const captured=await page.evaluate(({values,view})=>{
        const a=window.previewApp,v=a.viewer;
        a.capture?.stop(); v.reset();
        if(!v.setView(view)) throw new Error('Unsupported inspection view: '+view);
        for(const [id,value] of Object.entries(values)) if(!v.setParameter(id,value)) throw new Error('Viewer rejected parameter: '+id);
        v.renderNow();
        return {image:v.capture(),state:v.getState(),drawables:v.getDrawableState()};
      },{values:pose.values,view});
      assertActualValues(captured.state,pose.values,descriptors);
      if(typeof captured.image!=='string'||!captured.image.startsWith('data:image/png;base64,')) throw new Error('Expected PNG bytes from viewer.capture() canvas API.');
      const bytes=Buffer.from(captured.image.slice('data:image/png;base64,'.length),'base64'),dimensions=pngDimensions(bytes);
      const geometry=geometrySummary(captured.drawables),file=`${pose.name}-${view}.png`;
      fs.writeFileSync(path.join(options.output,file),bytes,{flag:'wx'});
      report.records.push({file,name:pose.name,category:pose.category,view,requested:pose.values,state:captured.state,parameterValuesVerified:true,canvas:{...dimensions,bytes:bytes.length,sha256:digest(bytes),source:'viewer.capture()/HTMLCanvasElement.toDataURL'},geometry});
      if(report.records.length%12===0) { writeReport(); console.log(`Captured ${report.records.length}/${matrix.frames} actual WebGL canvas frames`); }
    }
    report.cameraRequests=await page.evaluate(()=>window.__poseDeviceRequests);
    if(report.cameraRequests.length) throw new Error('A device access request occurred during pose review.');
    if(report.errors.length) throw new Error('Browser exceptions occurred during pose review.');
    report.automatedChecksPassed=true;
  } catch(error) {
    report.failure=redactBrowserError(error.message); process.exitCode=1;
    if(page) try { report.cameraRequests=await page.evaluate(()=>window.__poseDeviceRequests||[]); } catch { /* Preserve the original failure. */ }
  } finally {
    report.finishedAt=new Date().toISOString();
    // Flush metadata even after a failed frame, and always release the browser.
    try { await browser?.close(); } finally { writeReport(); }
  }
  console.log(JSON.stringify({automatedChecksPassed:report.automatedChecksPassed,visualReview:report.visualReview,frames:report.records.length,report:path.join(options.output,'poses.json'),failure:report.failure}));
  return report;
}
module.exports={parseArgs,parameterMap,validateValues,makePoseMatrix,assertActualValues,pngDimensions,geometrySummary,
  chromiumLaunchOptions,playwrightPackageInfo,browserRuntimeInfo,redactBrowserError,run};
if(require.main===module) {
  let options;
  try { options=parseArgs(process.argv.slice(2)); }
  catch(error) { console.error(error.message);process.exitCode=1; }
  if(options?.help) console.log(usage());
  else if(options) run(options).catch(error=>{console.error(error.message);process.exitCode=1;});
}
