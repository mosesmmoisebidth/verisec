#!/usr/bin/env bash
# Compile the binlookup pybind11 module against the scanning venv's Python.
set -euo pipefail
cd "$(dirname "$0")"
VENV="${FIN_VENV:-$HOME/verisec_fin_venv}"
PY="$VENV/bin/python"
INCLUDES=$("$PY" -m pybind11 --includes)
EXT=$("$PY" -c "import sysconfig; print(sysconfig.get_config_var('EXT_SUFFIX'))")
echo "building binlookup${EXT} ..."
g++ -O3 -march=native -funroll-loops -std=c++17 -shared -fPIC -fvisibility=hidden \
    ${INCLUDES} binlookup.cpp -o "binlookup${EXT}"
echo "built: binlookup${EXT}"
"$PY" -c "import sys; sys.path.insert(0,'.'); import binlookup; print('import OK; has build/Index:', hasattr(binlookup,'build'), hasattr(binlookup,'Index'))"
