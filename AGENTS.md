# Working on this kit

Read `SKILL.md` for model-production tasks. For changes to the kit itself:

- Keep user artwork, weights, SDKs, machine-specific paths and generated models out of Git.
- Put runtime experiments under ignored `work/`; do not affect unrelated preview servers.
- Keep `patches` and the Kotlin integration's GPL license separate from the root MIT license.
- Validate script behavior with `python3 -m unittest discover -s tests -v` and `bash scripts/validate.sh --kit`.
- Use the geometric minimal example for an actual exporter/Core/Web test when changing that chain.
- Keep commands and declared verification scope consistent with what has actually run.
