/** Pure MediaPipe-to-preview mapping. No camera, network, images or persistent storage. */
export const TRACKING_INPUTS = Object.freeze({
  FaceAngleX: [-30, 30, 0], FaceAngleY: [-30, 30, 0], FaceAngleZ: [-30, 30, 0],
  EyeOpenLeft: [0, 1, 1], EyeOpenRight: [0, 1, 1],
  EyeLeftX: [-1, 1, 0], EyeLeftY: [-1, 1, 0],
  EyeRightX: [-1, 1, 0], EyeRightY: [-1, 1, 0],
  MouthOpen: [0, 1, 0], MouthSmile: [0, 1, 0],
  BrowLeftY: [-1, 1, 0], BrowRightY: [-1, 1, 0],
  MocopiBodyAngleX: [-10, 10, 0], MocopiBodyAngleY: [-10, 10, 0], MocopiBodyAngleZ: [-10, 10, 0],
});

export const neutralTrackingInputs = () => Object.fromEntries(
  Object.entries(TRACKING_INPUTS).map(([key, limits]) => [key, limits[2]]),
);
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));
const degrees = radians => radians * 180 / Math.PI;
const angleDelta = (value, origin) => ((value - origin + 540) % 360) - 180;
const finitePoint = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const inImage = p => finitePoint(p) && p.x >= -.05 && p.x <= 1.05 && p.y >= -.05 && p.y <= 1.05;
const norm = v => Math.hypot(...v);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

/** MatrixData uses column-major packed values. Remove scale before Euler extraction.
 * R = Rz(roll) Ry(yaw) Rx(pitch). Input axes refer to the unmirrored video:
 * X turns toward image-right, Y looks up, Z tilts clockwise in the image.
 * A CSS mirror on the camera thumbnail must not transpose this matrix or swap eyes.
 */
export function matrixToHeadAngles(matrix) {
  if (matrix?.rows !== 4 || matrix?.columns !== 4 || matrix.data?.length !== 16) return null;
  const d = Array.from(matrix.data);
  if (!d.every(Number.isFinite) || Math.abs(d[15] - 1) > .05 ||
      [3, 7, 11].some(i => Math.abs(d[i]) > .05)) return null;
  const columns = [[d[0], d[1], d[2]], [d[4], d[5], d[6]], [d[8], d[9], d[10]]];
  if (columns.some(c => norm(c) < .01 || norm(c) > 100)) return null;
  const [x, y, z] = columns.map(c => c.map(v => v / norm(c)));
  if (Math.max(Math.abs(dot(x, y)), Math.abs(dot(x, z)), Math.abs(dot(y, z))) > .12 ||
      dot(cross(x, y), z) < .85) return null;
  const yaw = Math.asin(clamp(-x[2], -1, 1));
  // A frontal webcam cannot reliably determine this rig near the Euler singularity.
  if (Math.abs(Math.cos(yaw)) < .1) return null;
  return {
    FaceAngleX: degrees(yaw),
    FaceAngleY: -degrees(Math.atan2(y[2], z[2])),
    FaceAngleZ: -degrees(Math.atan2(x[1], x[0])),
  };
}

const REQUIRED_BLENDSHAPES = [
  'eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen', 'mouthSmileLeft', 'mouthSmileRight',
  'eyeLookInLeft', 'eyeLookOutLeft', 'eyeLookUpLeft', 'eyeLookDownLeft',
  'eyeLookInRight', 'eyeLookOutRight', 'eyeLookUpRight', 'eyeLookDownRight',
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
];

export function faceResultToInputs(result) {
  const missing = reason => ({visible: false, inputs: {}, reason});
  const points = result?.faceLandmarks?.[0];
  if (!Array.isArray(points) || points.length < 468) return missing('face-not-detected');
  // Face confidence is thresholded inside MediaPipe; blendshape scores are expressions,
  // not face-confidence probabilities. Validate the returned geometry separately.
  const anchors = [1, 10, 33, 152, 234, 263, 454].map(i => points[i]);
  if (anchors.some(p => !inImage(p))) return missing('face-outside-frame');
  const width = Math.abs(points[454].x - points[234].x);
  const height = Math.abs(points[152].y - points[10].y);
  if (width < .035 || height < .05) return missing('face-too-small');
  const angles = matrixToHeadAngles(result?.facialTransformationMatrixes?.[0]);
  if (!angles || Math.abs(angles.FaceAngleX) > 80 || Math.abs(angles.FaceAngleY) > 70 ||
      Math.abs(angles.FaceAngleZ) > 75) return missing('face-transform-unreliable');
  const scores = Object.fromEntries((result?.faceBlendshapes?.[0]?.categories || [])
    .map(c => [c.categoryName, c.score]));
  if (REQUIRED_BLENDSHAPES.some(k => !Number.isFinite(scores[k]))) return missing('face-blendshapes-unavailable');
  const s = key => clamp(scores[key], 0, 1);
  return {visible: true, reason: '', inputs: {
    ...angles,
    EyeOpenLeft: 1 - s('eyeBlinkLeft'), EyeOpenRight: 1 - s('eyeBlinkRight'),
    EyeLeftX: s('eyeLookOutLeft') - s('eyeLookInLeft'),
    EyeRightX: s('eyeLookInRight') - s('eyeLookOutRight'),
    EyeLeftY: s('eyeLookUpLeft') - s('eyeLookDownLeft'),
    EyeRightY: s('eyeLookUpRight') - s('eyeLookDownRight'),
    MouthOpen: s('jawOpen'), MouthSmile: (s('mouthSmileLeft') + s('mouthSmileRight')) / 2,
    BrowLeftY: .55*s('browInnerUp') + .45*s('browOuterUpLeft') - s('browDownLeft'),
    BrowRightY: .55*s('browInnerUp') + .45*s('browOuterUpRight') - s('browDownRight'),
  }};
}

/** Shoulders supply approximate yaw/roll. Pitch also needs visible hips.
 * The Mocopi names are compatibility fields only; no Mocopi device is connected.
 */
export function poseResultToInputs(result, {minConfidence = .6, aspectRatio = 4/3} = {}) {
  const missing = reason => ({visible: false, inputs: {}, confidence: 0, pitchAvailable: false, reason});
  const points = result?.landmarks?.[0], world = result?.worldLandmarks?.[0];
  if (!Array.isArray(points) || points.length < 25) return missing('body-not-detected');
  const confidence = p => !Number.isFinite(p?.visibility) || (p.presence !== undefined && !Number.isFinite(p.presence))
    ? 0 : Math.min(p.visibility, p.presence === undefined ? 1 : p.presence);
  const reliable = i => inImage(points[i]) && confidence(points[i]) >= minConfidence;
  if (![11, 12].every(reliable)) return missing('shoulders-occluded');
  const aspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 4/3;
  const left = points[11], right = points[12];
  const dx = (left.x-right.x)*aspect, dy = left.y-right.y;
  if (dx < .045 || Math.hypot(dx, dy) < .06) return missing('shoulders-unreliable');
  const useWorld = Array.isArray(world) && [11, 12].every(i => finitePoint(world[i]));
  if (world != null && !useWorld) return missing('body-depth-unreliable');
  const source = useWorld ? world : points;
  const sx = source[11].x-source[12].x;
  if (sx <= .015) return missing('body-depth-unreliable');
  const yaw = degrees(Math.atan2(source[12].z-source[11].z, sx));
  const roll = degrees(Math.atan2(dy, dx));
  const pitchAvailable = [23, 24].every(reliable) && [23, 24].every(i => finitePoint(source[i]));
  let pitch = 0;
  if (pitchAvailable) {
    const shoulderY = (source[11].y+source[12].y)/2, hipY = (source[23].y+source[24].y)/2;
    const shoulderZ = (source[11].z+source[12].z)/2, hipZ = (source[23].z+source[24].z)/2;
    const vertical = (hipY-shoulderY) / (useWorld ? 1 : aspect);
    if (vertical > .04) pitch = degrees(Math.atan2(shoulderZ-hipZ, vertical));
    else return missing('torso-unreliable');
  }
  return {visible: true, reason: pitchAvailable ? '' : 'shoulders-only',
    confidence: Math.min(confidence(left), confidence(right)), pitchAvailable,
    inputs: {MocopiBodyAngleX: yaw, MocopiBodyAngleY: pitch, MocopiBodyAngleZ: roll}};
}

/** State contains only derived numbers, never image frames or landmark arrays. */
export class TrackingMapper {
  constructor({maxAgeMs = 350, minConfidence = .6} = {}) {
    this.maxAgeMs = maxAgeMs;
    this.minConfidence = minConfidence;
    this.reset();
  }
  reset() {
    this.baseline = {};
    this.last = null;
    this.faceCalibrated = false;
    this.bodyCalibrated = false;
  }
  update({faceResult, poseResult, faceTimestamp, poseTimestamp, timestamp, bodyEnabled = true, aspectRatio} = {}) {
    const age = t => Number.isFinite(timestamp) && Number.isFinite(t) ? timestamp-t : -1;
    const fresh = t => age(t) >= 0 && age(t) <= this.maxAgeMs;
    const face = fresh(faceTimestamp) ? faceResultToInputs(faceResult) : {visible: false, inputs: {}, reason: 'face-stale'};
    const body = bodyEnabled && fresh(poseTimestamp)
      ? poseResultToInputs(poseResult, {minConfidence: this.minConfidence, aspectRatio})
      : {visible: false, inputs: {}, reason: bodyEnabled ? 'body-stale' : 'body-disabled', confidence: 0, pitchAvailable: false};
    const raw = {...face.inputs, ...body.inputs};
    const inputs = neutralTrackingInputs();
    for (const [key, limits] of Object.entries(TRACKING_INPUTS)) {
      const visible = key.startsWith('Mocopi') ? body.visible : face.visible;
      if (!visible || !Number.isFinite(raw[key])) continue;
      let value = raw[key], baseline = this.baseline[key] ?? limits[2];
      if (key === 'MocopiBodyAngleY' && !body.pitchAvailable) value = 0;
      else if (key.includes('Angle')) value = angleDelta(value, baseline);
      else if (key.startsWith('EyeOpen')) value /= Math.max(.4, baseline);
      else if (key === 'MouthOpen' || key === 'MouthSmile') value = (value-baseline)/Math.max(.2, 1-baseline);
      else value -= baseline;
      inputs[key] = clamp(value, limits[0], limits[1]);
    }
    this.last = {timestamp, faceTimestamp, poseTimestamp, raw, faceVisible: face.visible,
      bodyVisible: body.visible, bodyPitchAvailable: body.pitchAvailable};
    return {inputs, faceVisible: face.visible, bodyVisible: body.visible,
      timestamp: Number.isFinite(timestamp) ? timestamp : 0,
      faceReason: face.reason, bodyReason: body.reason,
      metrics: {faceAgeMs: age(faceTimestamp), bodyAgeMs: age(poseTimestamp),
        bodyConfidence: body.confidence, bodyPitchAvailable: Number(body.pitchAvailable)}};
  }
  calibrate(timestamp) {
    const last = this.last;
    if (!last?.faceVisible || !Number.isFinite(timestamp) ||
        timestamp-last.faceTimestamp > this.maxAgeMs || timestamp < last.faceTimestamp) {
      return {ok: false, code: 'face-unavailable', message: '请正对镜头，等识别到面部后再校准。'};
    }
    if (last.raw.EyeOpenLeft < .4 || last.raw.EyeOpenRight < .4 || last.raw.MouthOpen > .35) {
      return {ok: false, code: 'neutral-expression-required', message: '校准时请睁眼、放松眉毛并闭嘴。'};
    }
    this.baseline = {...last.raw};
    this.faceCalibrated = true;
    this.bodyCalibrated = last.bodyVisible && timestamp-last.poseTimestamp <= this.maxAgeMs;
    if (!this.bodyCalibrated) for (const key of Object.keys(this.baseline)) {
      if (key.startsWith('Mocopi')) delete this.baseline[key];
    }
    return {ok: true, face: true, body: this.bodyCalibrated,
      bodyPitch: this.bodyCalibrated && last.bodyPitchAvailable,
      message: this.bodyCalibrated ? '面部与可见上半身已校准。' : '面部已校准；上半身未识别。'};
  }
}
