/** Real Core/UI with synthetic tracking callbacks and temporary expression responses; no devices. */
const {faceFixture,poseFixture}=require('../tests/tracking_fixtures.cjs');
module.exports=async function checkFeatures(page,{entryURL,settings,check,report}) {
  const ids=await page.evaluate(()=>window.previewApp.viewer.getParameters().map(p=>p.id));
  if(!['ParamMouthOpenY','ParamEyeLOpen'].every(id=>ids.includes(id)))throw new Error('Feature regression requires native mouth and left-eye parameters');
  const smile={FadeInTime:.25,FadeOutTime:.25,Parameters:[{Id:'ParamMouthOpenY',Value:.12,Blend:'Add'},{Id:'ParamEyeLOpen',Value:.8,Blend:'Multiply'}]};
  const wink={FadeInTime:.25,Parameters:[{Id:'ParamEyeLOpen',Value:0,Blend:'Overwrite'}]};
  const expressions=[['CheckSmile',smile],['CheckWink',wink]];
  const modified=JSON.parse(JSON.stringify(settings));
  modified.FileReferences.Expressions=expressions.map(([name])=>({Name:name,File:`__preview-test-${name}.exp3.json`}));
  await page.route(entryURL,route=>route.fulfill({json:modified}));
  for(const [name,data]of expressions)await page.route(new URL(`__preview-test-${name}.exp3.json`,entryURL).href,route=>route.fulfill({json:data}));
  report.interactionFeatures={scope:'Real Core/WebGL; synthetic tracking callbacks and temporary expression fixtures. No physical camera or inference, no 30-minute run.',runtimeAssetsModified:false};
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.previewApp?.viewer);
  await page.click('[data-profile="talk"]');await page.waitForTimeout(150);
  await page.click('[data-expression="CheckSmile"]');await page.waitForTimeout(450);
  check('expression selection keeps simulation running',await page.evaluate(()=>window.previewApp.capture.mode==='simulation'&&!window.previewApp.capture.paused));
  const {base,actual}=await page.evaluate(()=>{const a=window.previewApp;a.viewer.renderNow();document.querySelector('#capture-pause').click();return {base:a.capture.getState().parameters,actual:a.viewer.getState().parameters};});
  check('expression overlays captured mouth and eyelid once',Math.abs(actual.ParamMouthOpenY-Math.min(1,base.ParamMouthOpenY+.12))<.0001&&Math.abs(actual.ParamEyeLOpen-base.ParamEyeLOpen*.8)<.0001,{base:{mouth:base.ParamMouthOpenY,eye:base.ParamEyeLOpen},actual:{mouth:actual.ParamMouthOpenY,eye:actual.ParamEyeLOpen}});
  const before=await page.evaluate(()=>window.previewApp.viewer.getState());await page.waitForTimeout(200);
  check('paused expression and source stay frozen',JSON.stringify(before.parameters)===await page.evaluate(()=>JSON.stringify(window.previewApp.viewer.getState().parameters)));
  await page.click('[data-expression="CheckWink"]');await page.waitForTimeout(100);
  const middle=await page.evaluate(()=>window.previewApp.viewer.getState().parameters.ParamEyeLOpen);
  await page.waitForTimeout(350);
  check('paused capture allows a smooth expression change',middle>0&&middle<actual.ParamEyeLOpen&&await page.evaluate(()=>window.previewApp.viewer.getState().parameters.ParamEyeLOpen===0&&window.previewApp.capture.paused));
  await page.click('[data-expression=""]');await page.waitForTimeout(400);
  check('clearing paused expression restores unexpressed source',await page.evaluate(base=>{const p=window.previewApp.viewer.getState().parameters;return Math.abs(p.ParamMouthOpenY-base.ParamMouthOpenY)<.0001&&Math.abs(p.ParamEyeLOpen-base.ParamEyeLOpen)<.0001;},base));
  await page.click('#capture-pause');await page.waitForTimeout(100);
  check('resume restores live input',await page.evaluate(()=>window.previewApp.viewer.getState().captureActive&&!window.previewApp.viewer.getState().capturePaused));
  await page.evaluate(async()=>{const v=window.previewApp.viewer;window.previewApp.capture.stop();v.reset();v.setParameter('ParamEyeLOpen',.31);await v.setExpression('CheckWink',{immediate:true});v.renderNow();});
  check('native manual controls retain precedence',await page.evaluate(()=>Math.abs(window.previewApp.viewer.getState().parameters.ParamEyeLOpen-.31)<.0001));
  // A delayed older fetch must not override either a newer expression or reset.
  const delayedURL=new URL('__preview-test-CheckWink.exp3.json',entryURL).href;
  await page.unroute(delayedURL);await page.route(delayedURL,async route=>{await new Promise(resolve=>setTimeout(resolve,150));await route.fulfill({json:wink});});
  check('stale async expression cannot replace newer state or reset',await page.evaluate(async()=>{
    const v=window.previewApp.viewer;v.reset();const old=v.setExpression('CheckWink');await v.setExpression('CheckSmile',{immediate:true});await old;
    const newer=v.getState().expression==='CheckSmile';const pending=v.setExpression('CheckWink');v.reset();await pending;v.renderNow();
    return newer&&v.getState().expression===''&&v.getParameters().every(p=>Math.abs(p.value-p.default)<.0001);
  }));
  // Exercise the actual app callbacks with synthetic geometry, never getUserMedia.
  const face=faceFixture().faceLandmarks[0],pose=poseFixture().landmarks[0];
  for(const [a,b,top,bottom,ring,x]of [[33,133,159,145,469,.35],[362,263,386,374,474,.65]]){
    face[a]={x:x-.05,y:.4};face[b]={x:x+.05,y:.4};face[top]={x,y:.38};face[bottom]={x,y:.42};
    for(let i=0;i<4;i++)face[ring+i]={x:x+.01,y:.405};
  }
  await page.check('#camera-nodes');await page.check('#camera-gaze');
  await page.evaluate(()=>{const a=window.previewApp;a.capture.startCameraInput();a.camera.announce({status:'running'});});
  await page.click('[data-soak-start]');
  await page.evaluate(({face,pose})=>{
    const a=window.previewApp,t=performance.now();
    a.camera.onFrame({timestamp:t,faceVisible:true,bodyVisible:true,inputs:{FaceAngleX:7},metrics:{frames:1}});
    a.camera.publishLandmarks({width:640,height:480,faceTimestamp:t,poseTimestamp:t,faceVisible:true,bodyVisible:true,faceLandmarks:face,poseLandmarks:pose,eyeOpen:{left:1,right:1}});
  },{face,pose});
  check('nodes and gaze render without video display',await page.evaluate(()=>{const s=window.previewApp.landmarkOverlay.getState();return s.faceNodes===478&&s.poseNodes===8&&s.gazeVectors===2&&!s.showVideo&&!document.querySelector('#camera-preview').hidden;}));
  await page.uncheck('#camera-nodes');
  check('gaze display is independent from nodes',await page.evaluate(()=>{const s=window.previewApp.landmarkOverlay.getState();return s.faceNodes===0&&s.gazeVectors===2;}));
  await page.uncheck('#camera-gaze');
  check('hiding overlay clears points without stopping capture',await page.evaluate(()=>!window.previewApp.landmarkOverlay.getState().hasLandmarks&&window.previewApp.capture.mode==='camera'));
  await page.click('[data-expression="CheckSmile"]');
  check('expression selection preserves camera input ownership',await page.evaluate(()=>window.previewApp.capture.mode==='camera'));
  check('statistics receive new numeric inference frames only',await page.evaluate(()=>{const a=window.previewApp;const before=a.acceptance.monitor.report(performance.now()).samples;a.camera.onFrame({timestamp:performance.now(),faceVisible:true,inputs:{},metrics:{frames:1}});return before===1&&a.acceptance.monitor.report(performance.now()).samples===1;}));
  await page.click('#capture-pause');
  check('pause ends the statistics session without claiming completion',await page.evaluate(()=>{const r=window.previewApp.acceptance.monitor.report(performance.now());return !r.active&&r.stopReason==='capture-paused'&&!r.camera30MinutesCompleted&&!r.savedMedia&&!r.savedLandmarks&&!r.savedInputReplay;}));
  const [download]=await Promise.all([page.waitForEvent('download'),page.click('[data-soak-save]')]);
  check('aggregate JSON can be downloaded',download.suggestedFilename()==='live2d-camera-soak.json');
  await page.click('#camera-stop');await page.click('#reset-all');
  check('stop clears diagnostics and returns native defaults',await page.evaluate(()=>{const a=window.previewApp;return !a.landmarkOverlay.getState().hasLandmarks&&a.viewer.getParameters().every(p=>Math.abs(p.value-p.default)<.0001)&&document.querySelector('#expression-status').textContent==='表情已清除';}));
};
