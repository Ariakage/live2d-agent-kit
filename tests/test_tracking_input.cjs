const {test}=require('node:test');
const assert=require('node:assert/strict');
const input=()=>import('../templates/web-preview/tracking-input.js');

test('extended body mappings only emit supported native parameters and respect calibration, strength and loss',async()=>{
  const {INPUTS,mapInput}=await input();
  const specs=INPUTS.filter(s=>s.normalized),descriptors=specs.map(s=>({id:s.target,min:-.5,max:2,default:.25}));
  assert.equal(specs.length,6);
  const values=Object.fromEntries(specs.map(s=>[s.id,.6]));
  const offsets=Object.fromEntries(specs.map(s=>[s.id,.2]));
  const mapped=mapInput(values,{strength:.5,offsets,descriptors});
  for(const value of Object.values(mapped)) assert.ok(Math.abs(value-.6)<1e-10);
  assert.deepEqual(mapInput(values,{descriptors:[]}),{});
  for(const value of Object.values(mapInput(values,{bodyVisible:false,descriptors}))) assert.equal(value,.25);
  assert.deepEqual(Object.keys(mapInput(values,{descriptors:descriptors.slice(0,1)})),[specs[0].target]);
});
test('body simulation exercises all six proxies, loops continuously and leaves face-only input alone',async()=>{
  const {INPUTS,simulateInput,DURATION}=await input(),specs=INPUTS.filter(s=>s.normalized);
  for(const spec of specs) {
    const samples=Array.from({length:240},(_,i)=>simulateInput(i/10,'body')[spec.id]);
    assert.ok(Math.max(...samples)>.4);assert.ok(Math.min(...samples)<-.4);
    assert.equal(simulateInput(2,'face')[spec.id],0);
    assert.ok(samples.every(v=>Number.isFinite(v)&&v>=-1&&v<=1));
    assert.ok(Math.abs(simulateInput(DURATION-1e-5,'body')[spec.id]-simulateInput(DURATION+1e-5,'body')[spec.id])<1e-4);
  }
});
