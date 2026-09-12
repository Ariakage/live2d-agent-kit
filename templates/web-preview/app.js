import {createViewer} from './runtime.js';
import {CaptureController} from './capture-controller.js';
import {INPUTS, mapInput} from './tracking-input.js';
import {MODEL_URL,MODEL_LABEL,REFERENCE_URL,DOWNLOAD_URL,INPUT_MAPPING} from './view-config.js';
const $=s=>document.querySelector(s);
let viewer,readyInfo,showingReference=false;
const parameterControls=new Map(),inputControls=new Map();
const capture=new CaptureController({getViewer:()=>viewer,onPrepare:()=>{
  viewer.setAutoPlay(false);viewer.setPointerFollow(false);viewer.clearParameters();viewer.setExpression('');
  $('#auto-play').checked=false;$('#pointer-follow').checked=false;
},onState:state=>{
  $('#capture-status').textContent=state.message;
  $('#capture-pause').disabled=state.mode==='idle';$('#capture-stop').disabled=state.mode==='idle';
  $('#capture-calibrate').disabled=state.mode==='idle';$('#capture-pause').textContent=state.paused?'继续':'暂停';
  $('#capture-time').disabled=state.mode!=='simulation';$('#capture-time').value=state.time;
  $('#capture-time-value').textContent=`${state.time.toFixed(1)} / 24 秒`;
  for(const [id,c] of inputControls){c.input.value=state.inputs[id];c.output.value=Number(state.inputs[id]).toFixed(2);}
  renderMonitor(state);
}});
window.previewApp={get viewer(){return viewer;},capture,get readyInfo(){return readyInfo;}};
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
  for(const p of readyInfo.parameters)parameterControls.set(p.id,control($('#parameters'),p.name===p.id?p.id:`${p.name} · ${p.id}`,p.id,p.min,p.max,p.default,v=>{takeManual();viewer.setParameter(p.id,v);viewer.renderNow();}));
  const mapped=mapInput({}, {descriptors:readyInfo.parameters});
  for(const s of INPUTS){const c=control($('#capture-inputs'),`${s.label} · ${s.id}`,s.id,s.min,s.max,s.value,v=>capture.setInput(s.id,v));const target=INPUT_MAPPING[s.id]===false?null:INPUT_MAPPING[s.id]?.target||s.target;if(!(target in mapped)){c.input.disabled=true;c.row.classList.add('unavailable');c.row.title='模型无此映射目标；不会声称支持此输入';}inputControls.set(s.id,c);}
  const known=Object.keys(mapped);$('#capability-note').textContent=`可写入 ${known.length} 个跟踪目标；${readyInfo.physics?'已加载模型物理配置':'此模型未提供物理配置'}。这里只验证参数存在，可见变形仍需动作检查。未实现手指、手臂、眉毛跟踪输入；左右眼按模型解剖命名，请核对自己的绑定。`;
  for(const name of readyInfo.expressions){const b=document.createElement('button');b.textContent=`表情：${name}`;b.onclick=()=>{takeManual();viewer.setExpression(name);};$('#expressions').append(b);}
  for(const name of readyInfo.motions){const b=document.createElement('button');b.textContent=`动作：${name}`;b.onclick=()=>{takeManual();viewer.playMotion(name);};$('#motions').append(b);}
  viewer.renderNow();renderMonitor(capture.getState());
} catch(error){$('#status').textContent='真实模型载入失败';$('#load-error').hidden=false;$('#load-error').textContent=`${error.message}\n请先运行 prepare-preview.py，提供自己已合法获取的 Core、Pixi 与 Live2D 渲染依赖，并用本地 server.py 打开。此页不会用静态图片或假动画代替真实 Core。`;console.error(error);}
