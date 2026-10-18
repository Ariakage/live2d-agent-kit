/** Local, ephemeral MediaPipe diagnostic overlay. No media acquisition or storage.
 * Coordinates follow normalized source-image x/y, then object-fit:contain and one
 * horizontal mirror, matching the sibling video. Gaze is a 2D iris estimate only.
 * Primary references:
 * https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js
 * https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js
 * https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/python/solutions/face_mesh_connections.py
 */
export const MAX_LANDMARK_AGE_MS = 350;
const finite = n => Number.isFinite(n);
const clamp = (n,lo,hi) => Math.max(lo,Math.min(hi,n));
const pointOK = p => p && finite(p.x) && finite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
const poseOK = p => pointOK(p) && finite(p.visibility) && p.visibility >= .6 &&
  (p.presence === undefined || finite(p.presence) && p.presence >= .6);
const fresh = (t,now) => finite(t) && finite(now) && now >= t && now-t <= MAX_LANDMARK_AGE_MS;

export function containRect(sourceWidth,sourceHeight,width,height) {
  if (![sourceWidth,sourceHeight,width,height].every(n => finite(n) && n > 0)) return null;
  const scale = Math.min(width/sourceWidth,height/sourceHeight);
  return {x:(width-sourceWidth*scale)/2,y:(height-sourceHeight*scale)/2,
    width:sourceWidth*scale,height:sourceHeight*scale,scale};
}

export function projectLandmark(point,rect,mirrored=true) {
  if (!pointOK(point) || !rect) return null;
  return {x:rect.x+(mirrored?1-point.x:point.x)*rect.width,y:rect.y+point.y*rect.height};
}

// Small facial contours keep the nodes readable without drawing a dense triangle
// tessellation over the user's eyes. The full returned point set is still shown.
const FACE_PATHS = [
  [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10],
  [33,160,158,133,153,144,33], [263,387,385,362,380,373,263],
  [70,63,105,66,107], [336,296,334,293,300],
  [61,40,37,0,267,270,291,321,314,17,84,91,61],
  [469,470,471,472,469], [474,475,476,477,474],
];
const BODY_EDGES = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24]];
const BODY_IDS = [...new Set(BODY_EDGES.flat())];

/** Iris-ring displacement relative to the eyelids; no screen calibration, eyeball
 * model, depth ray, or assertion of where the person is looking on the screen.
 * Missing iris points, closed eyes and degenerate eye geometry produce no arrow.
 */
export function estimateIrisGaze(points,{width,height,eyeOpen={}}={}) {
  if (!Array.isArray(points) || ![width,height].every(n => finite(n)&&n>0)) return [];
  const px = p => [p.x*width,p.y*height];
  const eyes = [
    {eye:'right',ring:[469,470,471,472],corners:[33,133],top:159,bottom:145},
    {eye:'left',ring:[474,475,476,477],corners:[362,263],top:386,bottom:374},
  ];
  return eyes.flatMap(e => {
    if (!finite(eyeOpen[e.eye]) || eyeOpen[e.eye] < .25 ||
        [...e.ring,...e.corners,e.top,e.bottom].some(i => !pointOK(points[i]))) return [];
    let [a,b] = e.corners.map(i => px(points[i]));
    if (a[0]>b[0]) [a,b]=[b,a];
    const w=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(w<2) return [];
    const u=[(b[0]-a[0])/w,(b[1]-a[1])/w],v=[-u[1],u[0]];
    const top=px(points[e.top]),bottom=px(points[e.bottom]);
    const h=Math.abs((bottom[0]-top[0])*v[0]+(bottom[1]-top[1])*v[1]);
    if(h/w<.06 || h/w>.9) return [];
    const center=[(a[0]+b[0]+top[0]+bottom[0])/4,(a[1]+b[1]+top[1]+bottom[1])/4];
    const origin=e.ring.reduce((p,i)=>({x:p.x+points[i].x/4,y:p.y+points[i].y/4}),{x:0,y:0});
    const iris=px(origin),delta=[iris[0]-center[0],iris[1]-center[1]];
    const dx=clamp((delta[0]*u[0]+delta[1]*u[1])/(w*.35),-1,1);
    const dy=clamp((delta[0]*v[0]+delta[1]*v[1])/(h*.75),-1,1);
    const vector={x:u[0]*dx+v[0]*dy,y:u[1]*dx+v[1]*dy};
    const magnitude=Math.hypot(vector.x,vector.y);
    if(magnitude>1){vector.x/=magnitude;vector.y/=magnitude;}
    return [{eye:e.eye,origin,vector,source:'iris-relative-to-eyelids',estimated:true}];
  });
}

/** Keeps only the current numeric landmarks in memory, with independent face/pose
 * deadlines. A one-shot timer clears old points even if inference stops emitting.
 * Platform overrides are for isolated tests, never a fallback camera pipeline.
 */
export class LandmarkOverlay {
  constructor({canvas,viewport,status}={},platform={}) {
    this.canvas=canvas;this.viewport=viewport;this.status=status;this.context=canvas?.getContext('2d');
    this.platform={now:()=>performance.now(),setTimer:(fn,ms)=>setTimeout(fn,ms),clearTimer:id=>clearTimeout(id),
      visible:()=>!globalThis.document?.hidden,dpr:()=>globalThis.devicePixelRatio||1,
      observeResize:fn=>{if(!globalThis.ResizeObserver)return()=>{};const observer=new ResizeObserver(fn);observer.observe(viewport);return()=>observer.disconnect();},...platform};
    this.options={showVideo:false,showNodes:false,showGaze:false};this.active=false;this.frame=null;this.timer=null;
    this.state={faceNodes:0,poseNodes:0,gazeVectors:0,faceVisible:false,bodyVisible:false,mirrored:true,lastClearReason:'initial',contentRect:null};
    this.unobserve=this.platform.observeResize(()=>this.render());
    this.render();
  }
  getState(){return {...this.state,...this.options,active:this.active,hasLandmarks:Boolean(this.frame),
    contentRect:this.state.contentRect?{...this.state.contentRect}:null};}
  setOptions(options={}){
    for(const key of ['showVideo','showNodes','showGaze'])if(key in options)this.options[key]=Boolean(options[key]);
    if(!this.options.showNodes&&!this.options.showGaze)this.clear('overlay-off');else this.render();
  }
  setActive(active){this.active=Boolean(active);if(!this.active)this.clear('stopped');else this.render();}
  update(payload){
    if(!payload){this.clear('source-cleared');return;}
    if(!this.active||!this.platform.visible()||(!this.options.showNodes&&!this.options.showGaze)){
      this.clear(!this.platform.visible()?'background':'inactive');return;
    }
    const now=this.platform.now();
    const copy=(points,valid)=>valid&&Array.isArray(points)?points.map(p=>pointOK(p)?{x:p.x,y:p.y,z:p.z,visibility:p.visibility,presence:p.presence}:null):null;
    const faceVisible=payload.faceVisible&&fresh(payload.faceTimestamp,now);
    const bodyVisible=payload.bodyVisible&&fresh(payload.poseTimestamp,now);
    this.frame={width:payload.width,height:payload.height,faceTimestamp:payload.faceTimestamp,poseTimestamp:payload.poseTimestamp,
      faceLandmarks:copy(payload.faceLandmarks,faceVisible),poseLandmarks:copy(payload.poseLandmarks,bodyVisible),eyeOpen:{...payload.eyeOpen}};
    this.render();
  }
  clear(reason='cleared'){
    if(this.timer!==null)this.platform.clearTimer(this.timer);this.timer=null;this.frame=null;
    this.state={...this.state,faceNodes:0,poseNodes:0,gazeVectors:0,faceVisible:false,bodyVisible:false,lastClearReason:reason};
    this.context?.clearRect(0,0,this.canvas.width,this.canvas.height);
    this.updateStatus();
  }
  updateStatus(){
    if(!this.status)return;
    const s=this.state;
    this.status.textContent=!this.active?'摄像头未开启':s.faceNodes||s.poseNodes||s.gazeVectors
      ? `面部 ${s.faceNodes} 点 · 上半身 ${s.poseNodes} 点${this.options.showGaze?` · 视线估计 ${s.gazeVectors} 眼`:''}`
      : this.options.showNodes||this.options.showGaze?'等待可见的新鲜关键点':'关键点与视线估计已隐藏';
  }
  render(){
    if(this.timer!==null)this.platform.clearTimer(this.timer);this.timer=null;
    if(!this.active||!this.platform.visible()){this.clear(!this.platform.visible()?'background':'inactive');return;}
    const c=this.context;if(!c)return;
    const box=this.viewport.getBoundingClientRect(),width=box.width,height=box.height;
    const dpr=clamp(this.platform.dpr(),1,2);
    const targetWidth=Math.max(1,Math.round(width*dpr)),targetHeight=Math.max(1,Math.round(height*dpr));
    if(this.canvas.width!==targetWidth||this.canvas.height!==targetHeight){this.canvas.width=targetWidth;this.canvas.height=targetHeight;}
    c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);
    const f=this.frame,now=this.platform.now();
    const face=f&&fresh(f.faceTimestamp,now)?f.faceLandmarks:null,pose=f&&fresh(f.poseTimestamp,now)?f.poseLandmarks:null;
    if(f&&!face&&!pose){this.clear('stale-or-lost');return;}
    const rect=f?containRect(f.width,f.height,width,height):null;
    this.state={...this.state,faceNodes:0,poseNodes:0,gazeVectors:0,faceVisible:Boolean(face),bodyVisible:Boolean(pose),contentRect:rect};
    if(rect){
      c.save();c.beginPath();c.rect(rect.x,rect.y,rect.width,rect.height);c.clip();
      const project=p=>projectLandmark(p,rect,true);
      const line=(points,ids,color)=>{c.strokeStyle=color;c.lineWidth=1;c.beginPath();let started=false;
        for(const id of ids){const p=project(points?.[id]);if(!p){started=false;continue;}if(!started)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);started=true;}c.stroke();};
      const dot=(p,r,color)=>{const q=project(p);if(!q)return false;c.fillStyle=color;c.beginPath();c.arc(q.x,q.y,r,0,Math.PI*2);c.fill();return true;};
      if(this.options.showNodes&&face){for(const path of FACE_PATHS)line(face,path,'#72f0e9b3');for(const p of face)if(dot(p,.7,'#86fff1b3'))this.state.faceNodes++;}
      if(this.options.showNodes&&pose){const visible=pose.map(p=>poseOK(p)?p:null);for(const edge of BODY_EDGES)line(visible,edge,'#ffc886');for(const id of BODY_IDS)if(dot(visible[id],2.5,'#ffd29c'))this.state.poseNodes++;}
      if(this.options.showGaze&&face){
        for(const gaze of estimateIrisGaze(face,{width:f.width,height:f.height,eyeOpen:f.eyeOpen})){
          const a=project(gaze.origin),length=Math.min(30,Math.max(14,rect.width*.085));
          const b={x:a.x-gaze.vector.x*length,y:a.y+gaze.vector.y*length};
          c.strokeStyle='#ff80db';c.fillStyle='#ff80db';c.lineWidth=2;
          c.beginPath();c.arc(a.x,a.y,2,0,Math.PI*2);c.stroke();
          if(Math.hypot(b.x-a.x,b.y-a.y)>2){const angle=Math.atan2(b.y-a.y,b.x-a.x);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.beginPath();c.moveTo(b.x,b.y);c.lineTo(b.x-5*Math.cos(angle-.5),b.y-5*Math.sin(angle-.5));c.lineTo(b.x-5*Math.cos(angle+.5),b.y-5*Math.sin(angle+.5));c.closePath();c.fill();}
          this.state.gazeVectors++;
        }
      }
      c.restore();
    }
    this.state.lastClearReason=face||pose?'':'waiting';this.updateStatus();
    const deadlines=[];if(face)deadlines.push(f.faceTimestamp+MAX_LANDMARK_AGE_MS+1);if(pose)deadlines.push(f.poseTimestamp+MAX_LANDMARK_AGE_MS+1);
    if(deadlines.length)this.timer=this.platform.setTimer(()=>{this.timer=null;this.render();},Math.max(1,Math.min(...deadlines)-now));
  }
  destroy(){this.active=false;this.clear('destroyed');this.unobserve?.();}
}
