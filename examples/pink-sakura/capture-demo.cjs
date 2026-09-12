#!/usr/bin/env node
// MIT. Record a small synthetic-input demonstration from the actual WebGL model.
// Usage: PLAYWRIGHT_MODULE=/path/to/playwright node capture-demo.cjs URL EMPTY_DIR
// Optional: PLAYWRIGHT_CHROMIUM_EXECUTABLE selects an existing Chromium binary.
// Encode after capture with the FFmpeg command in README.md. No camera is used.
const fs=require('node:fs'),path=require('node:path');
const playwrightModule=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=require(playwrightModule);
const {parameterMap,validateValues,assertActualValues,chromiumLaunchOptions,browserRuntimeInfo,redactBrowserError}=require('./check-poses.cjs');
async function main(){
 const [url,out]=process.argv.slice(2);
 if(!url||!out||!['http:','https:'].includes(new URL(url).protocol)) throw new Error('Usage: node capture-demo.cjs HTTP_URL EMPTY_DIR');
 if(fs.existsSync(out)&&fs.readdirSync(out).length) throw new Error('Output must be empty.');
 fs.mkdirSync(out,{recursive:true});
 let browser;
 const evidence={kind:'actual-webgl-synthetic-input-demo',url,fps:12,frames:[],complete:false};
 try{
  const launchOptions=chromiumLaunchOptions();
  evidence.browser=browserRuntimeInfo(null,playwrightModule,launchOptions);
  browser=await chromium.launch(launchOptions);
  evidence.browser.version=browser.version();
  if(!evidence.browser.playwrightVersion)evidence.warnings=['Playwright package version is unavailable from the selected module.'];
  const context=await browser.newContext({viewport:{width:1050,height:1000},deviceScaleFactor:1,permissions:[]});
  const page=await context.newPage();
  await page.addInitScript(()=>{
   window.__demoDeviceRequests=0;
   if(navigator.mediaDevices) for(const key of ['getUserMedia','getDisplayMedia'])
    navigator.mediaDevices[key]=async()=>{window.__demoDeviceRequests++;throw new Error('Device capture disabled');};
  });
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.previewApp?.readyInfo);
  evidence.ready=await page.evaluate(()=>window.previewApp.readyInfo);
  if(evidence.ready.renderer!=='WebGL') throw new Error('Actual WebGL is required.');
  const parameters=parameterMap(evidence.ready.parameters);
  const canvas=page.locator('canvas').first();
  for(let i=0;i<72;i++){
   const phase=2*Math.PI*i/72;
   const blink=Math.max(0,1-Math.exp(-Math.pow((i-23)/1.6,2)));
   const values={ParamAngleX:18*Math.sin(phase),ParamAngleY:6*Math.cos(phase),
    ParamAngleZ:10*Math.sin(phase),ParamBodyAngleX:-3*Math.sin(phase),ParamBreath:.5+.5*Math.sin(phase),
    ParamEyeLOpen:blink,ParamEyeROpen:blink,ParamMouthForm:.6,
    ParamMouthOpenY:.32*Math.pow(Math.sin(phase*3),2)};
   for(const [id,offset]of [['ParamBrowLY',0],['ParamBrowRY',.35]]) if(parameters.has(id))
    values[id]=.7*Math.sin(phase+offset);
   for(const [index,p] of [...parameters.values()].filter(p=>/hair/i.test(p.id)).entries()) values[p.id]=.35*Math.sin(phase+index*.4);
   validateValues(values,parameters);
   const state=await page.evaluate(values=>{
    const a=window.previewApp,v=a.viewer;a.capture.stop();v.reset();v.setView('portrait');
    for(const [id,value]of Object.entries(values))v.setParameter(id,value);
    v.renderNow();return v.getState();
   },values);
   assertActualValues(state,values,parameters);
   const file=`frame-${String(i).padStart(3,'0')}.png`;
   // An element screenshot retains the page's real backdrop; it does not repaint art.
   await canvas.screenshot({path:path.join(out,file)});
   evidence.frames.push({file,requested:values,actual:state.parameters});
  }
  evidence.deviceRequests=await page.evaluate(()=>window.__demoDeviceRequests);
  if(evidence.deviceRequests)throw new Error('Unexpected device request.');
  evidence.complete=true;
 }catch(error){
  evidence.failure=redactBrowserError(error.message);throw new Error(evidence.failure);
 }finally{
  try{fs.writeFileSync(path.join(out,'demo.json'),JSON.stringify(evidence,null,2)+'\n');}
  finally{await browser?.close();}
 }
 console.log(`Recorded ${evidence.frames.length} real WebGL frames at ${evidence.fps} fps.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
