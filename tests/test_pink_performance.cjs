const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {buildPerformance,buildRuntime}=require('../examples/pink-sakura/build-performance.cjs');
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/pink-sakura/verification/native-core.json')));
const extras=['Float','Wind','ChestExpand','WaistSway','ShoulderLiftL','ShoulderLiftR','UpperArmLSwing','UpperArmRSwing'];
const parameters=[...base.parameters.map(({id,min,max,default:value})=>({id,min,max,default:value})),
  ...extras.filter(name=>!base.parameters.some(p=>p.id==='Param'+name))
    .map(name=>({id:'Param'+name,min:-1,max:1,default:0}))];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

test('eight expressions retain camera blink and mouth inputs without unsupported art',()=>{
  const {Expressions}=buildPerformance(parameters);
  assert.deepEqual(Object.keys(Expressions),['Smile','SoftSmile','WinkLeft','WinkRight','Surprised','Smug','Angry','Sleepy']);
  for(const expression of Object.values(Expressions)) {
    assert.equal(expression.Type,'Live2D Expression');
    assert.ok(expression.FadeInTime>0&&expression.FadeOutTime>0);
    assert.equal(expression.Parameters.length,6);
    for(const row of expression.Parameters) {
      assert.ok(Number.isFinite(row.Value));
      if(row.Id.startsWith('ParamEye'))assert.equal(row.Blend,'Multiply');
      if(row.Id==='ParamMouthOpenY')assert.equal(row.Blend,'Add');
    }
  }
  assert.equal(Expressions.WinkLeft.Parameters.find(p=>p.Id==='ParamEyeLOpen').Value,0);
  assert.equal(Expressions.WinkRight.Parameters.find(p=>p.Id==='ParamEyeROpen').Value,0);
});
test('motion metadata, all Bezier controls, ranges and neutral loop joins agree',()=>{
  const {Motions}=buildPerformance(parameters),ranges=new Map(parameters.map(p=>[p.id,p]));
  assert.deepEqual(Object.keys(Motions),['Quiet','Curious','Sleepy','Airy','SlowBlink','SpeechBob']);
  for(const [name,motion] of Object.entries(Motions)) {
    let segmentCount=0,pointCount=0;
    assert.equal(motion.Version,3);
    assert.equal(motion.Meta.CurveCount,motion.Curves.length);
    assert.equal(motion.Meta.FadeInTime,.6);assert.equal(motion.Meta.FadeOutTime,.6);
    assert.equal(motion.FadeInTime,undefined);assert.equal(motion.FadeOutTime,undefined);
    for(const curve of motion.Curves) {
      const s=curve.Segments,p=ranges.get(curve.Id);assert.ok(p);pointCount++;
      assert.equal(s[0],0);assert.equal(s.at(-2),motion.Meta.Duration);
      let lastTime=0;
      for(let i=2;i<s.length;i+=7) {
        assert.equal(s[i],1);
        for(let j=i+1;j<i+7;j+=2) {
          assert.ok(s[j]>=lastTime,`${name}: non-monotone control time`);
          assert.ok(s[j+1]>=p.min&&s[j+1]<=p.max);lastTime=s[j];
        }
        segmentCount++;pointCount+=3;
      }
      assert.equal((s.length-2)%7,0);
      if(motion.Meta.Loop) {
        assert.equal(s[1],s.at(-1));assert.equal(s[1],p.default);
      }
    }
    assert.equal(motion.Meta.TotalSegmentCount,segmentCount);
    assert.equal(motion.Meta.TotalPointCount,pointCount);
  }
});
test('recipe rejects missing, duplicate or incompatible native parameters',()=>{
  assert.throws(()=>buildPerformance(parameters.filter(p=>p.id!=='ParamFloat')),/Missing native parameter/);
  assert.throws(()=>buildPerformance([...parameters,parameters[0]]),/Invalid native/);
  assert.throws(()=>buildPerformance(parameters.map(p=>p.id==='ParamWind'?{...p,min:-.01,max:.01}:p)),/outside native/);
});
test('candidate export preserves MOC, original motions and source files; refuses stale proof and repeated writes',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pink-performance-'));
  try {
    const model={Version:3,FileReferences:{Moc:'PinkSakura.moc3',Textures:['atlas.png'],
      Motions:{Idle:[{File:'original-idle.json'}],Blink:[{File:'original-blink.json'}]}}};
    const moc=Buffer.from('test fixture only'),modelPath=path.join(tmp,'PinkSakura.model3.json');
    fs.writeFileSync(modelPath,JSON.stringify(model));fs.writeFileSync(path.join(tmp,'PinkSakura.moc3'),moc);
    fs.writeFileSync(path.join(tmp,'original-idle.json'),'original idle');
    const proof=path.join(tmp,'native-core.json');
    fs.writeFileSync(proof,JSON.stringify({validator:'local-official-cubism-core',passed:true,sha256:'stale',parameters}));
    assert.throws(()=>buildRuntime(tmp,proof),/matching this candidate/);
    assert.equal(fs.readFileSync(modelPath,'utf8'),JSON.stringify(model));
    fs.writeFileSync(proof,JSON.stringify({validator:'local-official-cubism-core',passed:true,sha256:sha(moc),parameters}));
    const source=path.join(__dirname,'../examples/pink-sakura/runtime/PinkSakura.model3.json');
    const sourceBefore=fs.readFileSync(source);
    assert.equal(buildRuntime(tmp,proof).expressions.length,8);
    const after=JSON.parse(fs.readFileSync(modelPath));
    assert.deepEqual(after.FileReferences.Motions.Idle,model.FileReferences.Motions.Idle);
    assert.deepEqual(after.FileReferences.Motions.Blink,model.FileReferences.Motions.Blink);
    assert.deepEqual(fs.readFileSync(path.join(tmp,'PinkSakura.moc3')),moc);
    assert.equal(fs.readFileSync(path.join(tmp,'original-idle.json'),'utf8'),'original idle');
    assert.deepEqual(fs.readFileSync(source),sourceBefore);
    assert.throws(()=>buildRuntime(tmp,proof),/already contains expressions/);
    assert.throws(()=>buildRuntime(path.dirname(source),proof),/protected/);
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});
test('conflicting output is rejected before any candidate file changes',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pink-performance-collision-'));
  try {
    const moc=Buffer.from('fixture'),modelFile=path.join(tmp,'PinkSakura.model3.json');
    fs.writeFileSync(path.join(tmp,'PinkSakura.moc3'),moc);
    const original=JSON.stringify({FileReferences:{Moc:'PinkSakura.moc3',Motions:{}}});
    fs.writeFileSync(modelFile,original);
    fs.writeFileSync(path.join(tmp,'PinkSakura.Quiet.exp3.json'),'not relevant');
    fs.writeFileSync(path.join(tmp,'PinkSakura.quiet.motion3.json'),'keep existing');
    const proof=path.join(tmp,'proof.json');
    fs.writeFileSync(proof,JSON.stringify({validator:'local-official-cubism-core',passed:true,sha256:sha(moc),parameters}));
    assert.throws(()=>buildRuntime(tmp,proof),/Refusing to overwrite/);
    assert.equal(fs.readFileSync(modelFile,'utf8'),original);
    assert.ok(!fs.existsSync(path.join(tmp,'PinkSakura.Smile.exp3.json')));
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});
test('a copied recipe runs without the published runtime, source or verification directories',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pink-performance-copy-'));
  try {
    const recipe=path.join(tmp,'recipe'),candidate=path.join(tmp,'candidate');
    fs.mkdirSync(recipe);fs.mkdirSync(candidate);
    const script=path.join(recipe,'build-performance.cjs');
    fs.copyFileSync(path.join(__dirname,'../examples/pink-sakura/build-performance.cjs'),script);
    const copied=require(script),moc=Buffer.from('fixture');
    fs.writeFileSync(path.join(candidate,'PinkSakura.moc3'),moc);
    fs.writeFileSync(path.join(candidate,'PinkSakura.model3.json'),JSON.stringify({FileReferences:{Moc:'PinkSakura.moc3',Motions:{}}}));
    const proof=path.join(tmp,'proof.json');
    fs.writeFileSync(proof,JSON.stringify({validator:'local-official-cubism-core',passed:true,sha256:sha(moc),parameters}));
    assert.equal(copied.buildRuntime(candidate,proof).motions.length,6);
    assert.equal(fs.existsSync(path.join(recipe,'runtime')),false);
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});
