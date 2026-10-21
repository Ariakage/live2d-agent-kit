#!/usr/bin/env node
// MIT. Real Core/WebGL regression against a separately served, unchanged baseline.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromiumLaunchOptions,browserRuntimeInfo}=require('./check-poses.cjs');
async function run(url,baseline,out) {
 if(!url||!baseline||!out)throw new Error('Usage: check-dynamics.cjs CANDIDATE_URL BASELINE_URL EMPTY_OUTPUT');
 if(fs.existsSync(out)&&fs.readdirSync(out).length)throw new Error('Output must be empty');
 fs.mkdirSync(out,{recursive:true});
 const moduleSpec=process.env.PLAYWRIGHT_MODULE||'playwright',options=chromiumLaunchOptions();
 const browser=await require(moduleSpec).chromium.launch(options),report={pass:false,cameraTested:false,vtubeStudioTested:false,checks:[]};
 const check=(name,pass,detail)=>{report.checks.push({name,pass,detail});assert.ok(pass,name);};
 try {
  report.browser=browserRuntimeInfo(browser,moduleSpec,options);
  const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:1});
  await page.addInitScript(()=>{window.__devices=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{window.__devices++;throw new Error('No devices in dynamics check');};});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function neutral(address,label) {
   await page.goto(address,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.previewApp?.viewer);
   const result=await page.evaluate(()=>{const v=window.previewApp.viewer;window.previewApp.capture.stop();v.reset();v.setView('face');v.renderNow();return {image:v.capture(),ready:window.previewApp.readyInfo};});
   const bytes=Buffer.from(result.image.split(',')[1],'base64');fs.writeFileSync(path.join(out,label+'.png'),bytes);
   result.pngSha256=crypto.createHash('sha256').update(bytes).digest('hex');return result;
  }
  const old=await neutral(baseline,'baseline-face'),next=await neutral(url,'candidate-face');
  report.baseline={modelUrl:old.ready.modelUrl,pngSha256:old.pngSha256};report.candidate={modelUrl:next.ready.modelUrl,pngSha256:next.pngSha256};
  const compare=await page.evaluate(async([a,b])=>{
   async function pixels(src){const image=new Image();image.src=src;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return {data:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height};}
   const x=await pixels(a),y=await pixels(b);if(x.width!==y.width||x.height!==y.height)throw new Error('Mismatched framing');
   const scale=Math.min(x.width/390,x.height/365)*.94,ox=x.width/2-501*scale,oy=x.height/2-182.5*scale;
   const roi={x0:Math.ceil(ox+400*scale),y0:Math.ceil(oy+178*scale),x1:Math.floor(ox+598*scale),y1:Math.floor(oy+323*scale)};
   let changed=0,faceChanged=0,max=0;
   for(let j=0;j<x.height;j++)for(let i=0;i<x.width;i++){
    const k=(j*x.width+i)*4,delta=Math.max(...Array.from({length:4},(_,c)=>Math.abs(x.data[k+c]-y.data[k+c])));
    if(delta){changed++;if(i>=roi.x0&&i<=roi.x1&&j>=roi.y0&&j<=roi.y1)faceChanged++;max=Math.max(max,delta);}
   }
   return {width:x.width,height:x.height,roi,changedPixels:changed,faceChangedPixels:faceChanged,maxChannelDifference:max};
  },[old.image,next.image]);
  check('approved neutral face pixels preserved',compare.faceChangedPixels===0,compare);
  for(const [id,direction] of [['ParamUpperArmLSwing',1],['ParamUpperArmRSwing',-1]]) {
   const movement=await page.evaluate(([id])=>{
    const v=window.previewApp.viewer;v.reset();v.renderNow();
    const before=v.getDrawableState().positions;
    if(!v.setParameter(id,1))throw new Error('Missing arm parameter: '+id);
    v.renderNow();const after=v.getDrawableState().positions;
    let changedVertices=0,totalDx=0,minDx=Infinity,maxDx=-Infinity;
    for(let mesh=0;mesh<before.length;mesh++)for(let vertex=0;vertex<before[mesh].length;vertex+=2) {
     const dx=after[mesh][vertex]-before[mesh][vertex];
     if(!Number.isFinite(dx))throw new Error('Nonfinite arm displacement');
     if(Math.abs(dx)>1e-5){changedVertices++;totalDx+=dx;minDx=Math.min(minDx,dx);maxDx=Math.max(maxDx,dx);}
    }
    v.reset();v.renderNow();
    return {changedVertices,meanDx:changedVertices?totalDx/changedVertices:0,
      minDx:changedVertices?minDx:0,maxDx:changedVertices?maxDx:0,coordinateSystem:'Core model x, positive toward image-right'};
   },[id]);
   check(`${id} positive input moves outward`,movement.changedVertices>0&&movement.meanDx*direction>0,movement);
  }
  const transition=await page.evaluate(async()=>{
   const v=window.previewApp.viewer;v.reset();v.setParameter('ParamAngleX',12);v.renderNow();await v.playMotion('Curious');v.renderNow();
   const first=v.getState().parameters.ParamAngleX;await new Promise(r=>setTimeout(r,750));const before=v.getState().parameters.ParamAngleX;
   await v.playMotion('Airy');v.renderNow();const after=v.getState().parameters.ParamAngleX;return {first,before,after};
  });
  check('manual and repeated motion handoffs preserve outgoing pose',Math.abs(transition.first-12)<.001&&Math.abs(transition.after-transition.before)<.001,transition);
  const wind=await page.evaluate(async()=>{
   const v=window.previewApp.viewer;v.reset();v.setCaptureParameters({ParamWind:1});const samples=[];
   for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,250));samples.push(v.getState().parameters.ParamWindSway);}v.reset();return samples;
  });
  check('wind input drives native secondary parameter over time',wind.some(x=>Math.abs(x)>.05),wind);
  await page.check('#speech-bob');await page.check('#capture-breathing');await page.click('[data-profile="talk"]');await page.waitForTimeout(650);
  await page.click('#capture-pause');const frozen=await page.evaluate(()=>JSON.stringify(window.previewApp.viewer.getState().parameters));await page.waitForTimeout(300);
  check('speech and ambient accents freeze with capture',frozen===await page.evaluate(()=>JSON.stringify(window.previewApp.viewer.getState().parameters)));
  await page.click('#capture-stop');
  check('stop clears auxiliary offsets',await page.evaluate(()=>window.previewApp.viewer.getParameters().every(p=>Math.abs(p.value-p.default)<.0001)));
  check('no devices or browser errors',await page.evaluate(()=>window.__devices===0)&&!errors.length,errors);
  report.pass=true;
 } catch(error){report.failure=error.message;process.exitCode=1;}
 finally{await browser.close();fs.writeFileSync(path.join(out,'dynamics.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({pass:report.pass,failure:report.failure}));
}
if(require.main===module)run(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});
