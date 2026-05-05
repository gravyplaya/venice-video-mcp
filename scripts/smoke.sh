#!/usr/bin/env bash
# Smoke test against the live venice-video-harness checkout.
# Usage: HARNESS_PATH=/abs/harness ./scripts/smoke.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${HARNESS_PATH:?Set HARNESS_PATH to the harness repo}"
: "${HARNESS_WORKSPACE:=$HARNESS_PATH}"

echo "== smoke test =="
echo "harness: $HARNESS_PATH"
echo "workspace: $HARNESS_WORKSPACE"
echo

run_call() {
  local id="$1"
  local name="$2"
  local args_json="$3"
  cat <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":${id},"method":"tools/call","params":{"name":"${name}","arguments":${args_json}}}
EOF
}

call() {
  local id="$1"
  local name="$2"
  local args_json="$3"
  echo "-- $name $args_json --"
  run_call "$id" "$name" "$args_json" \
    | HARNESS_PATH="$HARNESS_PATH" HARNESS_WORKSPACE="$HARNESS_WORKSPACE" \
      node "$REPO_ROOT/bin/venice-video-mcp.js" 2>/dev/null \
    | python3 -c "
import sys, json
for line in sys.stdin:
    line=line.strip()
    if not line or not line.startswith('{'): continue
    obj=json.loads(line)
    if obj.get('id') != $id: continue
    if 'result' in obj and 'content' in obj['result']:
        for c in obj['result']['content']:
            if c.get('type')=='text':
                payload=json.loads(c['text'])
                print(json.dumps(payload, indent=2)[:1500])
" || true
  echo
}

call 10 inspect '{"action":"list"}'
call 11 inspect '{"action":"series","project":"the-audacity"}'
call 12 inspect '{"action":"episode","project":"the-audacity","episode":1}'
call 13 inspect '{"action":"shot","project":"the-audacity","episode":1,"shot":1}'
call 14 inspect '{"action":"models","category":"video"}'

echo "== dry-run media.validate (no Venice calls) =="
call 20 media '{"action":"validate","project":"the-audacity","episode":1,"videoOutputs":true}'

echo "== smoke complete =="
