#!/usr/bin/env bash
# Start the Card API (Linux / WSL). Default port 8062.
#   DOUBANGO_TF_DIR  Doubango's TensorFlow r1.14 (default ~/doubango_tf)
#   CARD_SDK_DIR     the card SDK folder (default <repo>/ultimateCreditCard-SDK)
#   CARD_DATA_DIR    scans + BIN index (default ~/verisec_fin_data/card)
#   BIN_INDEX        which C++ index to serve (default $CARD_DATA_DIR/bins.binidx)
#   VERISEC_BIN_API  neutrino | bincodes to enable the online fallback (default off)
set -euo pipefail
cd "$(dirname "$0")"
VENV="${FIN_VENV:-$HOME/verisec_fin_venv}"
[ -x "$VENV/bin/python" ] || bash ../scanning_common/setup_venv.sh
# Optional secrets file so keys persist across restarts without editing scripts.
# Put NEUTRINO_USER_ID / NEUTRINO_API_KEY / VERISEC_BIN_API=neutrino in here:
ENVFILE="${FIN_ENV_FILE:-$HOME/verisec_fin_data/fin.env}"
if [ -f "$ENVFILE" ]; then set -a; . "$ENVFILE"; set +a; fi
# The in-process card engine (load-once): its Python binding, and Doubango's TF
# ahead of the SDK libraries.
CARD_SDK="${CARD_SDK_DIR:-$(cd ../../../.. && pwd)/ultimateCreditCard-SDK}"
export PYTHONPATH="$CARD_SDK/python:$CARD_SDK/binaries/linux/x86_64:${PYTHONPATH:-}"
export LD_LIBRARY_PATH="${DOUBANGO_TF_DIR:-$HOME/doubango_tf}:$CARD_SDK/binaries/linux/x86_64:${LD_LIBRARY_PATH:-}"
# The C++ BIN engine + index must exist. Build both on first run.
DATA="${CARD_DATA_DIR:-$HOME/verisec_fin_data/card}"
ls ../bin_engine/binlookup*.so >/dev/null 2>&1 || bash ../bin_engine/build.sh
[ -f "${BIN_INDEX:-$DATA/bins.binidx}" ] || bash ../bin_engine/rebuild.sh
exec "$VENV/bin/python" -m uvicorn app:app --host "${HOST:-0.0.0.0}" --port "${CARD_PORT:-8062}"
