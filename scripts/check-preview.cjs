#!/usr/bin/env node
/** Real browser/Core smoke test; no hidden camera/device fallback. */
// Optional PLAYWRIGHT_CHROMIUM_EXECUTABLE selects an existing Chromium binary.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const playwrightModule=process.env.PLAYWRIGHT_MODULE||'playwright';
let chromium;try{({chromium}=require(playwrightModule));}catch{console.error('Install Playwright separately or set PLAYWRIGHT_MODULE to an existing module. No dependencies are downloaded by this script.');process.exit(1);}
function playwrightPackageInfo(moduleSpec){
  try{let directory=path.dirname(require.resolve(moduleSpec));while(true){
    const file=path.join(directory,'package.json');
    if(fs.existsSync(file)){const info=JSON.parse(fs.readFileSync(file,'utf8'));if(['playwright','playwright-core','@playwright/test'].includes(info.name))return{name:info.name,version:info.version};}
    const parent=path.dirname(directory);if(parent===directory)break;directory=parent;
  }}catch{/* A wrapper may not expose package metadata. */}return{name:null,version:null};
}
function redactBrowserError(message){let safe=String(message);const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;if(executable?.trim())safe=safe.split(executable).join('[explicit Chromium executable]');const userHome=process.env.HOME||process.env.USERPROFILE;if(userHome)safe=safe.split(userHome).join('[home]');return safe;}
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const url=arg('--url','http://127.0.0.1:8793/'),out=path.resolve(arg('--output','work/preview-smoke.json'));
const screenshotDir=arg('--screenshots',null);
const report={url,checks:[],warnings:[],errors:[],cameraRequests:0};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function pngDimensions(bytes){return bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)}:null;}
async function snapshot(page,name){if(!screenshotDir)return;fs.mkdirSync(screenshotDir,{recursive:true});const file=path.resolve(screenshotDir,name+'.png');await page.screenshot({path:file,fullPage:true});(report.screenshots??={})[name]=file;}
const check=(name,ok,detail)=>{report.checks.push({name,pass:Boolean(ok),detail});if(!ok)throw new Error(name+': '+JSON.stringify(detail));};
(async()=>{let browser;try{
  const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const launchOptions={headless:true,...(executable?.trim()?{executablePath:executable}:{})};
  const packageInfo=playwrightPackageInfo(playwrightModule);
  report.browser={name:'chromium',version:null,playwrightPackage:packageInfo.name,playwrightVersion:packageInfo.version,explicitExecutablePath:Boolean(launchOptions.executablePath)};
  browser=await chromium.launch(launchOptions);
  report.browser.version=browser.version();
  if(!packageInfo.version)report.warnings.push('Playwright package version is unavailable from the selected module.');
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  await page.addInitScript(()=>{window.__cameraCalls=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{window.__cameraCalls++;throw new Error('Camera/microphone forbidden in smoke test');};});
  page.on('pageerror',error=>report.errors.push(redactBrowserError(error.message)));
  // Install before navigation: these are bytes returned to this browser's actual
  // model requests, never a later fetch that merely resembles the loaded input.
  const observed=[], responseReads=[];
  page.on('response',response=>{
    const resourceURL=response.url();
    if (!/\.(model3\.json|moc3|png)$/i.test(new URL(resourceURL).pathname)) return;
    responseReads.push((async()=>{
      const record={url:resourceURL,status:response.status(),source:'browser-response'};
      observed.push(record);
      try {const bytes=await response.body();record.bytes=bytes.length;record.sha256=digest(bytes);record.texture=pngDimensions(bytes);record.body=bytes;}
      catch(error){record.readError=redactBrowserError(error.message);}
    })());
  });
  await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.previewApp?.viewer,{timeout:45000});
  const initial=await page.evaluate(()=>{const a=window.previewApp;return {ready:a.readyInfo,counts:a.viewer.getModelCounts(),state:a.viewer.getState()};});
  await Promise.all(responseReads);
  const entryURL=initial.ready.modelUrl;
  const entry=observed.find(r=>r.url===entryURL&&r.body&&r.status>=200&&r.status<400);
  report.loadedResources={modelUrl:entryURL,observed:observed.map(({body,...record})=>record)};
  check('model entry captured from actual browser response',Boolean(entry),{modelUrl:entryURL});
  const settings=JSON.parse(entry.body.toString('utf8'));
  const expectedResources=[{kind:'model3',url:entryURL},{kind:'moc3',url:new URL(settings.FileReferences.Moc,entryURL).href},...settings.FileReferences.Textures.map(file=>({kind:'texture',url:new URL(file,entryURL).href}))];
  for(const expected of expectedResources){
    const records=observed.filter(r=>r.url===expected.url);
    check('actual loaded resource recorded: '+expected.kind,records.length>0&&records.every(r=>r.sha256&&!r.readError&&r.status>=200&&r.status<400),{url:expected.url});
    if(expected.kind==='texture')check('texture dimensions within WebGL limit',records.every(r=>r.texture&&r.texture.width<=initial.ready.maxTextureSize&&r.texture.height<=initial.ready.maxTextureSize),records.map(r=>({url:r.url,texture:r.texture})));
  }
  // The manifest is metadata only. It is intentionally separate from captured
  // model/MOC/PNG response evidence, and never substitutes for a missing record.
  const manifestURL=new URL('preview-manifest.json',url).href;
  const manifestResponse=await page.request.get(manifestURL);
  if(manifestResponse.status()===404){report.loadedResources.manifest={present:false};report.warnings.push('No preview-manifest.json: captured loaded file hashes are recorded, but there is no prepared-file manifest to compare.');}
  else {
    check('prepared manifest readable',manifestResponse.ok(),{url:manifestURL,status:manifestResponse.status()});
    const bytes=await manifestResponse.body(), manifest=JSON.parse(bytes.toString('utf8'));
    const manifestRoot=new URL('./',manifestURL);
    report.loadedResources.manifest={present:true,url:manifestURL,sha256:digest(bytes),matched:[]};
    check('manifest model entry matches runtime',new URL(manifest.modelEntry,manifestRoot).href===entryURL,{manifestEntry:manifest.modelEntry,modelUrl:entryURL});
    for(const expected of expectedResources){
      const target=new URL(expected.url);
      const relative=target.origin===manifestRoot.origin&&target.pathname.startsWith(manifestRoot.pathname)?decodeURIComponent(target.pathname.slice(manifestRoot.pathname.length)):null;
      const expectedHash=relative&&manifest.files?.[relative];
      const records=observed.filter(r=>r.url===expected.url);
      check('loaded bytes match prepared manifest: '+expected.kind,typeof expectedHash==='string'&&records.length>0&&records.every(r=>r.sha256===expectedHash),{path:relative,expectedSha256:expectedHash||null,observedSha256:records.map(r=>r.sha256)});
      report.loadedResources.manifest.matched.push({path:relative,sha256:expectedHash});
    }
  }
  report.runtime={coreVersionNumber:initial.ready.coreVersionNumber,coreVersion:initial.ready.coreVersion,renderer:initial.ready.renderer,maxTextureSize:initial.ready.maxTextureSize,requestedClippingMaskSize:initial.ready.requestedClippingMaskSize,clippingMaskSize:initial.ready.clippingMaskSize};
  check('real Cubism Core and native drawables',Boolean(initial.ready.coreVersion)&&initial.ready.renderer==='WebGL'&&initial.counts.drawables>0,initial.counts);
  await snapshot(page,'neutral');
  const tested=await page.evaluate(()=>{
    const v=window.previewApp.viewer;v.reset();const descriptors=v.getParameters();const results=[];
    for(const p of descriptors){if(p.max===p.min)continue;v.clearParameters();v.renderNow();const before=JSON.stringify(v.getDrawableState());const value=p.default!==p.max?p.max:p.min;v.setParameter(p.id,value);v.renderNow();results.push({id:p.id,requested:value,actual:v.getState().parameters[p.id],geometryChanged:before!==JSON.stringify(v.getDrawableState())});}
    v.reset();v.renderNow();return {results,defaults:v.getParameters()};
  });
  check('manual parameters reach native Core',tested.results.length>0&&tested.results.every(p=>Math.abs(p.actual-p.requested)<.0001),tested.results);
  check('reset restores native defaults',tested.defaults.every(p=>Math.abs(p.value-p.default)<.0001));
  const visible=tested.results.filter(p=>p.geometryChanged).map(p=>p.id);if(!visible.length)report.warnings.push('No tested parameter changed drawable geometry/opacity; this model may lack visible bindings. Do not claim working face/body tracking.');
  report.visibleBindingEvidence=visible;
  report.parametersWithoutObservedGeometryChange=tested.results.filter(p=>!p.geometryChanged).map(p=>p.id);
  await page.click('[data-profile="all"]');await page.waitForTimeout(500);
  const first=await page.evaluate(()=>window.previewApp.capture.getState());await page.waitForTimeout(350);const next=await page.evaluate(()=>window.previewApp.capture.getState());
  check('simulation advances',next.frame>first.frame&&next.time>first.time);
  const supported=Object.keys(next.parameters);report.simulatedTargets=supported;if(!supported.length)report.warnings.push('No standard input mappings found; configure inputMapping for this model.');
  check('simulator only writes native targets',supported.every(id=>initial.ready.parameters.some(p=>p.id===id)));
  await page.click('#capture-pause');await page.waitForTimeout(100);const frozen=await page.evaluate(()=>({capture:window.previewApp.capture.getState(),model:window.previewApp.viewer.getState().parameters,geometry:window.previewApp.viewer.getDrawableState()}));await page.waitForTimeout(400);const later=await page.evaluate(()=>({capture:window.previewApp.capture.getState(),model:window.previewApp.viewer.getState().parameters,geometry:window.previewApp.viewer.getDrawableState()}));
  check('pause freezes timeline, parameters and physics',frozen.capture.time===later.capture.time&&JSON.stringify(frozen.model)===JSON.stringify(later.model)&&JSON.stringify(frozen.geometry)===JSON.stringify(later.geometry));
  await page.evaluate(()=>window.previewApp.capture.seek(11.25));check('timeline seeks while paused',await page.evaluate(()=>window.previewApp.capture.paused&&Math.abs(window.previewApp.capture.time-11.25)<.0001));
  check('mapped simulated values reach Core',await page.evaluate(()=>{const a=window.previewApp;const actual=a.viewer.getState().parameters;return Object.entries(a.capture.getState().parameters).every(([id,value])=>Math.abs(actual[id]-value)<.0001);}));
  await snapshot(page,'simulated-paused');
  await page.click('#capture-stop');await page.waitForTimeout(100);check('stop restores defaults',await page.evaluate(()=>window.previewApp.viewer.getParameters().every(p=>Math.abs(p.value-p.default)<.0001)));
  report.cameraRequests=await page.evaluate(()=>window.__cameraCalls);check('no camera or microphone request',report.cameraRequests===0);check('no browser exceptions',report.errors.length===0,report.errors);
  await page.setViewportSize({width:390,height:844});check('mobile no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  report.pass=true;
}catch(error){report.pass=false;report.failure=redactBrowserError(error.message);process.exitCode=1;}finally{await browser?.close();fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,report:out,warnings:report.warnings,failure:report.failure}));}})();
