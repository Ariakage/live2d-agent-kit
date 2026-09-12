#!/usr/bin/env bash
# Read-only environment inventory. Optional tools are not installed by this script.
set -uo pipefail
for command_name in git python3 java node; do
  if command -v "$command_name" >/dev/null 2>&1; then
    command -v "$command_name"
  else
    echo "Missing: $command_name"
  fi
done
java -version 2>&1 || true
python3 --version 2>&1 || true
echo "PSD2LIVE_DIR=${PSD2LIVE_DIR:-.cache/psd2live (kit default)}"
echo "CUBISM_CORE_DIR=${CUBISM_CORE_DIR:-not configured (native validation unavailable)}"
echo 'Need JDK 21 for the tested exporter, Python >=3.10, Git. Node/Playwright are for web QA.'
echo 'Upscayl binary, NCNN weights and SDKs are supplied separately; see docs/setup.md.'
