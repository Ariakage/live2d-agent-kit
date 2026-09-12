#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo 'Usage: CUBISM_CORE_DIR=/your/local/core bash scripts/validate_core.sh MODEL.moc3 [REPORT.json]' >&2; exit 2
fi
: "${CUBISM_CORE_DIR:?Set CUBISM_CORE_DIR to your legitimately obtained Core Java/native library directory}"
[[ -f "$CUBISM_CORE_DIR/Live2DCubismCore.jar" ]] || { echo 'Live2DCubismCore.jar is missing' >&2; exit 2; }
exec "${VALIDATOR_JAVA:-java}" -Djava.library.path="$CUBISM_CORE_DIR" \
  --class-path "$CUBISM_CORE_DIR/Live2DCubismCore.jar" --source 21 \
  "$SCRIPT_DIR/validate_core.java" "$@"
