# Changelog / 更新日志

## Unreleased

### Added / 新增

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
