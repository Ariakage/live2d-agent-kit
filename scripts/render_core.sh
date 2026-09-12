#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ $# -eq 0 || "${1:-}" == --help || "${1:-}" == -h ]]; then
  cat <<'USAGE'
Usage:
  bash scripts/render_core.sh MODEL.model3.json OUTPUT.png [OPTIONS]
  bash scripts/render_core.sh MODEL.moc3 OUTPUT.png ATLAS0.png [ATLAS1.png ...] [OPTIONS]
Options: --size N --margin N --background '#RRGGBB' --set ParameterId=value,...
         --demo-dir NEW_DIRECTORY --frames 60
Requires Java 21 and CUBISM_CORE_DIR containing a separately obtained local
Live2DCubismCore.jar plus its matching native library. VALIDATOR_JAVA overrides java.
This is an approximate Java2D diagnostic, not the official Cubism renderer.
USAGE
  [[ $# -gt 0 ]] && exit 0 || exit 2
fi
: "${CUBISM_CORE_DIR:?Set CUBISM_CORE_DIR to your local Core Java/native library directory}"
[[ -f "$CUBISM_CORE_DIR/Live2DCubismCore.jar" ]] || { echo 'CUBISM_CORE_DIR does not contain Live2DCubismCore.jar' >&2; exit 2; }
if [[ "$1" == *.model3.json ]]; then
  [[ $# -ge 2 ]] || { echo 'Model3 input requires an output PNG path.' >&2; exit 2; }
  # Use Python only to decode the Model3 file list. Keep paths as argv entries,
  # including whitespace, and do not load/evaluate any model-provided code.
  exec python3 - "$SCRIPT_DIR" "$@" <<'PY'
import json, os, pathlib, subprocess, sys
script_dir=pathlib.Path(sys.argv[1]); model_path=pathlib.Path(sys.argv[2]).resolve()
sys.path.insert(0,str(script_dir))
from validate import safe_reference
try:
    data=json.loads(model_path.read_text(encoding='utf-8-sig'))
    if data.get('Version') != 3: raise ValueError('Expected Model3 Version 3')
    refs=data['FileReferences']; root=model_path.parent
    moc=safe_reference(root,refs['Moc'])
    pages=refs['Textures']
    if not isinstance(pages,list) or not pages: raise ValueError('Textures must be a nonempty list')
    textures=[str(safe_reference(root,page)) for page in pages]
    output=pathlib.Path(sys.argv[3]).resolve()
    if output in {model_path,moc,*map(pathlib.Path,textures)}: raise ValueError('Output would overwrite a model input')
    command=['bash',str(script_dir/'render_core.sh'),str(moc),str(output),*textures,*sys.argv[4:]]
    raise SystemExit(subprocess.call(command))
except (OSError,ValueError,KeyError,TypeError) as error:
    print(f'Render input error: {error}',file=sys.stderr)
    raise SystemExit(2)
PY
fi
exec "${VALIDATOR_JAVA:-java}" -Xmx2g -Djava.awt.headless=true -Djava.library.path="$CUBISM_CORE_DIR" \
  --class-path "$CUBISM_CORE_DIR/Live2DCubismCore.jar" --source 21 \
  "$SCRIPT_DIR/render_core.java" "$@"
