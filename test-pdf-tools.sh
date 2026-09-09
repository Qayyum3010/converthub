#!/usr/bin/env bash
# test-pdf-tools.sh
# Standalone re-run of the "PDF Tools sweep" step from full-registry-test.sh,
# isolated from the 219-pair full registry sweep it normally runs after.
#
# Why this exists: the 2026-09-06 full sweep's PDF Tools section reported 3
# failures (merge, analyze, compare) — but all 3 were artifacts of running
# at the tail end of ~200+ prior requests against the 20-req/min rate
# limiter, not real backend bugs (confirmed: Task 6's isolated 9/2 testing
# already verified all 5 /pdf/* endpoints cleanly). This script:
#   1. Runs PDF Tools checks completely on their own, so the limiter starts
#      fresh and isn't already saturated.
#   2. Fixes the actual test-script gap that caused the confusing failures:
#      the job-status polling loop now detects a 429 on the /job/:jobId GET
#      itself (not just on the initial POST) and backs off + retries,
#      instead of treating a rate-limited poll response as "job status".
#
# Requires: server running and reachable at $BASE, test-fixtures/master/
# already populated (via build-fixtures.sh) with at least base.pdf.
set -uo pipefail

BASE="${BASE:-http://localhost:4000}"
CONTAINER="${CONTAINER:-converthub}"
FIXDIR="./test-fixtures/master"
RESULTS="./pdf-tools-results.log"
MARKER="CHMARKER_$(date +%s)"

: > "$RESULTS"
PASS=0
FAIL=0
SKIP=0
declare -a MANUAL_REVIEW=()

log() { echo "$@" | tee -a "$RESULTS"; }
pass() { PASS=$((PASS+1)); log "PASS  | $1"; }
fail() { FAIL=$((FAIL+1)); log "FAIL  | $1 | $2"; }
skip() { SKIP=$((SKIP+1)); log "SKIP  | $1 | $2"; }
manual() { MANUAL_REVIEW+=("$1 :: $2"); }

dexec() { docker exec "$CONTAINER" "$@"; }
dcp_out() { docker cp "$CONTAINER:$1" "$2"; }

jget() {
  local json="$1" key="$2"
  if command -v jq >/dev/null 2>&1; then
    echo "$json" | jq -r ".$key // empty" 2>/dev/null
  else
    echo "$json" | grep -o "\"$key\":\"[^\"]*" | head -1 | cut -d'"' -f4
  fi
}

# Same idea as bootstrap_convert's upload/convert retry loops, but for
# polling an existing job. THIS is the piece the original sweep script was
# missing — a rate-limited /job/:jobId GET was being treated as if it were
# a real (bad) job status, instead of being retried like every other 429
# in this codebase already is.
poll_job() {
  local jid="$1" tries=0 job status ra
  while [ $tries -lt 40 ]; do
    job=$(curl -s "${BASE}/job/${jid}")
    if echo "$job" | grep -qi "429\|too many requests"; then
      ra=$(jget "$job" retryAfter); [ -z "$ra" ] && ra=10
      log "rate limited polling job ${jid}, waiting ${ra}s"
      sleep "$((ra + 1))"
      continue
    fi
    status=$(jget "$job" status)
    if [ "$status" = "done" ] || [ "$status" = "failed" ]; then
      echo "$job"
      return 0
    fi
    sleep 2
    tries=$((tries+1))
  done
  echo "$job"
  return 1
}

post_with_retry() {
  # $1 = URL, $2 = JSON body
  local resp ra
  resp=$(curl -s -X POST "$1" -H "Content-Type: application/json" -d "$2")
  while echo "$resp" | grep -qi "429\|too many requests"; do
    ra=$(jget "$resp" retryAfter); [ -z "$ra" ] && ra=10
    log "rate limited on POST $1, waiting ${ra}s"
    sleep "$((ra + 1))"
    resp=$(curl -s -X POST "$1" -H "Content-Type: application/json" -d "$2")
  done
  echo "$resp"
}

upload_with_retry() {
  local resp ra
  resp=$(curl -s -F "file=@$1" "${BASE}/upload")
  while echo "$resp" | grep -qi "429\|too many requests"; do
    ra=$(jget "$resp" retryAfter); [ -z "$ra" ] && ra=10
    log "rate limited on upload $1, waiting ${ra}s"
    sleep "$((ra + 1))"
    resp=$(curl -s -F "file=@$1" "${BASE}/upload")
  done
  echo "$resp"
}

if [ ! -f "$FIXDIR/base.pdf" ]; then
  log "base.pdf not found in $FIXDIR — run build-fixtures.sh first."
  exit 1
fi

log "=== PDF Tools isolated verification ==="

cat > "$FIXDIR/base2.md" <<EOF
# Second Document ${MARKER}

Different content entirely, marker ${MARKER}-TWO.
EOF

# Bootstrap base2.pdf via a plain upload+convert, with retry-aware polling.
UPB2=$(upload_with_retry "$FIXDIR/base2.md")
FIDB2=$(jget "$UPB2" fileId)
CVB2=$(post_with_retry "${BASE}/convert" "{\"fileId\":\"${FIDB2}\",\"sourceExt\":\"md\",\"targetExt\":\"pdf\"}")
JIDB2=$(jget "$CVB2" jobId)
job=$(poll_job "$JIDB2")
status=$(jget "$job" status)
if [ "$status" = "done" ]; then
  outb2=$(echo "$job" | grep -o '"outputPath":"[^"]*' | cut -d'"' -f4)
  dcp_out "$outb2" "$FIXDIR/base2.pdf"
else
  log "Could not bootstrap base2.pdf: $job"
fi

if [ ! -f "$FIXDIR/base2.pdf" ]; then
  log "base2.pdf bootstrap failed — aborting PDF Tools checks."
  exit 1
fi

sleep 2
UP1=$(upload_with_retry "$FIXDIR/base.pdf")
sleep 2
UP2=$(upload_with_retry "$FIXDIR/base2.pdf")
PID1=$(jget "$UP1" fileId)
PID2=$(jget "$UP2" fileId)

# ---- merge ----
sleep 2
MJ=$(post_with_retry "${BASE}/pdf/merge" "{\"fileIds\":[\"${PID1}\",\"${PID2}\"]}")
MJID=$(jget "$MJ" jobId)
outp=""
if [ -n "$MJID" ]; then
  job=$(poll_job "$MJID")
  status=$(jget "$job" status)
  if [ "$status" = "done" ]; then
    outp=$(echo "$job" | grep -o '"outputPath":"[^"]*' | cut -d'"' -f4)
    pages=$(dexec qpdf --show-npages "$outp" 2>/dev/null)
    if [ "$pages" = "2" ]; then pass "PDF Tool: merge"; else fail "PDF Tool: merge" "expected 2 pages, got '$pages'"; fi
    manual "PDF Tool: merge" "Open the merged PDF visually: confirm page order matches upload order and no page is blank/corrupted."
  else
    fail "PDF Tool: merge" "job did not complete: $job"
  fi
else
  fail "PDF Tool: merge" "no jobId returned from POST: $MJ"
fi

# ---- split ----
if [ -n "$outp" ]; then
  dcp_out "$outp" "$FIXDIR/merged_for_split.pdf"
  sleep 2
  UPM=$(upload_with_retry "$FIXDIR/merged_for_split.pdf")
  MID=$(jget "$UPM" fileId)
  sleep 2
  SJ=$(post_with_retry "${BASE}/pdf/split" "{\"fileId\":\"${MID}\",\"pageRange\":\"1\"}")
  SJID=$(jget "$SJ" jobId)
  job=$(poll_job "$SJID")
  status=$(jget "$job" status)
  if [ "$status" = "done" ]; then
    outp2=$(echo "$job" | grep -o '"outputPath":"[^"]*' | cut -d'"' -f4)
    pages2=$(dexec qpdf --show-npages "$outp2" 2>/dev/null)
    if [ "$pages2" = "1" ]; then pass "PDF Tool: split"; else fail "PDF Tool: split" "expected 1 page, got '$pages2'"; fi
    manual "PDF Tool: split" "Open the split PDF: confirm it's page 1's actual content, not page 2's."
  else
    fail "PDF Tool: split" "job did not complete: $job"
  fi
else
  skip "PDF Tool: split" "no merged PDF available as input"
fi

# ---- compress ----
sleep 2
CJ=$(post_with_retry "${BASE}/pdf/compress" "{\"fileId\":\"${PID1}\"}")
CJID=$(jget "$CJ" jobId)
job=$(poll_job "$CJID")
status=$(jget "$job" status)
if [ "$status" = "done" ]; then
  outp3=$(echo "$job" | grep -o '"outputPath":"[^"]*' | cut -d'"' -f4)
  resultfid=$(jget "$job" fileId)
  if dexec test -f "$outp3" && echo "$outp3" | grep -q "$resultfid"; then
    pass "PDF Tool: compress"
  else
    fail "PDF Tool: compress" "outputPath ($outp3) does not match result.fileId ($resultfid), or file missing"
  fi
  manual "PDF Tool: compress" "Open the compressed PDF: confirm no visible quality loss beyond what's expected."
else
  fail "PDF Tool: compress" "job did not complete: $job"
fi

# ---- analyze ----
sleep 2
AJ=$(post_with_retry "${BASE}/pdf/analyze" "{\"fileId\":\"${PID1}\"}")
AJID=$(jget "$AJ" jobId)
job=$(poll_job "$AJID")
status=$(jget "$job" status)
# base.pdf is a pre-existing fixture from build-fixtures.sh, carrying
# whatever marker was baked in on ITS run — not this script's fresh
# $MARKER (that one only ever gets written into base2.pdf, used for
# merge/compare). Check for the CHMARKER_ prefix generically instead of an
# exact match, since the goal is just confirming real text extraction
# happened, not matching this specific run's timestamp.
if [ "$status" = "done" ] && echo "$job" | grep -q "CHMARKER_"; then
  pass "PDF Tool: analyze"
else
  fail "PDF Tool: analyze" "no CHMARKER_ marker found in extracted text, or job failed: $job"
fi

# ---- compare ----
sleep 2
CMJ=$(post_with_retry "${BASE}/pdf/compare" "{\"fileIdA\":\"${PID1}\",\"fileIdB\":\"${PID2}\"}")
CMJID=$(jget "$CMJ" jobId)
job=$(poll_job "$CMJID")
status=$(jget "$job" status)
if [ "$status" = "done" ] && echo "$job" | grep -q '"identical":false'; then
  pass "PDF Tool: compare"
else
  fail "PDF Tool: compare" "expected identical:false, got: $job"
fi

log ""
log "=============================================="
log "TOTAL: $((PASS+FAIL+SKIP))   PASS: $PASS   FAIL: $FAIL   SKIP: $SKIP"
log "=============================================="

if [ ${#MANUAL_REVIEW[@]} -gt 0 ]; then
  log ""
  log "=== MANUAL REVIEW NEEDED (${#MANUAL_REVIEW[@]} items) ==="
  for item in "${MANUAL_REVIEW[@]}"; do
    log "  - $item"
  done
fi

log ""
log "Full results written to $RESULTS"
