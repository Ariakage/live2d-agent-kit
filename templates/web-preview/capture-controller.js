import {INPUTS, NEUTRAL_INPUT, DURATION, clamp, simulateInput, mapInput} from './tracking-input.js';

/** Drives exactly one synthetic tracking source. No camera, network, or microphone APIs. */
export class CaptureController {
  constructor({getViewer, onPrepare, onState}={}) {
    this.getViewer=getViewer; this.onPrepare=onPrepare; this.onState=onState;
    this.mode='idle'; this.profile='all'; this.paused=false; this.time=0;
    this.options={strength:1,smoothing:.3,speed:1,faceVisible:true,bodyVisible:true};
    this.inputs={...NEUTRAL_INPUT}; this.offsets={}; this.parameters={};
    this.frame=0; this.generation=0; this.raf=0; this.lastTime=0; this.lastPublish=0;
    this.message='选择一组模拟输入，或手动调节信号。';
  }
  getState() {
    return {mode:this.mode,profile:this.profile,paused:this.paused,time:this.time,duration:DURATION,
      options:{...this.options},inputs:{...this.inputs},parameters:{...this.parameters},
      offsets:{...this.offsets},frame:this.frame,message:this.message,
      lastDetection:{face:this.options.faceVisible,body:this.options.bodyVisible}};
  }
  publish() { this.onState?.(this.getState()); }
  prepare(mode, profile) {
    if (!this.getViewer()) return false;
    this.stop({reset:false,announce:false});
    this.mode=mode; this.profile=profile; this.paused=false; this.time=0;
    this.inputs={...NEUTRAL_INPUT}; this.offsets={}; this.parameters={};
    this.onPrepare?.(profile);
    // Unmapped parameters remain native defaults or physics outputs.
    this.parameters={};
    this.message=mode==='input'?'手动输入 · 信号正在驱动模型':'模拟输入运行中';
    return true;
  }
  startSimulation(profile='all') {
    if (!['all','face','blink','talk','body'].includes(profile)) return false;
    if (!this.prepare('simulation',profile)) return false;
    this.apply(0,true); this.schedule(); this.publish(); return true;
  }
  startManualInput() {
    if (this.mode==='input') return true;
    if (!this.prepare('input','manual')) return false;
    this.apply(0,true); this.schedule(); this.publish(); return true;
  }
  setInput(id,value) {
    const spec=INPUTS.find(s=>s.id===id);
    if (!spec || !Number.isFinite(Number(value))) return false;
    if (!this.startManualInput()) return false;
    if (this.paused) this.resume();
    this.inputs[id]=clamp(Number(value),spec.min,spec.max);
    this.publish(); return true;
  }
  setOptions(values={}) {
    for (const key of ['strength','smoothing','speed']) {
      if (!Number.isFinite(values[key])) continue;
      const ranges={strength:[.2,1.5],smoothing:[0,1],speed:[.25,2]};
      this.options[key]=clamp(values[key],...ranges[key]);
    }
    for (const key of ['faceVisible','bodyVisible']) if (typeof values[key]==='boolean') this.options[key]=values[key];
    this.publish();
  }
  apply(dt, immediate=false) {
    const viewer=this.getViewer(); if (!viewer || this.mode==='idle') return;
    if (this.mode==='simulation') this.inputs=simulateInput(this.time,this.profile);
    const target=mapInput(this.inputs,{...this.options,offsets:this.offsets,descriptors:viewer.getParameters()});
    const breath=viewer.getParameters().find(p=>p.id==='ParamBreath');
    if (breath) target.ParamBreath=this.options.bodyVisible ? breath.min+(breath.max-breath.min)*(.2+.16*Math.sin(this.time*2*Math.PI/6)) : breath.default;
    for (const [id,value] of Object.entries(target)) {
      const eye=/Eye.*Open/.test(id);
      const tau=eye ? 12+this.options.smoothing*28 : 12+this.options.smoothing*280;
      const alpha=immediate || this.options.smoothing===0 ? 1 : 1-Math.exp(-dt*1000/tau);
      this.parameters[id]=(this.parameters[id] ?? value)+(value-(this.parameters[id] ?? value))*alpha;
    }
    viewer.setCaptureParameters(this.parameters); this.frame++;
  }
  schedule() {
    cancelAnimationFrame(this.raf); this.lastTime=performance.now();
    const generation=this.generation;
    const tick=(now)=>{
      if (generation!==this.generation || this.mode==='idle' || this.paused) return;
      const dt=Math.min((now-this.lastTime)/1000,.1); this.lastTime=now;
      this.time=(this.time+dt*this.options.speed)%DURATION;
      this.apply(dt);
      if (now-this.lastPublish>100) {this.lastPublish=now;this.publish();}
      this.raf=requestAnimationFrame(tick);
    };
    this.raf=requestAnimationFrame(tick);
  }
  freeze() {
    const viewer=this.getViewer(); if (!viewer) return;
    const frozen=viewer.getState().parameters;
    viewer.clearCaptureParameters(); viewer.clearParameters();
    for (const [id,value] of Object.entries(frozen)) viewer.setParameter(id,value);
    viewer.renderNow();
  }
  pause() {
    if (this.mode==='idle' || this.paused) return;
    this.paused=true; this.generation++; cancelAnimationFrame(this.raf);
    this.freeze(); this.message='已暂停 · 模型与物理保持当前帧'; this.publish();
  }
  resume() {
    if (this.mode==='idle' || !this.paused) return;
    this.paused=false; this.getViewer()?.clearParameters();
    this.message=this.mode==='input'?'手动输入 · 信号正在驱动模型':'模拟输入运行中';
    this.apply(0,true); this.schedule(); this.publish();
  }
  seek(time) {
    if (this.mode!=='simulation' || !Number.isFinite(Number(time))) return;
    this.pause(); this.time=clamp(Number(time),0,DURATION);
    this.getViewer()?.clearParameters(); this.apply(0,true);
    this.getViewer()?.renderNow(); this.freeze(); this.publish();
  }
  calibrate() {
    if (this.mode==='idle' || !this.options.faceVisible) return false;
    for (const spec of INPUTS) if (/Angle/.test(spec.id) && (!spec.body || this.options.bodyVisible)) this.offsets[spec.id]=this.inputs[spec.id];
    this.message='已将当前头部与躯干角度设为正位';
    if (this.paused) {this.getViewer()?.clearParameters();this.apply(0,true);this.getViewer()?.renderNow();this.freeze();}
    this.publish(); return true;
  }
  stop({reset=true,announce=true}={}) {
    const active=this.mode!=='idle';
    this.generation++; cancelAnimationFrame(this.raf); this.mode='idle'; this.paused=false;
    const viewer=this.getViewer();
    viewer?.clearCaptureParameters();
    if (reset && active && viewer) {
      viewer.setAutoPlay(false); viewer.setPointerFollow(false); viewer.clearParameters(); viewer.setExpression('');
      for (const p of viewer.getParameters()) viewer.setParameter(p.id,p.default);
      viewer.renderNow();
    }
    this.parameters={}; this.message='模拟已停止 · 模型恢复默认参数';
    if (announce) this.publish();
  }
}
