const {test}=require('node:test');
const assert=require('node:assert/strict');
test('auxiliary breath/wind/float stay finite, low amplitude and have a seamless loop',async()=>{
  const {DYNAMICS,captureBreath,captureWind,captureFloat,floatProfileScale}=await import('../templates/web-preview/dynamics-config.js');
  assert.equal(DYNAMICS.breathingDefaultEnabled,false);
  for(const time of [NaN,Infinity,-Infinity,...Array.from({length:481},(_,i)=>i/10-24)]) {
    assert.ok(captureBreath(time)>=0&&captureBreath(time)<=.1561);
    assert.ok(Math.abs(captureWind(time))<=.0801);
    assert.ok(Math.abs(captureFloat(time))<=.1921);
  }
  for(const fn of [captureBreath,captureWind]) assert.ok(Math.abs(fn(12-1e-5)-fn(12+1e-5))<1e-8);
  for(const fn of [captureBreath,captureWind,captureFloat]) assert.ok(Math.abs(fn(24-1e-5)-fn(24+1e-5))<1e-5);
  assert.equal(captureFloat(2,'low'),.144);assert.equal(captureFloat(2,'high'),.24);
  assert.equal(floatProfileScale('toString'),.8);assert.equal(floatProfileScale('__proto__'),.8);
});
test('speech follow has bounded attack/release independent of render FPS',async()=>{
  const {SpeechBob}=await import('../templates/web-preview/speech-bob.js');
  const results=[];
  for(const fps of [15,30,60,120]) {
    const bob=new SpeechBob();
    for(let i=0;i<fps;i++)bob.step(1,1/fps);
    assert.ok(bob.output.angleY<-.3&&bob.output.angleY>=-.35);
    assert.ok(bob.output.float>0&&bob.output.float<=.06);
    for(let i=0;i<fps;i++)bob.step(0,1/fps);
    results.push(bob.output.angleY);
  }
  for(const value of results)assert.ok(Math.abs(value-results[0])<1e-10);
});
test('speech follow freezes when inactive, resets when disabled and handles stale time/input',async()=>{
  const {SpeechBob}=await import('../templates/web-preview/speech-bob.js'),bob=new SpeechBob();
  bob.step(1,1);const held={...bob.output};
  assert.deepEqual(bob.step(0,1,{active:false}),held);
  for(const seconds of [0,-1,NaN,Infinity])assert.deepEqual(bob.step(0,seconds),held);
  assert.ok(bob.step(NaN,10).float<.00001);
  bob.step(1,.5);assert.deepEqual(bob.step(1,.1,{enabled:false}),{angleY:0,float:0});
});
