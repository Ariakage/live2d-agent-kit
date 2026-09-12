import {TrackingMapper} from './tracking-math.js';

const abortError = () => Object.assign(new Error('摄像头启动已取消。'), {name: 'AbortError', code: 'cancelled'});
const failure = (code, message) => Object.assign(new Error(message), {code, publicTrackingError: true});

function localAssets(assets, base, bodyEnabled) {
  if (!assets || typeof assets !== 'object') throw failure('assets-missing', '请先安装本地追踪依赖，再用 --tracking-dir 准备预览。');
  const page = new URL(base);
  if (!['http:', 'https:'].includes(page.protocol)) throw failure('page-origin', '请通过 localhost 或 HTTPS 打开摄像头预览。');
  const result = {};
  for (const key of ['visionModule', 'wasmRoot', 'faceModel', ...(bodyEnabled ? ['poseModel'] : [])]) {
    if (typeof assets[key] !== 'string' || !assets[key].trim()) throw failure('assets-missing', '本地追踪依赖路径不完整。');
    const url = new URL(assets[key], page);
    if (url.origin !== page.origin || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) {
      throw failure('assets-origin', '追踪模块和模型必须使用预览页面的同源本地文件。');
    }
    result[key] = url.href.replace(key === 'wasmRoot' ? /\/$/ : /$^/, '');
  }
  return result;
}

function publicError(error, phase) {
  if (error?.publicTrackingError === true) return error;
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return failure('permission-denied', '摄像头权限被拒绝。请检查浏览器和系统的摄像头权限，然后重新开始。');
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') return failure('camera-missing', '未找到可用摄像头。');
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') return failure('camera-busy', '无法读取摄像头，可能正被其他应用占用。');
  if (phase === 'camera') return failure('camera-unavailable', '摄像头无法启动。请检查设备和浏览器权限。');
  return failure('tracking-unavailable', '本地识别器加载或运行失败。请核对追踪文件、浏览器 WASM 支持和内存。');
}

/** Inference is local and starts only through start(). No upload or recording APIs.
 * The optional second argument supplies platform fakes for lifecycle unit tests.
 * Production callers use the browser defaults and do not pass it.
 */
export class CameraTracker {
  constructor({video, onFrame = () => {}, onState = () => {}, assets = null, maxFps = 15, bodyFps = 8} = {}, platform = {}) {
    this.video = video;
    this.assets = assets;
    this.onFrame = onFrame;
    this.onState = onState;
    this.maxFps = Number.isFinite(maxFps) ? Math.min(20, Math.max(1, maxFps)) : 15;
    this.bodyFps = Number.isFinite(bodyFps) ? Math.min(this.maxFps, Math.max(1, bodyFps)) : 8;
    this.platform = {
      now: () => performance.now(),
      requestFrame: cb => requestAnimationFrame(cb),
      cancelFrame: id => cancelAnimationFrame(id),
      baseURL: () => globalThis.location?.href,
      secureContext: () => globalThis.isSecureContext === true,
      getUserMedia: constraints => {
        if (!globalThis.navigator?.mediaDevices?.getUserMedia) throw failure('camera-api-unavailable', '此浏览器未提供摄像头接口；请使用 localhost 或 HTTPS。');
        return navigator.mediaDevices.getUserMedia(constraints);
      },
      loadVision: url => import(url),
      ...platform,
    };
    this.session = null;
    this.generation = 0;
    this.startPromise = null;
    this.state = {status: 'idle', code: '', message: '摄像头未开启', faceVisible: false,
      bodyVisible: false, bodyEnabled: false, calibrated: false, metrics: {frames: 0, faceFrames: 0, bodyFrames: 0}};
  }

  getState() {
    return {...this.state, metrics: {...this.state.metrics}};
  }
  announce(patch) {
    this.state = {...this.state, ...patch};
    this.onState(this.getState());
  }
  current(ctx) {
    return this.session === ctx && ctx.generation === this.generation && ctx.active;
  }
  assertCurrent(ctx) {
    if (!this.current(ctx)) throw abortError();
  }

  start({bodyEnabled = true} = {}) {
    // Construction and duplicate starts are inert. In particular, constructing with
    // assets:null must not change the ordinary preview or request camera permission.
    if (this.state.status === 'starting' && this.startPromise) return this.startPromise;
    if (this.state.status === 'running') return Promise.resolve(this.getState());
    const ctx = {generation: ++this.generation, active: true, bodyEnabled: Boolean(bodyEnabled),
      stream: null, face: null, pose: null, raf: null, mapper: new TrackingMapper(),
      lastVideoTime: -1, faceTimestamp: NaN, poseTimestamp: NaN,
      lastEmit: -Infinity, lastAnnounce: -Infinity, lastFace: null, lastPose: null,
      frames: 0, faceFrames: 0, bodyFrames: 0, lastInference: null, fps: 0};
    this.session = ctx;
    this.announce({status: 'starting', code: '', message: '正在启动本地摄像头识别…',
      faceVisible: false, bodyVisible: false, bodyEnabled: ctx.bodyEnabled, calibrated: false,
      metrics: {frames: 0, faceFrames: 0, bodyFrames: 0}});
    const task = this.initialize(ctx);
    this.startPromise = task;
    task.finally(() => {if (this.startPromise === task) this.startPromise = null;}).catch(() => {});
    return task;
  }

  async initialize(ctx) {
    let phase = 'camera';
    try {
      if (!this.video) throw failure('video-missing', '预览缺少摄像头 video 元素。');
      if (!this.platform.secureContext()) throw failure('insecure-context', '摄像头需要 localhost 或 HTTPS 安全上下文。');
      const assets = localAssets(this.assets, this.platform.baseURL(), ctx.bodyEnabled);
      ctx.stream = await this.platform.getUserMedia({
        video: {width: {ideal: 640}, height: {ideal: 480}, frameRate: {ideal: 30, max: 30}, facingMode: 'user'},
        audio: false,
      });
      this.assertCurrent(ctx);
      ctx.ended = () => this.fail(ctx, failure('camera-ended', '摄像头已断开，识别已停止。'));
      for (const track of ctx.stream.getTracks()) track.addEventListener?.('ended', ctx.ended);
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.srcObject = ctx.stream;
      await this.video.play();
      this.assertCurrent(ctx);
      phase = 'models';
      this.announce({message: '正在加载本地面部识别模型…'});
      const vision = await this.platform.loadVision(assets.visionModule);
      this.assertCurrent(ctx);
      const files = await vision.FilesetResolver.forVisionTasks(assets.wasmRoot);
      this.assertCurrent(ctx);
      ctx.face = await vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: {modelAssetPath: assets.faceModel, delegate: 'CPU'}, runningMode: 'VIDEO', numFaces: 1,
        minFaceDetectionConfidence: .6, minFacePresenceConfidence: .6, minTrackingConfidence: .6,
        outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      });
      this.assertCurrent(ctx);
      if (ctx.bodyEnabled) {
        this.announce({message: '正在加载本地上半身识别模型…'});
        ctx.pose = await vision.PoseLandmarker.createFromOptions(files, {
          baseOptions: {modelAssetPath: assets.poseModel, delegate: 'CPU'}, runningMode: 'VIDEO', numPoses: 1,
          minPoseDetectionConfidence: .6, minPosePresenceConfidence: .6, minTrackingConfidence: .6,
          outputSegmentationMasks: false,
        });
        this.assertCurrent(ctx);
      }
      this.announce({status: 'running', code: '', message: '本地识别已启动，请正视镜头后校准。'});
      if (this.current(ctx)) ctx.raf = this.platform.requestFrame(() => this.tick(ctx));
      return this.getState();
    } catch (error) {
      const cancelled = !this.current(ctx);
      this.release(ctx);
      if (cancelled) throw abortError();
      this.session = null;
      ctx.active = false;
      const safe = publicError(error, phase);
      this.announce({status: 'error', code: safe.code, message: safe.message, faceVisible: false, bodyVisible: false});
      throw safe;
    }
  }

  tick(ctx) {
    ctx.raf = null;
    if (!this.current(ctx)) return;
    try {
      const now = this.platform.now();
      if (now-ctx.lastEmit < 1000/this.maxFps) return;
      let inferenceMs = 0;
      let inferredFace = false, inferredPose = false;
      const video = this.video;
      const live = ctx.stream.getVideoTracks().some(t => t.readyState === 'live' && !t.muted);
      const available = live && !video.paused && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
      if (available && Number.isFinite(video.currentTime) && video.currentTime !== ctx.lastVideoTime) {
        ctx.lastVideoTime = video.currentTime;
        ctx.lastFace = ctx.face.detectForVideo(video, now);
        ctx.faceTimestamp = now;
        inferredFace = true;
        if (ctx.pose && (!Number.isFinite(ctx.poseTimestamp) || now-ctx.poseTimestamp >= 1000/this.bodyFps)) {
          ctx.lastPose = ctx.pose.detectForVideo(video, now);
          ctx.poseTimestamp = now;
          inferredPose = true;
        }
        inferenceMs = Math.max(0, this.platform.now()-now);
        ctx.frames++;
        if (ctx.lastInference !== null && now > ctx.lastInference) {
          const measured = 1000/(now-ctx.lastInference);
          ctx.fps = ctx.fps ? .8*ctx.fps+.2*measured : measured;
        }
        ctx.lastInference = now;
      }
      const finished = this.platform.now();
      const frame = ctx.mapper.update({faceResult: available ? ctx.lastFace : null, poseResult: available ? ctx.lastPose : null,
        faceTimestamp: ctx.faceTimestamp, poseTimestamp: ctx.poseTimestamp,
        timestamp: finished, bodyEnabled: ctx.bodyEnabled, aspectRatio: video.videoWidth/video.videoHeight});
      if (inferredFace && frame.faceVisible) ctx.faceFrames++;
      if (inferredPose && frame.bodyVisible) ctx.bodyFrames++;
      frame.metrics = {...frame.metrics, inferenceMs, inferenceFps: ctx.fps,
        frames: ctx.frames, faceFrames: ctx.faceFrames, bodyFrames: ctx.bodyFrames};
      ctx.lastEmit = finished;
      if (!this.current(ctx)) return;
      this.onFrame(frame);
      if (!this.current(ctx)) return;
      const changed = frame.faceVisible !== this.state.faceVisible || frame.bodyVisible !== this.state.bodyVisible;
      const patch = {faceVisible: frame.faceVisible, bodyVisible: frame.bodyVisible, metrics: frame.metrics};
      this.state = {...this.state, ...patch};
      if (changed || finished-ctx.lastAnnounce >= 500) {
        ctx.lastAnnounce = finished;
        this.announce({...patch, message: !frame.faceVisible ? '未识别到面部，面部参数已回正。'
          : !ctx.bodyEnabled ? '本地面部识别中。'
          : !frame.bodyVisible ? '面部识别中；未识别到肩部，上半身参数已回正。'
          : frame.metrics.bodyPitchAvailable ? '本地面部与上半身识别中。'
          : '面部与肩部识别中；髋部不在画面，躯干俯仰保持中性。'});
      }
    } catch (error) {
      this.fail(ctx, publicError(error, 'models'));
    } finally {
      if (this.current(ctx)) ctx.raf = this.platform.requestFrame(() => this.tick(ctx));
    }
  }

  calibrate() {
    if (this.state.status !== 'running' || !this.session || !this.state.faceVisible) return false;
    const result = this.session.mapper.calibrate(this.platform.now());
    this.announce({calibrated: this.session.mapper.faceCalibrated, message: result.message});
    return result.ok;
  }

  release(ctx) {
    if (ctx.raf !== null) this.platform.cancelFrame(ctx.raf);
    ctx.raf = null;
    const stream = ctx.stream;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.removeEventListener?.('ended', ctx.ended);
        try {track.stop();} catch { /* Release the other tracks even if one is already gone. */ }
      }
      if (this.video?.srcObject === stream) {
        try {this.video.pause();} catch { /* Stream tracks are still stopped. */ }
        this.video.srcObject = null;
      }
    }
    ctx.stream = null;
    for (const key of ['face', 'pose']) {
      try {ctx[key]?.close();} catch { /* Attempt both model releases. */ }
      ctx[key] = null;
    }
    ctx.lastFace = ctx.lastPose = null;
    ctx.mapper.reset();
  }
  fail(ctx, error) {
    if (!this.current(ctx)) return;
    ctx.active = false;
    this.session = null;
    this.generation++;
    this.release(ctx);
    this.announce({status: 'error', code: error.code, message: error.message, faceVisible: false, bodyVisible: false, calibrated: false});
  }
  stop() {
    const ctx = this.session;
    if (!ctx) return this.getState();
    ctx.active = false;
    this.session = null;
    this.generation++;
    this.startPromise = null;
    this.release(ctx);
    this.announce({status: 'stopped', code: '', message: '摄像头已停止，设备与识别器已释放。',
      faceVisible: false, bodyVisible: false, calibrated: false});
    return this.getState();
  }
}
