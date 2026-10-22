const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../templates/web-preview/gesture-handoff.js');

test('interrupting a raised gesture lowers the same hand before changing its form',async()=>{
  const {GestureHandoff}=await load(),handoff=new GestureHandoff();
  const completed=handoff.start({ParamArmRLift:1,ParamArmRPose:2,ParamHandRForm:3,ParamHandRWave:.5});
  let previous=1,frames=0;
  while(handoff.active) {
    const p=handoff.step(1/60);frames++;
    assert.ok(p.ParamArmRLift<=previous+1e-10);previous=p.ParamArmRLift;
    if(p.ParamArmRLift>0) {
      assert.equal(p.ParamHandRForm,3);assert.equal(p.ParamArmRPose,2);
    }
    assert.ok(frames<80);
  }
  assert.equal(await completed,true);
  assert.deepEqual(handoff.values,{ParamArmRLift:0,ParamArmRPose:0,ParamHandRForm:0,ParamHandRWave:0});
  assert.ok(frames>=72);
});
test('superseding or cancelling a return resolves its waiter and cannot start a stale motion',async()=>{
  const {GestureHandoff}=await load(),handoff=new GestureHandoff();
  const pose={ParamArmRLift:.7,ParamArmRPose:0,ParamHandRForm:1,ParamHandRWave:0};
  const first=handoff.start(pose);handoff.step(.1);
  const second=handoff.start(pose);assert.equal(await first,false);
  handoff.cancel();assert.equal(await second,false);assert.equal(handoff.step(.1),null);
  assert.equal(await handoff.start({}),true);
  assert.equal(await handoff.start({...pose,ParamArmRLift:0,ParamHandRForm:0}),true);
});
