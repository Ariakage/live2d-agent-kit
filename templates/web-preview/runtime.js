/** Real Cubism Core + WebGL model preview. Dependencies are pinned and local. */
import { DRAWING, REGIONS } from './view-config.js';
import { ExpressionLayer } from './expression-layer.js';
import { SpeechBob } from './speech-bob.js';
const base = new URL('./', import.meta.url);
let dependencyPromise;

function loadScript(file, ready) {
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { script.remove(); reject(new Error(`加载依赖超时：${file}`)); }, 20000);
    script.src = new URL(`vendor/${file}`, base).href;
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); reject(new Error(`无法加载本地依赖：${file}`)); };
    document.head.append(script);
  });
}

async function dependencies() {
  if (!dependencyPromise) dependencyPromise = (async () => {
    await loadScript('live2dcubismcore.min.js', () => !!window.Live2DCubismCore);
    // The script load event can precede asynchronous WASM initialization.
    const deadline = performance.now() + 15000;
    while (true) {
      try { if (window.Live2DCubismCore?.Version.csmGetVersion()) break; } catch { /* WASM is starting. */ }
      if (performance.now() > deadline) throw new Error('Cubism Core 初始化超时');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await loadScript('pixi-6.5.10.min.js', () => !!window.PIXI);
    await loadScript('pixi-live2d-display-0.4.0.min.js', () => !!window.PIXI?.live2d?.Live2DModel);
  })().catch(error => { dependencyPromise = undefined; throw error; });
  return dependencyPromise;
}

async function readJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`无法读取模型资源（HTTP ${response.status}）：${new URL(url).pathname.split('/').pop()}`);
  return response.json();
}

/**
 * onReady receives {parameters:[{id,min,max,default,value}], motions, expressions,
 * coreVersion, renderer}. onStats receives {fps,parameters:{[id]:value},autoPlay,captureActive}.
 * Manual values override expressions, motion, breathing, focus, and physics.
 * Capture is a separate source: supplied values drive physics and override its
 * outputs before the expression layer. Manual parameters always take priority.
 */
export async function createViewer({ canvas, modelUrl, onReady, onError, onStats } = {}) {
  let app, model, resizeObserver, destroyed = false;
  let disposePointer = () => {};
  try {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('预览画布不存在');
    await dependencies();
    const PIXI = window.PIXI;
    if (!PIXI.utils.isWebGLSupported()) throw new Error('当前浏览器无法创建 WebGL 画布');
    const absoluteModelURL = new URL(modelUrl, document.baseURI);
    const settings = await readJSON(absoluteModelURL);
    let parameterNames = new Map();
    if (settings.FileReferences.DisplayInfo) {
      try {
        const displayInfo = await readJSON(new URL(settings.FileReferences.DisplayInfo, absoluteModelURL));
        parameterNames = new Map((displayInfo.Parameters || []).map(p => [p.Id, p.Name]));
      } catch { /* Parameter IDs and ranges are still available from the actual Core model. */ }
    }
    app = new PIXI.Application({
      view: canvas, width: 1, height: 1, backgroundAlpha: 0, antialias: true,
      autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2),
      preserveDrawingBuffer: true, powerPreference: 'high-performance',
      autoStart: false,
    });
    if (!app.renderer.gl) throw new Error('WebGL 初始化失败');
    app.ticker.maxFPS = 60;
    model = await PIXI.live2d.Live2DModel.from(absoluteModelURL.href, {
      autoUpdate: false, autoInteract: false, motionPreload: 'ALL', idleMotionGroup: 'Idle',
    });
    app.stage.addChild(model);
    const internal = model.internalModel;
    // The SDK's default 256px clipping mask becomes visibly stepped in a face
    // close-up even when the source atlas is 8K. Set it before the first draw.
    const maxTextureSize = app.renderer.gl.getParameter(app.renderer.gl.MAX_TEXTURE_SIZE);
    const requestedClippingMaskSize = Math.min(1024, maxTextureSize);
    internal.renderer.setClippingMaskBufferSize?.(requestedClippingMaskSize);
    const clippingMaskSize = internal.renderer.getClippingMaskBufferSize?.() ?? null;
    const core = internal.coreModel;
    const raw = core.getModel();
    const rawParams = raw.parameters;
    const defaults = Float32Array.from(rawParams.defaultValues);
    const descriptors = Array.from(rawParams.ids, (id, index) => ({
      id, name: parameterNames.get(id) || id, min: rawParams.minimumValues[index], max: rawParams.maximumValues[index],
      default: defaults[index], value: defaults[index],
    }));
    const indices = new Map(descriptors.map((parameter, i) => [parameter.id, i]));
    const manual = new Map();
    let captureActive = false;
    const captureParameters = new Map();
    const motionDefinitions = settings.FileReferences.Motions || {};
    const expressionDefinitions = settings.FileReferences.Expressions || [];
    const motionManager = internal.motionManager;
    let autoPlay = false, pointerFollow = false, oneShot = false;
    let selectedView = 'full', zoom = 1, expressionName = '', expressionFadeOut = .35;
    const expressionLayer = new ExpressionLayer();
    const speech = new SpeechBob();
    let speechEnabled = false, floatProfile = 'normal', idleElapsed = 0, idleIndex = 0;
    const idleGroups = ['Quiet', 'Curious', 'Sleepy'].filter(name => motionDefinitions[name]?.length);
    let currentDelta = 0, frozenCapture = null, frozenExpressionTransition = false;
    let motionBlend = null;
    let expressionGeneration = 0, motionGeneration = 0;
    let lastStats = 0, frameCount = 0, frameElapsed = 0;
    let lastRenderedParameters = Object.fromEntries(descriptors.map(p => [p.id, p.default]));
    // Keep the pre-expression source so a paused blink or mouth accent is never baked in twice.
    let lastExpressionSource = Float32Array.from(defaults);
    const modelWidth = internal.width || DRAWING.width;
    const modelHeight = internal.height || DRAWING.height;
    const originalUpdate = internal.update.bind(internal);
    const originalFocus = internal.updateFocus.bind(internal);
    const originalNatural = internal.updateNaturalMovements.bind(internal);
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    function writeParameter(id, value, blend = 'Overwrite') {
      const i = indices.get(id);
      if (i === undefined || !Number.isFinite(value)) return false;
      const mixed = blend === 'Add' ? rawParams.values[i] + value
        : blend === 'Multiply' ? rawParams.values[i] * value : value;
      rawParams.values[i] = clamp(mixed, rawParams.minimumValues[i], rawParams.maximumValues[i]);
      return true;
    }
    function finalParameters() {
      if (captureActive) {
        for (const [id, value] of captureParameters) writeParameter(id, value);
        const accent = speech.step(rawParams.values[indices.get('ParamMouthOpenY')] || 0, currentDelta,
          {enabled: speechEnabled, active: true});
        writeParameter('ParamAngleY', accent.angleY, 'Add');
        writeParameter('ParamFloat', accent.float, 'Add');
      }
      if (motionBlend && !frozenCapture) {
        motionBlend.elapsed += currentDelta;
        const t = Math.min(1, motionBlend.elapsed / .6), weight = t * t * (3 - 2 * t);
        for (let i = 0; i < rawParams.values.length; i++)
          rawParams.values[i] = motionBlend.from[i] + (rawParams.values[i] - motionBlend.from[i]) * weight;
        if (t === 1) motionBlend = null;
      }
      lastExpressionSource = Float32Array.from(rawParams.values);
      expressionLayer.step(frozenCapture && !frozenExpressionTransition ? 0 : currentDelta)
        .apply(id => rawParams.values[indices.get(id)], writeParameter);
      if (frozenExpressionTransition && expressionLayer.elapsed >= expressionLayer.duration) frozenExpressionTransition = false;
      for (const [id, value] of manual) writeParameter(id, value);
      lastRenderedParameters = Object.fromEntries(descriptors.map((p, i) => [p.id, rawParams.values[i]]));
    }
    // This event is intentionally after physics and just before native vertex evaluation.
    internal.on('beforeModelUpdate', finalParameters);
    internal.updateFocus = () => { if (autoPlay && pointerFollow) originalFocus(); };
    internal.updateNaturalMovements = (dt, now) => { if (autoPlay) originalNatural(dt, now); };
    internal.update = (dt, now) => {
      currentDelta = Number.isFinite(dt) ? clamp(dt, 0, 50) / 1000 : 0;
      if (frozenCapture) {
        rawParams.values.set(frozenCapture);
        finalParameters();
        core.update();
      } else if (captureActive) {
        // Bypass the motion manager, automatic eye blink, focus, and breath.
        // Cubism physics and pose take seconds; the Pixi update takes milliseconds.
        const dtSeconds = Number.isFinite(dt) ? clamp(dt, 0, 50) / 1000 : 0;
        rawParams.values.set(defaults);
        for (const [id, value] of captureParameters) writeParameter(id, value);
        internal.physics?.evaluate(core, dtSeconds);
        internal.pose?.updateParameters(core, dtSeconds);
        finalParameters();
        core.update();
      } else if (autoPlay || oneShot) {
        if (autoPlay && idleGroups.length > 1) {
          idleElapsed += currentDelta;
          if (idleElapsed >= 48) {
            idleElapsed = 0; idleIndex = (idleIndex + 1) % idleGroups.length;
            motionManager.groups.idle = idleGroups[idleIndex];
            // Start with the motion's fade; stopping all motions here would snap the pose.
            model.motion(idleGroups[idleIndex], 0, PIXI.live2d.MotionPriority.FORCE).catch(error => onError?.(error));
          }
        }
        originalUpdate(Math.min(dt, 50), now);
      } else {
        // A paused preview has no ticking motion, breath, blinking, or physics.
        rawParams.values.set(defaults);
        finalParameters();
        core.update();
      }
    };
    motionManager.on('motionFinish', () => { if (!autoPlay) oneShot = false; });

    function fit() {
      if (destroyed) return;
      // Pixi's autoDensity writes an inline pixel size to the canvas. Measure its
      // parent so the initial 1 px renderer and later resizes cannot pin the view.
      const width = Math.max(1, canvas.parentElement?.clientWidth || canvas.clientWidth);
      const height = Math.max(1, canvas.parentElement?.clientHeight || canvas.clientHeight);
      app.renderer.resize(width, height);
      // Regions are in the logical source drawing coordinates, independent of atlas resolution.
      const r = REGIONS[selectedView];
      const sx = modelWidth / DRAWING.width, sy = modelHeight / DRAWING.height;
      const scale = Math.min(width / (r.w * sx), height / (r.h * sy)) * 0.94 * zoom;
      model.scale.set(scale);
      model.position.set(width / 2 - (r.x + r.w / 2) * sx * scale,
        height / 2 - (r.y + r.h / 2) * sy * scale);
    }
    resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(canvas.parentElement || canvas);
    window.addEventListener('resize', fit);
    const move = event => {
      if (!pointerFollow || !autoPlay || destroyed) return;
      const rect = canvas.getBoundingClientRect();
      // Restrict focus strength so inspecting the portrait doesn't force extreme poses.
      internal.focusController.focus(
        clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1) * 0.45,
        clamp(1 - (event.clientY - rect.top) / rect.height * 2, -1, 1) * 0.35,
      );
    };
    const leave = () => internal.focusController.focus(0, 0);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    const contextLost = event => {
      event.preventDefault();
      app.stop();
      onError?.(new Error('WebGL 上下文已丢失，请刷新网页重新加载模型'));
    };
    canvas.addEventListener('webglcontextlost', contextLost);
    disposePointer = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('webglcontextlost', contextLost);
      window.removeEventListener('resize', fit);
    };
    app.ticker.add(() => {
      if (destroyed) return;
      model.update(Math.min(app.ticker.deltaMS, 50));
      frameCount++;
      frameElapsed += app.ticker.deltaMS;
      const now = performance.now();
      if (now - lastStats > 400) {
        onStats?.({ fps: Math.round(frameCount * 1000 / Math.max(frameElapsed, 1)),
          parameters: { ...lastRenderedParameters }, autoPlay, captureActive });
        frameCount = 0; frameElapsed = 0; lastStats = now;
      }
    }, null, PIXI.UPDATE_PRIORITY.HIGH);

    const viewer = {
      setParameter(id, value) {
        if (!indices.has(id)) return false;
        if (value === null || value === undefined) { manual.delete(id); return true; }
        const number = Number(value), p = descriptors[indices.get(id)];
        if (!Number.isFinite(number)) return false;
        manual.set(id, clamp(number, p.min, p.max));
        return true;
      },
      clearParameters() { manual.clear(); },
      setCaptureParameters(parameters) {
        if (destroyed || !parameters || typeof parameters !== 'object' || Array.isArray(parameters)) return false;
        // Each call replaces the frame rather than retaining stale tracked values.
        captureParameters.clear();
        frozenCapture = null; frozenExpressionTransition = false;
        motionBlend = null;
        for (const [id, value] of Object.entries(parameters)) {
          const index = indices.get(id);
          if (index === undefined || typeof value !== 'number' || !Number.isFinite(value)) continue;
          const parameter = descriptors[index];
          captureParameters.set(id, clamp(value, parameter.min, parameter.max));
        }
        captureActive = true;
        return true;
      },
      freezeCaptureParameters() {
        if (destroyed || !captureActive) return false;
        frozenCapture = Float32Array.from(lastExpressionSource);
        frozenExpressionTransition = false;
        captureActive = false; captureParameters.clear();
        viewer.renderNow(); return true;
      },
      clearCaptureParameters() {
        captureActive = false; captureParameters.clear();
        speech.reset();
        frozenCapture = null; frozenExpressionTransition = false;
      },
      setSpeechBob(enabled) { speechEnabled = Boolean(enabled); if (!speechEnabled) speech.reset(); },
      setFloatProfile(profile) { if (['low', 'normal', 'high'].includes(profile)) floatProfile = profile; },
      setAutoPlay(enabled) {
        motionBlend = null;
        frozenCapture = null; frozenExpressionTransition = false;
        autoPlay = Boolean(enabled); oneShot = false; motionGeneration++;
        motionManager.stopAllMotions();
        idleElapsed = 0; idleIndex = 0;
        motionManager.groups.idle = autoPlay ? (idleGroups[0] || 'Idle') : '__paused__';
        rawParams.values.set(defaults); core.saveParameters();
        leave();
      },
      async playMotion(group) {
        if (!motionDefinitions[group]?.length || destroyed) return false;
        const generation = ++motionGeneration;
        const from = Float32Array.from(descriptors.map(p => lastRenderedParameters[p.id]));
        autoPlay = false; pointerFollow = false; manual.clear();
        viewer.clearCaptureParameters();
        expressionLayer.reset(); expressionName = ''; expressionGeneration++;
        motionManager.groups.idle = '__paused__';
        // Hold the outgoing frame while loading, then blend capture/manual/motion alike.
        frozenCapture = from;
        motionManager.stopAllMotions();
        let started;
        try { started = await model.motion(group, 0, PIXI.live2d.MotionPriority.FORCE); }
        catch(error) { if(generation===motionGeneration){frozenCapture=null;motionBlend=null;} throw error; }
        if (generation !== motionGeneration || destroyed) return false;
        frozenCapture = null;
        motionBlend = {from, elapsed: 0};
        oneShot = Boolean(started);
        return started;
      },
      async setExpression(name, {immediate = false} = {}) {
        if (destroyed) return false;
        const generation = ++expressionGeneration;
        if (!name || name === 'Neutral' || name === 'neutral') {
          expressionLayer.set([], immediate ? 0 : expressionFadeOut);
          frozenExpressionTransition = Boolean(frozenCapture); expressionName = '';
          return true;
        }
        const definition = expressionDefinitions.find(e => e.Name === name);
        if (!definition) return false;
        let data;
        try { data = await readJSON(new URL(definition.File, absoluteModelURL)); }
        catch (error) {
          if (generation !== expressionGeneration || destroyed) return false;
          throw error;
        }
        if (generation !== expressionGeneration || destroyed) return false;
        if (!data || typeof data !== 'object') throw new Error(`表情格式无效：${name}`);
        expressionLayer.set(Array.isArray(data.Parameters) ? data.Parameters : [], immediate ? 0 : data.FadeInTime);
        expressionFadeOut = Number.isFinite(data.FadeOutTime) && data.FadeOutTime >= 0 ? data.FadeOutTime : .35;
        frozenExpressionTransition = Boolean(frozenCapture);
        expressionName = name;
        return true;
      },
      setView(view) { if (!['full', 'portrait', 'face'].includes(view)) return false; selectedView = view; zoom = 1; fit(); return true; },
      setZoom(factor) { if (Number.isFinite(Number(factor))) { zoom = clamp(Number(factor), 0.5, 2.5); fit(); } },
      setPointerFollow(enabled) { pointerFollow = Boolean(enabled); if (!pointerFollow) leave(); },
      reset() {
        viewer.clearCaptureParameters();
        manual.clear(); expressionLayer.reset(); expressionName = ''; expressionFadeOut = .35; expressionGeneration++;
        selectedView = 'full'; zoom = 1; pointerFollow = false;
        viewer.setAutoPlay(false); fit();
      },
      getState() { return { autoPlay, pointerFollow, view: selectedView, zoom, expression: expressionName,
        speechBob: speechEnabled, floatProfile, idleGroup: autoPlay ? motionManager.groups.idle : null,
        captureActive, capturePaused: Boolean(frozenCapture), captureParameters: Object.fromEntries(captureParameters),
        manualParameters: Object.fromEntries(manual), parameters: { ...lastRenderedParameters } }; },
      getParameters() { return descriptors.map(p => ({ ...p, value: lastRenderedParameters[p.id] })); },
      getDrawableState() { return { positions: Array.from(raw.drawables.vertexPositions, v => Array.from(v)), opacities: Array.from(raw.drawables.opacities) }; },
      getModelCounts() { return { parameters: raw.parameters.count, drawables: raw.drawables.count,
        vertices: Array.from(raw.drawables.vertexCounts).reduce((sum, value) => sum + value, 0),
        triangles: Array.from(raw.drawables.indexCounts).reduce((sum, value) => sum + value / 3, 0) }; },
      // Pixi's model.update(0) only accumulates time and can skip evaluation.
      // Scrubbing needs current source values evaluated before taking a snapshot.
      renderNow() { if (!destroyed) { internal.update(0, performance.now()); app.render(); } },
      capture() { return canvas.toDataURL('image/png'); },
      destroy() {
        if (destroyed) return;
        viewer.clearCaptureParameters();
        destroyed = true; motionGeneration++; expressionGeneration++;
        resizeObserver.disconnect(); disposePointer();
        app.stop(); app.destroy(false, { children: true, texture: true, baseTexture: true });
      },
    };
    fit(); app.start();
    const version = window.Live2DCubismCore.Version.csmGetVersion();
    onReady?.({ modelUrl: absoluteModelURL.href, physics: Boolean(settings.FileReferences.Physics), parameters: descriptors.map(p => ({ ...p })), motions: Object.keys(motionDefinitions),
      expressions: expressionDefinitions.map(e => e.Name),
      coreVersionNumber: version >>> 0,
      coreVersion: `${version >>> 24}.${(version >>> 16) & 255}.${version & 65535}`,
      renderer: 'WebGL', maxTextureSize, requestedClippingMaskSize, clippingMaskSize, width: modelWidth, height: modelHeight });
    return viewer;
  } catch (error) {
    destroyed = true; resizeObserver?.disconnect(); disposePointer();
    try { app?.destroy(false, { children: true, texture: true, baseTexture: true }); } catch { /* Preserve original error. */ }
    onError?.(error);
    throw error;
  }
}
