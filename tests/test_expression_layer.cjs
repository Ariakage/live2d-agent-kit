const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../templates/web-preview/expression-layer.js');
const apply=(layer,input)=>{const output={...input};layer.apply(id=>input[id],(id,value)=>output[id]=value);return output;};
const settle=layer=>{for(let i=0;i<30;i++)layer.step(.05);};

test('expressions follow changing source input without accumulating offsets',async()=>{
  const {ExpressionLayer}=await load(),layer=new ExpressionLayer();
  layer.set([{Id:'mouth',Value:.2,Blend:'Add'},{Id:'eye',Value:.5,Blend:'Multiply'}],0);
  for(let i=0;i<100;i++)assert.deepEqual(apply(layer,{mouth:.1,eye:.8}),{mouth:.1+.2,eye:.4});
  assert.deepEqual(apply(layer,{mouth:.6,eye:.2}),{mouth:.8,eye:.1});
});
test('fade, interrupted replacement and clearing preserve continuity',async()=>{
  const {ExpressionLayer}=await load(),layer=new ExpressionLayer();
  layer.set([{Id:'eye',Value:0,Blend:'Overwrite'}],.4);
  layer.step(.05);const partial=apply(layer,{eye:1}).eye;assert.ok(partial>0&&partial<1);
  layer.set([{Id:'eye',Value:.6,Blend:'Overwrite'}],.2);
  assert.equal(apply(layer,{eye:1}).eye,partial);settle(layer);
  assert.equal(apply(layer,{eye:1}).eye,.6);
  layer.set([],.2);assert.equal(apply(layer,{eye:1}).eye,.6);settle(layer);
  assert.deepEqual(apply(layer,{eye:.7}),{eye:.7});assert.equal(layer.current.size,0);
});
test('paused time is inert; explicit zero-duration clear resets immediately',async()=>{
  const {ExpressionLayer}=await load(),layer=new ExpressionLayer();
  layer.set([{Id:'mouth',Value:.4}],.35);layer.step(.05);
  const frozen=apply(layer,{mouth:.1});
  for(const dt of [0,NaN,-1,Infinity]){layer.step(dt);assert.deepEqual(apply(layer,{mouth:.1}),frozen);}
  layer.set([],0);assert.deepEqual(apply(layer,{mouth:.1}),{mouth:.1});
  layer.set([{Id:'mouth',Value:.5}],0);layer.reset();assert.deepEqual(apply(layer,{mouth:.1}),{mouth:.1});
});
test('invalid rows and absent native parameters cannot produce non-finite writes',async()=>{
  const {ExpressionLayer}=await load(),layer=new ExpressionLayer();
  layer.set([null,{Id:'mouth',Value:NaN},{Id:'mouth',Value:.2,Blend:'unknown'},
    {Id:'',Value:1},{Id:'missing',Value:1},{Id:'mouth',Value:.3}],-1);
  settle(layer);assert.deepEqual(apply(layer,{mouth:.2}),{mouth:.5});
});
test('multiple rows for one parameter retain file order',async()=>{
  const {ExpressionLayer}=await load(),layer=new ExpressionLayer();
  layer.set([{Id:'x',Value:.2},{Id:'x',Value:2,Blend:'Multiply'},{Id:'x',Value:.1}],0);
  assert.equal(apply(layer,{x:.3}).x,(.3+.2)*2+.1);
});
