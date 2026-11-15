#!/usr/bin/env bash
# Start the MICR API (Linux / WSL). Default port 8061.
#   DOUBANGO_TF_DIR  Doubango's TensorFlow r1.14 (default ~/doubango_tf)
#   MICR_SDK_DIR     the MICR SDK folder (default <repo>/ultimateMICR-SDK)
#   MICR_DATA_DIR    scans + images (default ~/verisec_fin_data/micr)
set -euo pipefail
cd "$(dirname "$0")"
VENV="${FIN_VENV:-$HOME/verisec_fin_venv}"
[ -x "$VENV/bin/python" ] || bash ../scanning_common/setup_venv.sh
# Local secrets/config (cheque reader URL+key, banks DB path, ...), if present.
[ -f "$HOME/verisec_fin_data/fin.env" ] && { set -a; . "$HOME/verisec_fin_data/fin.env"; set +a; }
exec "$VENV/bin/python" -m uvicorn app:app --host "${HOST:-0.0.0.0}" --port "${MICR_PORT:-8061}"
