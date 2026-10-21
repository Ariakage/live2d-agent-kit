# Changelog / 更新日志

## 2026-10-21 · Native Pink dynamics / 身体动态与表情动作

- Pink Sakura now has 37 native parameters: shoulder, chest/waist, restrained upper-arm sway, cuffs, skirt, bow, Float and Wind join the existing face and hair rig. Nine local deformers retain the connected sleeve/body raster and preserve the neutral controls; no chin-rest, heart, wave or finger gestures were added.
- Added the public `dynamics-regions.json` measurement profile and GPL `PinkSakuraDynamics.kt` extension using the pinned psd2live engine. Source-package checks require the measurement file, so reconstruction does not depend on a private `work/` directory.
- Added 8 parameter-only expressions and 6 motions, bringing the motion library to 10. `build-performance.cjs` generates these from a fresh runtime and a matching passed native Core report. Quiet / Curious / Sleepy idles rotate in the web preview; motion handoffs retain the outgoing pose.
- Mapped six upper-body estimates to native controls and added optional breathing, breeze, float and speech bob, all off by default during capture. These accents are separate from measured camera signals; calibration, tracking loss and pause/reset have regression coverage.
- Preserved the approved face and artwork. The unchanged low-resolution atlas permits reuse of the original 8192² `realesr-animevideov3-x4` texture; no new neural upscaling was run.
- Recompiled and exported Pink LOW / HD and the geometric Minimal example using cached Gradle dependencies. Core/Web checks, combined continuous motion and neutral-face comparison are recorded in the [scoped dynamics report](examples/pink-sakura/verification/dynamics-20261020/README.md). Automated frames and selected visual review are reported separately.
- Partial-blink lashes and the faint closed lip remain known art limitations. This update does not claim new physical-camera, 30-minute soak, VTube Studio, official Editor or full cold-dependency acceptance.

## 2026-10-18 · Preview interaction tools / 网页交互迁移

- Added independent local-video, landmark and 2D iris-gaze display switches. Stale points expire independently; stopping or backgrounding clears diagnostic data without storing it.
- Expressions now fade over live tracking input and can change while capture is paused. The frozen source excludes expression offsets to prevent double application; manual parameters retain priority and reset remains immediate.
- Added aggregate-only camera-session statistics, 10-second static jitter/drift samples and JSON export. Cached frames, pauses and stopped cameras cannot count toward a continuous 30-minute run.
- Updated the bilingual README and camera/preview guides. Pink artwork, model files, four motions, bindings and the pinned exporter are unchanged; no expression library or hand gestures were added.
- Added unit and opt-in real-Core browser regressions with synthetic callbacks and temporary expression fixtures. These tests never request a camera and do not establish physical-camera, 30-minute or VTube Studio acceptance.
- Validation: 61 Python / 59 Node tests and 38 real WebGL checks passed; desktop and mobile controls were visually reviewed. See the [scoped report](docs/verification/web-features-20261018.json) for runtime and source identities.

## 2026-10-17 · README and psd2live authoring history / 文档整理

- Reworked both READMEs around the example, quick start and production workflow. Kept detailed evidence in the linked guides and added the supplied light/dark Star History chart.
- Documented the later psd2live 1.3.0 GUI/MCP and CMO/Swing work, plus 1.4.0 physics import, with pinned commits and a sanitized historical record. Corrected the tool catalog's outdated “evaluated only” label for the built-in MCP.
- Updated MCP instructions to the tested `inspect` / `state` interface and linked the version notes from setup, workflow and the adapter. Kept the Apple Silicon native-motion failure and official Editor acceptance gap explicit.
- The public examples, default engine lock, patches, artwork and runtime models are unchanged. This documentation update does not claim a new engine migration or device test.

## 2026-10-17 · Continuous motion review / 连续动作验收

- Synced seam diagnosis, complete motion paths, neutral regression, artifact identity and recoverable packaging lessons into the skill and workflow. Private character assets remain excluded.
- Added Pink Sakura's `check-continuous.cjs` and three focused tests. It captures after actual renderer completion, verifies Core inputs and resource hashes, measures frame gaps, and checks neutral RGBA restoration without changing the preview runtime.
- Kept the existing four motions, model and 4× AnimeVideo v3 atlas unchanged. No chin-rest, heart or wave gestures were added.
- Re-ran 202 native Core poses, 22 Web checks, 91 static captures and 1,488 continuous frames across six paths; reviewed 18 numbered overview sheets and five original-size frames. All automated checks passed. Fine eyelash/lip limitations remain; see the [scoped report](examples/pink-sakura/verification/continuous-20261017/README.md).
- Commit `e2c4679` passed a fresh offline Git-archive check: no pre-existing work/cache directories, byte-identical eyebrow regeneration and both public recipe rebuilds. The [source-package report](docs/verification/source-package-e2c4679.json) keeps its checked commit identity.
- Verified a new runtime ZIP by extraction, CRC and every member SHA. 61 Python / 35 Node tests passed. Camera, VTube Studio, neural upscaling and a cold engine compile were not rerun.

## Unreleased

### Added / 新增

- An [existing-model migration guide](docs/migrate-existing-model.md), including native input ranges, per-layer green despill, eyebrow artwork, loaded-file identities and physical-camera regression scope.
- Optional `captureHoldDefaults` model profiles to preserve selected legacy defaults during capture. Mapped inputs take priority; direct native controls and unlisted physics remain available. The default empty profile preserves existing behavior.
- Local browser camera tracking with pinned MediaPipe Face Landmarker and Pose Landmarker Lite. Face input includes eyebrows, blinking, gaze, mouth and head angles; shoulder/torso angles are approximate single-camera estimates.
- Explicit camera start/stop, neutral calibration, optional local video display, and a face-only mode. Video inference stays local; the application does not upload or record video and never requests a microphone.
- A separately acquired tracking dependency lock, setup/verification script, and an opt-in physical-camera regression command: `node scripts/check-camera.cjs --physical-camera`.
- Independent left/right eyebrow layers and parameter bindings for Pink Sakura and the geometric minimal example. The original character face remains the reference for decomposition and neutral-image checks.

### Changed / 调整

- Camera, simulation and manual signals share the same native-parameter mapping and smoothing. Missing or stale tracking returns to model defaults; changing input source, leaving the page or backgrounding the tab releases the camera.
- Camera smoothing now uses elapsed wall time, so slow inference frames do not delay recovery from lost tracking.
- The preview server restricts connections to its own origin, blocking the upstream SDK’s default usage-metric logging. Other hosting setups must retain the same policy.
- Added optional source-only engine acquisition, a loopback curl Maven relay and an explicit matching Gradle launcher for slow-download environments; default Wrapper behavior remains available.
- Updated Chinese/English README, camera workflow instructions and tool references. Current runtime and build verification results are documented separately from historical test records.

### Tests / 验证

- The migration commit `526e9fb` also passed a fresh offline `git archive` rebuild: 61 Python / 32 Node tests and unchanged Pink/Minimal source recipes. The [report](docs/verification/source-package-526e9fb.json) records the checked revision; it does not claim another engine cold compile.
- Migration profile regression: 61 Python / 32 Node tests pass, including configuration validation, mapping precedence, unknown parameter IDs and capture-versus-native control ownership. Earlier archived build and camera reports retain their original source identities and test counts.
- Pink Sakura with the updated template and default empty hold profile passed [22 real WebGL checks](docs/verification/capture-defaults/README.md). Unmapped physics remained unowned by capture; this regression did not request a camera.
- The committed `7f391f4` archive passed an independent offline source-package check: 59 Python / 28 Node tests, three byte-identical eyebrow images, and 24-layer Pink / 16-layer Minimal regeneration. The [original report](docs/verification/source-package-7f391f4.json) and [evidence index with SHA-256](docs/verification/README.md) preserve its exact revision. This check does not repeat the separately recorded cold compilation, Core or physical-camera runs.
- 59 Python tests and 28 Node tests passed, covering source and asset boundaries, build entry points, eyebrow/landmark mapping, calibration, stale inputs, camera lifecycle races and dependency integrity.
- Pink Sakura: 24 parameters / 26 drawables, 202 native Core poses, 22 Web checks and 91 pose captures; LOW and 4× HD MOC bytes match.
- Final physical-camera regression: 16 checks passed on the eyebrow-bound HD model. Numeric results include real brow input, calibration, stopped-video neutralization, source takeover, no audio and device release. Three SDK log attempts were blocked by the response policy. See [camera evidence](docs/verification/camera-tracking.json).
- Tracking dependencies were fetched from an empty directory: 12 files / 45,157,730 bytes, followed by a successful offline verification. Synthetic fixtures remain separate from physical-device evidence.
- An initially empty-cache engine build compiled the complete source; Minimal passed Core and 22 Web checks. The public Pink source recipe also exported with that new engine, passed Core and matched the published HD MOC. Download retries and the exact build route are recorded in [reproducibility.md](docs/reproducibility.md).

## 2026-09-12 · Bilingual guide and asset consistency

- Added Chinese/English README, model image tables and a separately attributed Pink Sakura header.
- Pinned the actual `realesr-animevideov3-x4` download source and verified both NCNN weight hashes against the production record.
- Fixed preview destination aliases and froze atlas inputs so RGB, alpha and source hashes refer to one revision.
- Added HTML resource validation and an isolated committed-source-package check. See [repository review](docs/repository-review.md) for the recorded 41-test and real export/Core/Web regression scope.
