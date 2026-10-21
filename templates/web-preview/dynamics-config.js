// Gentle auxiliary animation; these signals are not camera measurements.
export const DYNAMICS = {
  duration: 12,
  breathKnots: [[0,0],[2.1,.24],[4.8,.025],[7.1,.22],[9.8,.02],[12,0]],
  captureBreathScale: .65,
  breathingDefaultEnabled: false,
  captureWindKnots: [[0,0],[2,0],[4.5,.08],[6,.08],[8,0],[10,-.035],[12,0]],
  captureFloatPeak: .24,
  floatProfiles: {low:.6, normal:.8, high:1},
  defaultFloatProfile: 'normal',
  idleVariants: {rotationSeconds:48, order:['Quiet','Curious','Sleepy'], default:'Quiet'},
  speechBob: {enabledByDefault:false, maxAngleYDegrees:.35, maxFloatParameter:.06,
    attackSeconds:.16, releaseSeconds:.38, followSeconds:.16},
};
function sampleLoop(time, knots) {
  const duration=DYNAMICS.duration,t=((Number.isFinite(time)?time:0)%duration+duration)%duration;
  for(let i=1;i<knots.length;i++)if(t<=knots[i][0]) {
    const q=(t-knots[i-1][0])/(knots[i][0]-knots[i-1][0]),w=q*q*(3-2*q);
    return knots[i-1][1]+(knots[i][1]-knots[i-1][1])*w;
  }
  return knots[0][1];
}
export function floatProfileScale(profile=DYNAMICS.defaultFloatProfile) {
  return DYNAMICS.floatProfiles[Object.hasOwn(DYNAMICS.floatProfiles,profile)?profile:DYNAMICS.defaultFloatProfile];
}
export function captureBreath(time) {return sampleLoop(time,DYNAMICS.breathKnots)*DYNAMICS.captureBreathScale;}
export function captureWind(time) {return sampleLoop(time,DYNAMICS.captureWindKnots);}
export function captureFloat(time,profile=DYNAMICS.defaultFloatProfile) {
  return Math.sin((Number.isFinite(time)?time:0)*Math.PI/4)*DYNAMICS.captureFloatPeak*floatProfileScale(profile);
}
