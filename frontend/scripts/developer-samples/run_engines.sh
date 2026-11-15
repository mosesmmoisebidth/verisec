#!/bin/sh
# Run each sample (ORIGINAL bytes, never resized) through the real engines:
#   PP-OCRv6_medium_det  -> every text box   (reader service :8070 /detect)
#   MICR / Card engines  -> focused reads that store nothing
set -u
cd /tmp/devsamples
PID=$(pgrep -f reader_service.py | head -1)
KEY=$(tr '\0' '\n' < /proc/$PID/environ | sed -n 's/^READER_KEY=//p')
PY=/root/paddle_venv/bin/python
for f in in/*; do
  id=$(basename "$f"); id="${id%.*}"
  curl -s -m 90 -F "image=@$f" -H "X-Reader-Key: $KEY" http://127.0.0.1:8070/detect > "out/$id.detect.json"
  case "$id" in
    cheque-*)
      curl -s -m 180 -F "image=@$f" -F format=auto -H "X-VeriSec-Source: sample" -H "X-VeriSec-Env: test" \
        http://172.18.0.1:8061/v2/cheques/micr-line > "out/$id.micr-line.json" ;;
    card-*)
      for ep in number expiry check; do
        curl -s -m 180 -F "image=@$f" -H "X-VeriSec-Source: sample" -H "X-VeriSec-Env: test" \
          http://172.18.0.1:8062/v2/cards/$ep > "out/$id.$ep.json"
      done ;;
  esac
  $PY - "$id" <<'EOF'
import json, sys, glob
i = sys.argv[1]
d = json.load(open(f"out/{i}.detect.json"))
print(f"{i}: {d.get('width')}x{d.get('height')} boxes={len(d.get('boxes', []))} det_ms={d.get('ms')}")
for p in sorted(glob.glob(f"out/{i}.*.json")):
    if p.endswith(".detect.json"): continue
    s = open(p).read()
    print("   ", p.split(".", 1)[1], "->", s[:300].replace("\n", " "))
EOF
done
