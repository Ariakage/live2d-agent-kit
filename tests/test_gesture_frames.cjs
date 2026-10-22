const {test}=require('node:test');
const assert=require('node:assert/strict');
const {auditFrames}=require('../examples/pink-sakura/check-gestures.cjs');
const sequence=()=>Array.from({length:101},(_,i)=>({timeMs:i*17,parameters:{ParamArmRLift:i>10&&i<90?.5:0},minimumTriangleAreaRatio:.09,visibleHands:i>10&&i<90?1:0}));
test('gesture audit permits hidden swaps in lowered cuff, rejects lost raised hands and overlaps',()=>{
 assert.equal(auditFrames(sequence()).passed,true);
 const missing=sequence();missing[50].visibleHands=0;assert.throws(()=>auditFrames(missing),/missing raised hand/);
 const overlap=sequence();overlap[50].visibleHands=2;assert.throws(()=>auditFrames(overlap),/overlapping/);
});
test('gesture audit rejects missed intervals, reversed time and collapsed triangles',()=>{
 const gap=sequence();gap[60].timeMs+=300;assert.throws(()=>auditFrames(gap));
 const reversed=sequence();reversed[60].timeMs=0;assert.throws(()=>auditFrames(reversed),/Nonmonotonic/);
 const flat=sequence();flat[50].minimumTriangleAreaRatio=0;assert.throws(()=>auditFrames(flat),/geometry/);
});
