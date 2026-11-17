#!/usr/bin/env bash
# Waits until a URL answers with a success status. Fails (exit 1, with the reason and the tail of
# the server log) when it never does or when the server process died meanwhile (grill T6: a
# silent timeout let the integration tests run against a dead server).
#
# Usage: wait-for-server.sh URL [PID] [LOG_FILE]
# Environment: WAIT_ATTEMPTS (default 60), WAIT_DELAY (seconds between attempts, default 1).
set -uo pipefail
url=${1:?usage: wait-for-server.sh URL [PID] [LOG_FILE]}
pid=${2:-}
log=${3:-}
attempts=${WAIT_ATTEMPTS:-60}
delay=${WAIT_DELAY:-1}

fail() {
  echo "wait-for-server: $1" >&2
  if [ -n "$log" ] && [ -f "$log" ]; then
    echo "--- last lines of $log ---" >&2
    tail -n 40 "$log" >&2
  fi
  exit 1
}

for _ in $(seq 1 "$attempts"); do
  curl -sf -o /dev/null --max-time 5 "$url" && exit 0
  if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
    fail "the server process ($pid) exited before $url answered"
  fi
  sleep "$delay"
done
fail "$url did not answer after $attempts attempts"
