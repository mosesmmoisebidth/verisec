#!/usr/bin/env bash
# Local dev (WSL): stop and start BOTH scanning services in the background.
# Logs: ~/verisec_fin_data/{micr,card}.log
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="${FIN_LOG_DIR:-$HOME/verisec_fin_data}"
mkdir -p "$LOGS"
pkill -f "uvicorn app:app --host .* --port ${MICR_PORT:-8061}" 2>/dev/null
pkill -f "uvicorn app:app --host .* --port ${CARD_PORT:-8062}" 2>/dev/null
sleep 1
setsid nohup bash "$HERE/micr/run.sh" > "$LOGS/micr.log" 2>&1 < /dev/null &
setsid nohup bash "$HERE/card/run.sh" > "$LOGS/card.log" 2>&1 < /dev/null &
sleep 2
echo "MICR API :${MICR_PORT:-8061}  Card API :${CARD_PORT:-8062}  (logs in $LOGS)"
