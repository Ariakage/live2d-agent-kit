# Working on this kit

Read `SKILL.md` for model-production tasks. For changes to the kit itself:

- Keep user artwork, weights, SDKs, machine-specific paths and generated models out of Git by default. The user explicitly authorized a narrow exception for the new Pink Sakura example: only the named art and runtime assets covered by `examples/pink-sakura/LICENSE.md` may be included with provenance. Previous private characters, unrelated artwork, weights and SDKs remain excluded.
- Keep Pink Sakura's CC BY 4.0 assets separate from MIT recipe code and GPL integrations. Preserve original image-generation attribution and modification credits; do not add noncommercial, no-streaming or permanent-visible-watermark restrictions.
- The user-requested Pink Sakura README header is covered separately by `assets/readme/README.md`; keep its generated-art provenance and CC BY 4.0 scope. Do not label it a runtime verification screenshot.
- Put runtime experiments under ignored `work/`; do not affect unrelated preview servers.
- Keep `patches` and the Kotlin integration's GPL license separate from the root MIT license.
- Validate script behavior with `python3 -m unittest discover -s tests -v` and `bash scripts/validate.sh --kit`.
- Run browser-input unit tests with `node --test tests/test_*.cjs` when changing tracking code. Simulated devices or prerecorded fixtures are separate from physical-camera validation.
- Camera tracking starts only through an explicit user action. Keep video inference local, stop tracks on exit/source changes, and do not commit camera images, recordings, device IDs or personal paths in test reports.
- Use the geometric minimal example for an actual exporter/Core/Web test when changing that chain.
- Keep commands and declared verification scope consistent with what has actually run.
