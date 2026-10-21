import {DYNAMICS} from './dynamics-config.js';

/** Local mouth-energy follow. This does not acquire audio or video. */
export class SpeechBob {
  constructor(options={}) {
    Object.assign(this,DYNAMICS.speechBob,options);this.reset();
  }
  reset(){this.energy=0;this.follow=0;this.output={angleY:0,float:0};}
  step(open,seconds,{enabled=true,active=true}={}) {
    if(!enabled){this.reset();return this.output;}
    if(!active||!Number.isFinite(seconds)||seconds<=0)return this.output;
    const dt=seconds,target=Math.max(0,Math.min(1,Number.isFinite(open)?open:0));
    const tau=target>this.energy?this.attackSeconds:this.releaseSeconds;
    // Exact integration keeps the two follow filters consistent across frame rates.
    const energy0=this.energy,follow0=this.follow,followTau=this.followSeconds;
    const a=Math.exp(-dt/tau),b=Math.exp(-dt/followTau);
    this.energy=target+(energy0-target)*a;
    this.follow=target+(follow0-target)*b+(Math.abs(tau-followTau)<1e-9
      ? (energy0-target)*(dt/followTau)*b
      : (energy0-target)*tau/(tau-followTau)*(a-b));
    this.output={angleY:-this.follow*this.maxAngleYDegrees,float:this.follow*this.maxFloatParameter};
    return this.output;
  }
}
