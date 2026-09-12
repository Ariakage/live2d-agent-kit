import {createViewer} from './runtime.js';
import {CaptureController} from './capture-controller.js';
import {CameraTracker} from './camera-tracker.js';
import {INPUTS, mapInput} from './tracking-input.js';
import {MODEL_URL,MODEL_LABEL,REFERENCE_URL,DOWNLOAD_URL,INPUT_MAPPING,CAMERA_ASSETS,CAPTURE_HOLD_DEFAULTS} from './view-config.js';
const $=s=>document.querySelector(s);
let viewer,readyInfo,camera,showingReference=false;
const parameterControls=new Map(),inputControls=new Map();
const capture=new CaptureController({getViewer:()=>viewer,holdParameterDefaults:CAPTURE_HOLD_DEFAULTS,onPrepare:()=>{
  viewer.setAutoPlay(false);viewer.setPointerFollow(false);viewer.clearParameters();viewer.setExpression('');
  $('#auto-play').checked=false;$('#pointer-follow').checked=false;
},onSourceStop:()=>camera?.stop(),onState:state=>{
  $('#capture-status').textContent=state.message;
  $('#capture-pause').disabled=state.mode==='idle';$('#capture-stop').disabled=state.mode==='idle';
  $('#capture-calibrate').disabled=state.mode==='idle'||state.mode==='camera';$('#capture-pause').textContent=state.paused?'继续':'暂停';
  $('#capture-speed').disabled=state.mode==='camera';$('#simulated-visibility').hidden=state.mode==='camera';
  $('#capture-time').disabled=state.mode!=='simulation';$('#capture-time').value=state.time;
  $('#capture-time-value').textContent=`${state.time.toFixed(1)} / 24 秒`;
  for(const [id,c] of inputControls){c.input.value=state.inputs[id];c.output.value=Number(state.inputs[id]).toFixed(2);}
  renderMonitor(state);
}});
camera=new CameraTracker({video:$('#camera-video'),assets:CAMERA_ASSETS,
  onFrame:frame=>capture.updateCameraFrame(frame),onState:state=>{
    const active=['starting','running'].includes(state.status);
    $('#camera-start').disabled=!CAMERA_ASSETS||!viewer||active;
    $('#camera-stop').disabled=!active;$('#camera-calibrate').disabled=state.status!=='running';
    $('#camera-body').disabled=active;
    $('#camera-preview').hidden=!active||!$('#camera-show').checked;
    if (state.status==='error' && capture.mode==='camera') capture.stop();
    $('#camera-status').textContent=state.message||'摄像头未开启';
  }});
window.previewApp={get viewer(){return viewer;},capture,camera,get readyInfo(){return readyInfo;}};
function renderMonitor(state){
  const native=viewer?.getState().parameters || {};
  $('#capture-monitor').replaceChildren(...INPUTS.map(s=>{
    const p=document.createElement('div'),override=INPUT_MAPPING[s.id];
    const target=override===false?null:override?.target||s.target;
    p.textContent=`${s.id} → ${target||'已禁用'}: ${target in native?Number(native[target]).toFixed(3):'未映射 / 模型未提供'}`;
    return p;
  }));
}
function control(parent,label,id,min,max,value,onInput){
  const row=document.createElement('label');row.className='range';row.append(document.createTextNode(label));
  const output=document.createElement('output');output.value=Number(value).toFixed(2);row.append(output);
  const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=Math.max((max-min)/500,.001);input.value=value;input.dataset.id=id;input.setAttribute('aria-label',label);row.append(input);
  input.addEventListener('input',()=>{output.value=Number(input.value).toFixed(2);onInput(Number(input.value));});parent.append(row);return {input,output,row};
}
function takeManual(){capture.stop({reset:false});viewer.setAutoPlay(false);viewer.setPointerFollow(false);viewer.setExpression('');$('#auto-play').checked=false;$('#pointer-follow').checked=false;}
function reset(){capture.stop();viewer.reset();$('#auto-play').checked=false;$('#pointer-follow').checked=false;$('#zoom').value=1;for(const b of document.querySelectorAll('[data-view]'))b.classList.toggle('selected',b.dataset.view==='full');viewer.renderNow();updateParameters(viewer.getState().parameters);}
function updateParameters(parameters){for(const [id,c] of parameterControls){if(document.activeElement!==c.input)c.input.value=parameters[id];c.output.value=Number(parameters[id]).toFixed(3);}}
$('#model-label').textContent=MODEL_LABEL;
if(REFERENCE_URL){$('#reference').src=REFERENCE_URL;$('#reference-toggle').hidden=false;}
if(DOWNLOAD_URL){$('#download').href=DOWNLOAD_URL;$('#download').hidden=false;}
$('#reference-toggle').onclick=()=>{if(viewer)reset();showingReference=!showingReference;$('#reference').hidden=!showingReference;$('#model-canvas').hidden=showingReference;$('#reference-toggle').textContent=showingReference?'返回真实模型':'显示静态参考';};
$('#camera-start').onclick=async()=>{
  if (!CAMERA_ASSETS || !viewer) return;
  if (showingReference) {showingReference=false;$('#reference').hidden=true;$('#model-canvas').hidden=false;$('#reference-toggle').textContent='显示静态参考';}
  if (!capture.startCameraInput()) return;
  try {await camera.start({bodyEnabled:$('#camera-body').checked});}
  catch(error) {
    if (error.name==='AbortError') return;
    if (capture.mode==='camera') capture.stop();
    $('#camera-status').textContent=error.message;
  }
};
$('#camera-stop').onclick=()=>{capture.stop();camera.stop();};
$('#camera-calibrate').onclick=()=>{
  const result=camera.calibrate();
  if (result===false) $('#camera-status').textContent='请正视镜头，识别到面部后再校准。';
};
$('#camera-show').onchange=e=>$('#camera-preview').hidden=!e.target.checked||!['starting','running'].includes(camera.getState().status);
// Returning to a backgrounded tab requires an explicit new camera start.
document.addEventListener('visibilitychange',()=>{if(document.hidden&&capture.mode==='camera')capture.stop();});
window.addEventListener('pagehide',()=>{capture.stop({reset:false,announce:false});camera.stop();});
$('#background').onchange=e=>$('#stage').dataset.background=e.target.value;
$('#reset-all').onclick=()=>reset();
$('#auto-play').onchange=e=>{capture.stop({reset:false});viewer.setAutoPlay(e.target.checked);};
$('#pointer-follow').onchange=e=>{capture.stop({reset:false});viewer.setAutoPlay(e.target.checked);$('#auto-play').checked=e.target.checked;viewer.setPointerFollow(e.target.checked);};
$('#zoom').oninput=e=>viewer?.setZoom(Number(e.target.value));
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{viewer?.setView(button.dataset.view);$('#zoom').value=1;for(const b of document.querySelectorAll('[data-view]'))b.classList.toggle('selected',b===button);};
for(const button of document.querySelectorAll('[data-profile]'))button.onclick=()=>capture.startSimulation(button.dataset.profile);
$('#capture-pause').onclick=()=>capture.paused?capture.resume():capture.pause();$('#capture-stop').onclick=()=>capture.stop();$('#capture-calibrate').onclick=()=>capture.calibrate();$('#capture-time').oninput=e=>capture.seek(Number(e.target.value));
for(const key of ['speed','strength','smoothing'])$('#capture-'+key).oninput=e=>capture.setOptions({[key]:Number(e.target.value)});
$('#face-visible').onchange=e=>capture.setOptions({faceVisible:e.target.checked});$('#body-visible').onchange=e=>capture.setOptions({bodyVisible:e.target.checked});
try {
  viewer=await createViewer({canvas:$('#model-canvas'),modelUrl:MODEL_URL,onReady:info=>{readyInfo=info;},onStats:stats=>{
    $('#render-info').textContent=`Cubism Core ${readyInfo?.coreVersion||''} · WebGL · ${stats.fps} FPS · ${readyInfo?.parameters.length||0} 个实际参数`;
    updateParameters(stats.parameters);if(capture.mode!=='idle')renderMonitor(capture.getState());
  }});
  $('#controls').disabled=false;$('#status').textContent=`真实模型已加载 · Core ${readyInfo.coreVersion}`;$('#parameter-count').textContent=readyInfo.parameters.length;
  $('#camera-start').disabled=!CAMERA_ASSETS;
  if (!CAMERA_ASSETS) $('#camera-status').textContent='此预览未带识别依赖。先运行 setup-tracking.py，再用 prepare-preview.py --tracking-dir 准备页面。';
  for(const p of readyInfo.parameters)parameterControls.set(p.id,control($('#parameters'),p.name===p.id?p.id:`${p.name} · ${p.id}`,p.id,p.min,p.max,p.default,v=>{takeManual();viewer.setParameter(p.id,v);viewer.renderNow();}));
  const mapped=mapInput({}, {descriptors:readyInfo.parameters});
  for(const s of INPUTS){const c=control($('#capture-inputs'),`${s.label} · ${s.id}`,s.id,s.min,s.max,s.value,v=>capture.setInput(s.id,v));const target=INPUT_MAPPING[s.id]===false?null:INPUT_MAPPING[s.id]?.target||s.target;if(!(target in mapped)){c.input.disabled=true;c.row.classList.add('unavailable');c.row.title='模型无此映射目标；不会声称支持此输入';}inputControls.set(s.id,c);}
  const known=Object.keys(mapped);$('#capability-note').textContent=`可写入 ${known.length} 个跟踪目标；${readyInfo.physics?'已加载模型物理配置':'此模型未提供物理配置'}。眉毛输入需要独立眉毛绑定；存在参数仍需检查可见效果。左右按模型解剖命名，视频仅镜像显示。未实现手臂或手指绑定。`;
  for(const name of readyInfo.expressions){const b=document.createElement('button');b.textContent=`表情：${name}`;b.onclick=()=>{takeManual();viewer.setExpression(name);};$('#expressions').append(b);}
  for(const name of readyInfo.motions){const b=document.createElement('button');b.textContent=`动作：${name}`;b.onclick=()=>{takeManual();viewer.playMotion(name);};$('#motions').append(b);}
  viewer.renderNow();renderMonitor(capture.getState());
} catch(error){$('#status').textContent='真实模型载入失败';$('#load-error').hidden=false;$('#load-error').textContent=`${error.message}\n请先运行 prepare-preview.py，提供自己已合法获取的 Core、Pixi 与 Live2D 渲染依赖，并用本地 server.py 打开。此页不会用静态图片或假动画代替真实 Core。`;console.error(error);}
