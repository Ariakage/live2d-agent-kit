/** Aggregate-only camera checks: no images, landmarks, or input replay are retained. */
const AXES = ['FaceAngleX', 'FaceAngleY', 'FaceAngleZ', 'MocopiBodyAngleX', 'MocopiBodyAngleY', 'MocopiBodyAngleZ'];
const TARGET_SECONDS = 1800, MAX_GAP_MS = 500;
const stat = () => ({n: 0, sum: 0, sumSquares: 0, min: Infinity, max: -Infinity});
function add(s, x) {
  s.n++; s.sum += x; s.sumSquares += x*x; s.min = Math.min(s.min, x); s.max = Math.max(s.max, x);
}
function summarize(s) {
  const mean = s.n ? s.sum/s.n : null;
  return {samples: s.n, mean, standardDeviation: s.n ? Math.sqrt(Math.max(0, s.sumSquares/s.n-mean*mean)) : null,
    min: s.n ? s.min : null, max: s.n ? s.max : null};
}

export class AcceptanceMonitor {
  constructor() {
    this.active = false; this.startedAt = null; this.endedAt = null; this.lastAt = null;
    this.samples = 0; this.faceFrames = 0; this.bodyFrames = 0; this.longGaps = 0;
    this.maxGapMs = 0; this.observedMs = 0; this.longestContinuousMs = 0;
    this.segmentStart = null; this.segmentSamples = 0; this.lastInferenceFrame = null;
    this.completed = false; this.staticWindow = null; this.completedStatic = [];
    this.interruptedStatic = 0; this.stopReason = null;
  }
  start(now) {
    if (!Number.isFinite(now) || this.active) return false;
    Object.assign(this, new AcceptanceMonitor());
    this.active = true; this.startedAt = now;
    return true;
  }
  stop(now, reason = 'user') {
    if (this.active && Number.isFinite(now)) {
      this.active = false; this.endedAt = Math.max(this.startedAt, this.lastAt ?? now, now);
      this.stopReason = reason; this.interruptStatic();
    }
    return this.report(now);
  }
  interruptStatic() {
    if (this.staticWindow) this.interruptedStatic++;
    this.staticWindow = null;
  }
  beginStatic(now) {
    if (!this.active || this.staticWindow || !Number.isFinite(now) || this.lastAt === null ||
        now < this.lastAt || now-this.lastAt > MAX_GAP_MS) return false;
    this.staticWindow = {start: now, faceFrames: 0, bodyFrames: 0,
      axes: Object.fromEntries(AXES.map(id => [id, {all: stat(), first: stat(), last: stat(), delta: stat(), previous: null}]))};
    return true;
  }
  sample({timestamp, inferenceFrame, face, body, inputs} = {}) {
    // CameraTracker can emit stale fallback values without performing new inference.
    if (!this.active || !Number.isFinite(timestamp) || timestamp < this.startedAt ||
        !Number.isInteger(inferenceFrame) || inferenceFrame <= 0 ||
        this.lastAt !== null && timestamp <= this.lastAt ||
        this.lastInferenceFrame !== null && inferenceFrame <= this.lastInferenceFrame) return false;
    const gap = this.lastAt === null ? 0 : timestamp-this.lastAt;
    this.maxGapMs = Math.max(this.maxGapMs, gap);
    if (this.lastAt === null || gap > MAX_GAP_MS) {
      if (this.lastAt !== null) {this.longGaps++; this.interruptStatic();}
      this.segmentStart = timestamp; this.segmentSamples = 0;
    } else this.observedMs += gap;
    this.lastAt = timestamp; this.lastInferenceFrame = inferenceFrame;
    this.samples++; this.segmentSamples++;
    if (face === true) this.faceFrames++;
    if (body === true) this.bodyFrames++;
    const continuousMs = timestamp-this.segmentStart;
    this.longestContinuousMs = Math.max(this.longestContinuousMs, continuousMs);
    if (continuousMs >= TARGET_SECONDS*1000 && this.segmentSamples >= 9000) this.completed = true;
    const w = this.staticWindow;
    if (!w) return true;
    const elapsed = (timestamp-w.start)/1000;
    if (elapsed >= 0 && elapsed <= 10) {
      if (face === true) w.faceFrames++;
      if (body === true) w.bodyFrames++;
      for (const [id, a] of Object.entries(w.axes)) {
        const visible = id.startsWith('Mocopi') ? body === true : face === true;
        const x = inputs?.[id];
        if (!visible || !Number.isFinite(x)) {a.previous = null; continue;}
        add(a.all, x);
        if (elapsed < 2) add(a.first, x);
        if (elapsed >= 8) add(a.last, x);
        if (a.previous !== null) add(a.delta, x-a.previous);
        a.previous = x;
      }
    }
    if (elapsed >= 10) {
      this.completedStatic.push({sinceStartSeconds: (w.start-this.startedAt)/1000, seconds: 10,
        faceFrames: w.faceFrames, bodyFrames: w.bodyFrames,
        axes: Object.fromEntries(Object.entries(w.axes).map(([id, a]) => [id, {
          ...summarize(a.all), frameDeltaRms: a.delta.n ? Math.sqrt(a.delta.sumSquares/a.delta.n) : null,
          drift: a.first.n && a.last.n ? a.last.sum/a.last.n-a.first.sum/a.first.n : null,
          driftMeasured: a.first.n > 0 && a.last.n > 0,
        }]))});
      this.staticWindow = null;
    }
    return true;
  }
  report(now) {
    const end = this.endedAt ?? (Number.isFinite(now) ? now : this.lastAt ?? this.startedAt);
    return {schema: 'live2d-camera-soak-v1', active: this.active, stopReason: this.stopReason,
      seconds: this.startedAt === null ? 0 : Math.max(0, (end-this.startedAt)/1000), targetSeconds: TARGET_SECONDS,
      observedSeconds: this.observedMs/1000, longestContinuousSeconds: this.longestContinuousMs/1000,
      samples: this.samples, faceDetectionRatio: this.samples ? this.faceFrames/this.samples : 0,
      bodyDetectionRatio: this.samples ? this.bodyFrames/this.samples : 0,
      inferenceGapsOver500ms: this.longGaps, maxInferenceGapMs: this.maxGapMs,
      lastInferenceAgeMs: this.lastAt === null ? null : Math.max(0, end-this.lastAt),
      staticWindowActive: Boolean(this.staticWindow), interruptedStaticWindows: this.interruptedStatic,
      staticWindows: this.completedStatic, camera30MinutesCompleted: this.completed,
      completionRule: 'One uninterrupted 1800-second inference span, at least 9000 new inference frames, no gap over 500ms.',
      acceptance: 'Requires user visual review; completion does not mean accepted.',
      savedMedia: false, savedLandmarks: false, savedInputReplay: false};
  }
}

export function installAcceptanceUI({capture, camera}) {
  const monitor = new AcceptanceMonitor();
  const section = document.createElement('section');
  section.className = 'camera-panel acceptance-panel';
  section.setAttribute('aria-labelledby', 'acceptance-title');
  section.innerHTML = '<h2 id="acceptance-title">摄像头长跑统计</h2><p class="muted">先自行启动摄像头，再开始 30 分钟统计。只保存计数与汇总，不保存画面、节点或逐帧输入。静止采样时，请保持正脸与双肩不动 10 秒。</p><div class="toolbar"><button type="button" data-soak-start>开始统计</button><button type="button" data-soak-static disabled>静止采样 10 秒</button><button type="button" data-soak-stop disabled>结束统计</button><button type="button" data-soak-save disabled>导出统计 JSON</button></div><p class="muted" data-soak-status role="status">未开始 · 不会自动打开摄像头</p><p class="muted">暂停、切换输入或进入后台会结束本次统计；超过 500 毫秒未产生新识别帧会重新计算连续时长。计时完成仍需人工检查表情、动作和回正，VTS 另行验收。</p>';
  document.querySelector('.camera-panel').after(section);
  const status = section.querySelector('[data-soak-status]');
  const start = section.querySelector('[data-soak-start]'), sample = section.querySelector('[data-soak-static]');
  const stop = section.querySelector('[data-soak-stop]'), save = section.querySelector('[data-soak-save]');
  function unavailableReason() {
    if (document.hidden) return 'document-hidden';
    if (capture.mode !== 'camera') return 'source-changed';
    if (capture.paused) return 'capture-paused';
    if (camera.getState().status !== 'running') return 'camera-stopped';
    return null;
  }
  const clock = seconds => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2, '0')}`;
  function sync() {
    const now = performance.now(), reason = unavailableReason();
    if (reason && monitor.active) monitor.stop(now, reason);
    const r = monitor.report(now);
    start.disabled = monitor.active;
    sample.disabled = !monitor.active || r.staticWindowActive;
    stop.disabled = !monitor.active; save.disabled = monitor.startedAt === null;
    if (monitor.startedAt === null) return;
    status.textContent = `${r.active ? '统计中' : '已结束'} · 最长连续 ${clock(r.longestContinuousSeconds)} / 30:00 · 总用时 ${clock(r.seconds)} · 新识别 ${r.samples} 帧 · 脸 ${(r.faceDetectionRatio*100).toFixed(1)}% / 双肩 ${(r.bodyDetectionRatio*100).toFixed(1)}% · 已完成 ${r.staticWindows.length} 次静止采样${r.staticWindowActive ? ' · 静止采样中' : ''}${r.camera30MinutesCompleted ? ' · 连续计时达标，等待人工验收' : ''}`;
  }
  start.onclick = () => {
    if (unavailableReason()) {status.textContent = '请先启动摄像头，并在当前页面保持捕捉运行。'; return;}
    monitor.start(performance.now()); sync();
  };
  sample.onclick = () => {
    sync();
    if (!monitor.beginStatic(performance.now())) status.textContent = '请先开始统计，并等待新识别帧。';
    else sync();
  };
  stop.onclick = () => {monitor.stop(performance.now()); sync();};
  save.onclick = () => {
    sync();
    const blob = new Blob([JSON.stringify(monitor.report(performance.now()), null, 2)+'\n'], {type: 'application/json'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'live2d-camera-soak.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const pagehide = () => {monitor.stop(performance.now(), 'page-hidden'); sync();};
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', pagehide);
  return {monitor, sync};
}
