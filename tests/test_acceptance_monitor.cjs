/* Synthetic timestamps and DOM stubs only; these tests do not open a camera. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../templates/web-preview/acceptance-monitor.js');
const frame = (timestamp, inferenceFrame, extra = {}) => ({timestamp, inferenceFrame, face: true, body: true,
  inputs: {FaceAngleX: 1, FaceAngleY: 2, FaceAngleZ: 3, MocopiBodyAngleX: 4, MocopiBodyAngleY: 5, MocopiBodyAngleZ: 6}, ...extra});

test('unstarted, invalid, duplicate and stale inference cannot count toward completion', async () => {
  const {AcceptanceMonitor} = await modulePromise;
  const m = new AcceptanceMonitor();
  assert.equal(m.report(1800000).camera30MinutesCompleted, false);
  assert.equal(m.sample(frame(0, 1)), false);
  assert.equal(m.start(NaN), false);
  assert.equal(m.start(100), true);
  assert.equal(m.start(101), false);
  assert.equal(m.sample(frame(99, 1)), false);
  assert.equal(m.sample(frame(100, 1)), true);
  for (const invalid of [frame(100, 2), frame(200, 1), frame(1800100, 1), frame(300, undefined), frame(300, NaN)]) {
    assert.equal(m.sample(invalid), false);
  }
  const report = m.report(1800100);
  assert.equal(report.samples, 1);
  assert.equal(report.longestContinuousSeconds, 0);
  assert.equal(report.camera30MinutesCompleted, false);
});

test('30 continuous minutes require genuinely new inference frames, not wall time', async () => {
  const {AcceptanceMonitor} = await modulePromise;
  const m = new AcceptanceMonitor(); m.start(0);
  for (let i = 0; i < 18000; i++) m.sample(frame(i*100, i+1));
  assert.equal(m.report(1800000).camera30MinutesCompleted, false);
  m.sample(frame(1800000, 18001));
  const r = m.stop(1800100);
  assert.equal(r.camera30MinutesCompleted, true);
  assert.equal(r.longestContinuousSeconds, 1800);
  assert.equal(r.observedSeconds, 1800);
  assert.equal(r.acceptance.includes('does not mean accepted'), true);
  assert.equal(m.sample(frame(1800200, 18002)), false);
});

test('separate segments and a stalled camera never silently become a continuous pass', async () => {
  const {AcceptanceMonitor} = await modulePromise;
  const m = new AcceptanceMonitor(); m.start(0);
  for (let i = 0; i <= 9000; i++) m.sample(frame(i*100, i+1));
  for (let i = 0; i <= 9000; i++) m.sample(frame(901000+i*100, 9002+i));
  const r = m.report(3600000);
  assert.equal(r.seconds, 3600);
  assert.equal(r.observedSeconds, 1800);
  assert.equal(r.longestContinuousSeconds, 900);
  assert.equal(r.inferenceGapsOver500ms, 1);
  assert.equal(r.maxInferenceGapMs, 1000);
  assert.equal(r.camera30MinutesCompleted, false);
});

test('very sparse inference does not pass the minimum sample rule', async () => {
  const {AcceptanceMonitor} = await modulePromise;
  const m = new AcceptanceMonitor(); m.start(0);
  for (let i = 0; i <= 3600; i++) m.sample(frame(i*500, i+1));
  assert.equal(m.report(1800000).longestContinuousSeconds, 1800);
  assert.equal(m.report(1800000).camera30MinutesCompleted, false);
});

test('static sampling summarizes independent face/body axes and measured drift', async () => {
  const {AcceptanceMonitor} = await modulePromise;
  const m = new AcceptanceMonitor(); m.start(0); m.sample(frame(0, 1));
  assert.equal(m.beginStatic(0), true);
  assert.equal(m.beginStatic(0), false);
  for (let i = 1; i <= 100; i++) m.sample(frame(i*100, i+1, {inputs: {FaceAngleX: i/10, MocopiBodyAngleZ: 6}}));
  const r = m.report(10000), s = r.staticWindows[0];
  assert.equal(s.axes.FaceAngleX.samples, 100);
  assert.ok(Math.abs(s.axes.FaceAngleX.frameDeltaRms-.1) < 1e-8);
  assert.equal(s.axes.FaceAngleX.driftMeasured, true);
  assert.ok(s.axes.FaceAngleX.drift > 7.9);
  assert.equal(s.axes.MocopiBodyAngleZ.drift, 0);
  assert.equal(s.axes.FaceAngleY.mean, null);
  assert.equal(s.axes.FaceAngleY.drift, null);
  assert.equal(r.staticWindowActive, false);
});

test('missing detection cannot create drift measurements or jitter across lost tracking', async () => {
  const {AcceptanceMonitor} = await modulePromise;
  const m = new AcceptanceMonitor(); m.start(0); m.sample(frame(0, 1)); m.beginStatic(0);
  for (let i = 1; i <= 100; i++) m.sample(frame(i*100, i+1, {
    face: i >= 30, body: false, inputs: {FaceAngleX: 100, MocopiBodyAngleX: 999},
  }));
  const s = m.report(10000).staticWindows[0];
  assert.equal(s.axes.FaceAngleX.driftMeasured, false);
  assert.equal(s.axes.FaceAngleX.drift, null);
  assert.equal(s.axes.FaceAngleX.frameDeltaRms, 0);
  assert.equal(s.axes.MocopiBodyAngleX.samples, 0);
  assert.equal(s.axes.MocopiBodyAngleX.drift, null);
});

test('inference gaps and stop abort incomplete static windows', async () => {
  const {AcceptanceMonitor} = await modulePromise;
  const m = new AcceptanceMonitor(); m.start(0); m.sample(frame(0, 1));
  assert.equal(m.beginStatic(600), false);
  m.beginStatic(0); m.sample(frame(1000, 2));
  assert.equal(m.report(1000).interruptedStaticWindows, 1);
  assert.equal(m.report(1000).staticWindows.length, 0);
  m.beginStatic(1000); m.stop(1100, 'capture-paused');
  assert.equal(m.report(1200).interruptedStaticWindows, 2);
  assert.equal(m.report(1200).stopReason, 'capture-paused');
  assert.equal(m.report(1200).seconds, 1.1);
  assert.equal(m.beginStatic(1200), false);
  assert.equal(m.start(2000), true);
  assert.equal(m.report(2000).samples, 0);
  assert.equal(m.report(2000).staticWindows.length, 0);
});

test('export has aggregate fields only, ignores arbitrary frame payloads, and serializes finite data', async () => {
  const {AcceptanceMonitor} = await modulePromise;
  const m = new AcceptanceMonitor(); m.start(0);
  m.sample(frame(0, 1, {landmarks: ['PRIVATE'], media: 'PRIVATE', inputs: {FaceAngleX: NaN, FaceAngleY: Infinity, secret: 'PRIVATE'}}));
  const r = m.report(0), json = JSON.stringify(r);
  assert.equal(r.savedMedia, false); assert.equal(r.savedLandmarks, false); assert.equal(r.savedInputReplay, false);
  assert.equal(json.includes('PRIVATE'), false);
  assert.equal(Object.hasOwn(r, 'inputs'), false);
  assert.equal(Object.hasOwn(r, 'landmarks'), false);
  assert.equal(json.includes('NaN'), false);
  assert.equal(json.includes('Infinity'), false);
});

test('UI requires externally running capture and ends statistics on pause, source change, camera stop and background', async () => {
  const {installAcceptanceUI} = await modulePromise;
  const originalDocument = global.document, originalWindow = global.window;
  const elements = new Map(), documentEvents = {}, windowEvents = {};
  const section = {setAttribute() {}, querySelector(key) {
    if (!elements.has(key)) elements.set(key, {disabled: false, textContent: ''});
    return elements.get(key);
  }};
  global.document = {hidden: false, createElement: () => section,
    querySelector: () => ({after() {}}), addEventListener: (event, fn) => {documentEvents[event] = fn;}};
  global.window = {addEventListener: (event, fn) => {windowEvents[event] = fn;}};
  let cameraStatus = 'stopped', cameraStarts = 0;
  const capture = {mode: 'idle', paused: false}, camera = {getState: () => ({status: cameraStatus}), start: () => cameraStarts++};
  try {
    const ui = installAcceptanceUI({capture, camera});
    const start = elements.get('[data-soak-start]');
    start.onclick(); assert.equal(ui.monitor.active, false); assert.equal(cameraStarts, 0);
    capture.mode = 'camera'; cameraStatus = 'running'; start.onclick(); assert.equal(ui.monitor.active, true);
    capture.paused = true; ui.sync(); assert.equal(ui.monitor.report(0).stopReason, 'capture-paused');
    capture.paused = false; start.onclick(); capture.mode = 'simulation'; ui.sync();
    assert.equal(ui.monitor.report(0).stopReason, 'source-changed');
    capture.mode = 'camera'; start.onclick(); cameraStatus = 'stopped'; ui.sync();
    assert.equal(ui.monitor.report(0).stopReason, 'camera-stopped');
    cameraStatus = 'running'; start.onclick(); document.hidden = true; documentEvents.visibilitychange();
    assert.equal(ui.monitor.report(0).stopReason, 'document-hidden');
    document.hidden = false; documentEvents.visibilitychange(); assert.equal(ui.monitor.active, false);
    start.onclick(); windowEvents.pagehide(); assert.equal(ui.monitor.report(0).stopReason, 'page-hidden');
    assert.equal(cameraStarts, 0);
  } finally {global.document = originalDocument; global.window = originalWindow;}
});
