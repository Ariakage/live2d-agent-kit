import { INPUT_MAPPING } from './view-config.js';
/** Shared camera/synthetic signals using VTS-style names, not a VTS/device connection.
 * Ranges are this simulator's nominal input limits; real VTS mappings are configurable.
 * Left/right are anatomical sides; confirm the actual artwork and rig naming.
 */
export const INPUTS = [
  {id:'FaceAngleX', label:'左右转头', min:-30, max:30, value:0, target:'ParamAngleX'},
  {id:'FaceAngleY', label:'抬头 / 低头', min:-30, max:30, value:0, target:'ParamAngleY'},
  {id:'FaceAngleZ', label:'左右歪头', min:-30, max:30, value:0, target:'ParamAngleZ'},
  {id:'EyeOpenLeft', label:'左眼开合', min:0, max:1, value:1, target:'ParamEyeLOpen'},
  {id:'EyeOpenRight', label:'右眼开合', min:0, max:1, value:1, target:'ParamEyeROpen'},
  {id:'EyeLeftX', label:'左眼视线左右', min:-1, max:1, value:0, target:'ParamEyeBallX', average:true},
  {id:'EyeLeftY', label:'左眼视线上下', min:-1, max:1, value:0, target:'ParamEyeBallY', average:true},
  {id:'EyeRightX', label:'右眼视线左右', min:-1, max:1, value:0, target:'ParamEyeBallX', average:true},
  {id:'EyeRightY', label:'右眼视线上下', min:-1, max:1, value:0, target:'ParamEyeBallY', average:true},
  {id:'MouthOpen', label:'说话开口', min:0, max:1, value:0, target:'ParamMouthOpenY'},
  {id:'MouthSmile', label:'微笑', min:0, max:1, value:0, target:'ParamMouthForm'},
  {id:'BrowLeftY', label:'左眉抬起 / 压低', min:-1, max:1, value:0, target:'ParamBrowLY'},
  {id:'BrowRightY', label:'右眉抬起 / 压低', min:-1, max:1, value:0, target:'ParamBrowRY'},
  {id:'MocopiBodyAngleX', label:'躯干左右', min:-10, max:10, value:0, target:'ParamBodyAngleX', body:true},
  {id:'MocopiBodyAngleY', label:'躯干俯仰', min:-10, max:10, value:0, target:'ParamBodyAngleY', body:true},
  {id:'MocopiBodyAngleZ', label:'肩部侧倾', min:-10, max:10, value:0, target:'ParamBodyAngleZ', body:true},
];
export const DURATION = 24;
export const NEUTRAL_INPUT = Object.fromEntries(INPUTS.map(s => [s.id, s.value]));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : 0));
const oscillate = (t, period, phase=0) => Math.sin(t * Math.PI * 2 / period + phase);
function blink(t, start, duration=.34) {
  const p = (t-start)/duration;
  return p <= 0 || p >= 1 ? 1 : 1-Math.pow(Math.sin(p*Math.PI), .65);
}

export function simulateInput(time, profile='all') {
  const safeTime = Number.isFinite(time) ? time : 0;
  const t = ((safeTime % DURATION) + DURATION) % DURATION;
  const v = {...NEUTRAL_INPUT};
  if (!['all','face','body','talk','blink'].includes(profile)) return v;
  if (['all','face','body','talk'].includes(profile)) {
    const amplitude = profile === 'talk' ? 5 : 20;
    v.FaceAngleX = amplitude * oscillate(t, 8);
    v.FaceAngleY = 7 * oscillate(t, 6);
    v.FaceAngleZ = 6 * oscillate(t, 12);
    v.EyeLeftX = v.EyeRightX = .5 * oscillate(t, 6);
    v.EyeLeftY = v.EyeRightY = .25 * oscillate(t, 8);
    v.BrowLeftY = .5 * oscillate(t, 8);
    v.BrowRightY = .5 * oscillate(t, 8, .3);
  }
  if (profile === 'blink') {
    // Hold the endpoints long enough to inspect the actual closed-eye mesh.
    const phase = t % 8;
    const close = (x) => x < 1 ? 1-x : x < 2 ? 0 : x < 3 ? x-2 : 1;
    v.EyeOpenLeft = clamp(close(phase), 0, 1);
    v.EyeOpenRight = clamp(close((phase+4)%8), 0, 1);
  } else {
    v.EyeOpenLeft = v.EyeOpenRight = blink(t % 4, 2.7);
  }
  if (['all','talk','body'].includes(profile)) {
    const speaking = t % 6 < 4.4;
    v.MouthOpen = speaking ? .78 * Math.pow(Math.max(0, oscillate(t, .6)), 1.2) : 0;
    v.MouthSmile = .25 + .25 * oscillate(t, 8);
  }
  if (['all','body'].includes(profile)) {
    v.MocopiBodyAngleX = 5 * oscillate(t, 8, -.35);
    v.MocopiBodyAngleY = 2.5 * oscillate(t, 8);
    v.MocopiBodyAngleZ = 5 * oscillate(t, 12, -.3);
  }
  return v;
}

/** Only emit targets actually present in the loaded Core model. Optional mapping
 * overrides target IDs and input/output endpoints; defaults use native bounds. */
export function mapInput(input={}, {strength=1, offsets={}, faceVisible=true, bodyVisible=true, descriptors=[]}={}) {
  const available = new Map(descriptors.map(p => [p.id,p]));
  const grouped = new Map();
  for (const spec of INPUTS) {
    const override = INPUT_MAPPING[spec.id];
    if (override === false) continue;
    const mapping = {target:spec.target, ...(override || {})};
    const target = available.get(mapping.target);
    if (!target) continue;
    const tracked = (spec.body ? bodyVisible : faceVisible) && Number.isFinite(input[spec.id]);
    let value = tracked ? clamp(input[spec.id],spec.min,spec.max) : spec.value;
    if (/Angle/.test(spec.id) && tracked) value=(value-(offsets[spec.id] || 0))*strength;
    const inMin = mapping.inputMin ?? spec.min, inMax = mapping.inputMax ?? spec.max;
    const outMin = mapping.outputMin ?? (spec.id === 'MouthSmile' ? target.default : target.min);
    const outMax = mapping.outputMax ?? target.max;
    let mapped;
    if (!tracked) mapped=target.default;
    else if (inMax === inMin) mapped=target.default;
    else if (spec.value === 0 && inMin < 0 && inMax > 0 && mapping.outputMin === undefined && mapping.outputMax === undefined) {
      mapped=value < 0 ? target.default + (value/inMin)*(target.min-target.default) : target.default+(value/inMax)*(target.max-target.default);
    } else mapped=outMin+(value-inMin)/(inMax-inMin)*(outMax-outMin);
    mapped=clamp(mapped,target.min,target.max);
    if (!grouped.has(mapping.target)) grouped.set(mapping.target,[]);
    grouped.get(mapping.target).push(mapped);
  }
  return Object.fromEntries(Array.from(grouped, ([id,values]) => [id,values.reduce((a,b)=>a+b,0)/values.length]));
}
