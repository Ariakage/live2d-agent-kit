const IDS=['ParamArmRLift','ParamArmRPose','ParamHandRForm','ParamHandRWave'];
const ease=t=>t*t*(3-2*t);

/** Return the sleeve before changing hand drawings during an interrupted motion. */
export class GestureHandoff {
  constructor(){this.active=false;}
  start(parameters) {
    this.cancel();
    if(!IDS.every(id=>Number.isFinite(parameters[id])))return Promise.resolve(true);
    this.from=Object.fromEntries(IDS.map(id=>[id,parameters[id]]));
    this.values={...this.from};this.elapsed=0;
    this.lowerSeconds=parameters.ParamArmRLift>0?.8:0;
    this.resetSeconds=IDS.slice(1).some(id=>parameters[id]!==0)?.4:0;
    if(!this.lowerSeconds&&!this.resetSeconds)return Promise.resolve(true);
    this.active=true;
    return new Promise(resolve=>{this.resolve=resolve;});
  }
  step(seconds) {
    if(!this.active)return null;
    if(Number.isFinite(seconds)&&seconds>0)this.elapsed+=Math.min(seconds,.05);
    if(this.elapsed<this.lowerSeconds) {
      const weight=1-ease(this.elapsed/this.lowerSeconds);
      this.values={...this.from,ParamArmRLift:this.from.ParamArmRLift*weight};
    } else {
      const weight=this.resetSeconds?1-ease(Math.min(1,(this.elapsed-this.lowerSeconds)/this.resetSeconds)):0;
      this.values=Object.fromEntries(IDS.map(id=>[id,id==='ParamArmRLift'?0:this.from[id]*weight]));
    }
    if(this.elapsed>=this.lowerSeconds+this.resetSeconds) {
      this.active=false;this.resolve(true);this.resolve=null;
    }
    return this.values;
  }
  cancel() {
    this.active=false;
    this.resolve?.(false);this.resolve=null;
  }
}
