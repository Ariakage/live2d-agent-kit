#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
KIT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[[ $# -eq 2 ]] || { echo 'Usage: bash scripts/extract-psd.sh INPUT.psd NEW_OUTPUT_DIRECTORY' >&2; exit 2; }
SOURCE_PSD="$(python3 -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).resolve())' "$1")"
EXTRACT_OUTPUT="$(python3 -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).resolve())' "$2")"
if [[ -e "$EXTRACT_OUTPUT" ]] && [[ -n "$(ls -A "$EXTRACT_OUTPUT")" ]]; then
  echo 'Extraction output is nonempty; use a new directory.' >&2; exit 2
fi
cd "${PSD2LIVE_DIR:-$KIT_ROOT/.cache/psd2live}"
exec bash ./gradlew --no-daemon --console=plain --init-script "$SCRIPT_DIR/psd2live-init.gradle" \
  extractPsdManifest "-PagentKitIntegrationDir=$KIT_ROOT/integrations/psd2live" \
  "-PsourcePsd=$SOURCE_PSD" "-PfixtureOutput=$EXTRACT_OUTPUT"
