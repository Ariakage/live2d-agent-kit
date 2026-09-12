#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
KIT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ $# -ne 2 ]]; then
  echo 'Usage: bash scripts/export-model.sh MANIFEST.json NEW_OUTPUT_DIRECTORY' >&2; exit 2
fi
MODEL_MANIFEST="$(python3 -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).resolve())' "$1")"
MODEL_OUTPUT="$(python3 -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).resolve())' "$2")"
ENGINE_DIR="${PSD2LIVE_DIR:-$KIT_ROOT/.cache/psd2live}"
if [[ -e "$MODEL_OUTPUT" ]] && [[ -n "$(ls -A "$MODEL_OUTPUT")" ]]; then
  echo 'Output directory is nonempty; select a new revision/output directory.' >&2; exit 2
fi
python3 "$SCRIPT_DIR/validate.py" --manifest "$MODEL_MANIFEST"
if [[ ! -f "$ENGINE_DIR/gradlew" ]]; then
  echo 'Run scripts/setup-psd2live.sh first (or set PSD2LIVE_DIR).' >&2; exit 2
fi
cd "$ENGINE_DIR"
exec bash ./gradlew --no-daemon --console=plain --init-script "$SCRIPT_DIR/psd2live-init.gradle" \
  exportManifest "-PagentKitIntegrationDir=$KIT_ROOT/integrations/psd2live" \
  "-PcharacterManifest=$MODEL_MANIFEST" "-PcharacterOutput=$MODEL_OUTPUT"
