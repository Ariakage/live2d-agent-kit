'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {progress,syntheticValues,timing,matchResources}=require('../examples/pink-sakura/check-continuous.cjs');
test('continuous path holds, reverses midway, repeats, and restores endpoints',()=>{
 for(const [t,v]of [[0,0],[.18,1],[.24,1],[.3,1],[.42,.35],[.52,.75],[.68,0],[.84,1],[1,0]])assert.ok(Math.abs(progress(t)-v)<1e-9);
 for(let i=0;i<=1000;i++)assert.ok(progress(i/1000)>=0&&progress(i/1000)<=1);
 const params=[{id:'ParamHairA',min:-1,max:1,default:0}];
 for(const kind of ['face-cycle','body-hair-cycle'])for(const t of [0,1]){
  const values=syntheticValues(kind,t,params);assert.ok(Math.abs(values.ParamHairA)<1e-9);
  assert.ok(Math.abs(values.ParamAngleX)<1e-9);
 }
});
test('new body and accessory paths return to neutral and do not create absent targets',()=>{
 const names=['ParamWaistSway','ParamShoulderLiftL','ParamUpperArmRSwing','ParamFloat','ParamBowSwing'];
 const params=names.map(id=>({id,min:-1,max:1,default:0}));
 for(const kind of ['body-native-cycle','accessory-cycle'])for(let i=0;i<=100;i++){
  const values=syntheticValues(kind,i/100,params);
  for(const id of names){assert.ok(Math.abs(values[id])<=1);if(i===0||i===100)assert.ok(Math.abs(values[id])<1e-9);}
  assert.equal(values.ParamSleeveLSwing,undefined);
 }
 assert.notEqual(syntheticValues('body-native-cycle',.24,params).ParamWaistSway,0);
 assert.notEqual(syntheticValues('accessory-cycle',.24,params).ParamBowSwing,0);
});
test('frame timing uses completed timestamps and rejects empty or reversed traces',()=>{
 assert.deepEqual(timing([{timeMs:0},{timeMs:16},{timeMs:150}]),{frames:3,durationMs:150,maxGapMs:134,gapsOver100ms:1});
 assert.throws(()=>timing([]));assert.throws(()=>timing([{timeMs:2},{timeMs:2}]));
});
test('actual response bytes must match frozen manifest',()=>{
 const url='http://localhost/model/a.moc3',observed=[{url,status:200,sha256:'abc',bytes:42}],manifest={files:{'model/a.moc3':'abc'}};
 assert.equal(matchResources([url],observed,manifest,'http://localhost/')[0].bytes,42);
 assert.throws(()=>matchResources([url],[],manifest,'http://localhost/'));
 assert.throws(()=>matchResources([url],[{...observed[0],sha256:'old'}],manifest,'http://localhost/'));
 assert.throws(()=>matchResources(['http://other/a'],observed,manifest,'http://localhost/'));
});
