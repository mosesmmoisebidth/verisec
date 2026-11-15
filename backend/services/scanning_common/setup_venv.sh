#!/usr/bin/env bash
# One virtualenv for both scanning services (Linux / WSL). Kept in $HOME,
# not under /mnt/c, because a venv on the Windows mount is slow to import.
set -euo pipefail
VENV="${FIN_VENV:-$HOME/verisec_fin_venv}"
python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q -r "$(dirname "$0")/requirements.txt"
echo "venv ready: $VENV"
