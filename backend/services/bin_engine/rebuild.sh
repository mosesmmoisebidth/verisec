#!/usr/bin/env bash
# Re-merge every local BIN source and rebuild the indexes. Run after updating a
# dataset, or after folding the learned overlay back in. Safe to run anytime;
# the Card service picks up the new file on its next restart.
set -euo pipefail
cd "$(dirname "$0")"
VENV="${FIN_VENV:-$HOME/verisec_fin_venv}"
PY="$VENV/bin/python"
BS="${VERISEC_REPO:-/mnt/c/Users/Moses/Videos/RE_Hackathon_task}/BIN_Sourcing"
DATA="${CARD_DATA_DIR:-$HOME/verisec_fin_data/card}"
mkdir -p "$DATA"

[ -f "binlookup"*.so ] 2>/dev/null || bash ./build.sh

"$PY" merge_sources.py --out "$BS/aggregate/bin_normalized.csv"
"$PY" merge_sources.py --cc-by-only --out "$BS/aggregate/bin_normalized_ccby.csv"
"$PY" - <<PY
import sys; sys.path.insert(0, ".")
import binlookup
print("full:", binlookup.build("$BS/aggregate/bin_normalized.csv", "$DATA/bins.binidx"))
print("ccby:", binlookup.build("$BS/aggregate/bin_normalized_ccby.csv", "$DATA/bins_ccby.binidx"))
PY
echo "indexes rebuilt in $DATA"
