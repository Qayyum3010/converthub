#!/bin/bash
BASE="http://localhost:4000"
SRC_DIR="/mnt/c/Projects/converthub/verify-run-20260904-082823/sources"
OUT_DIR="/mnt/c/Projects/converthub/VERIFY_ME/archives"
FORMATS="zip 7z tar gz bz2 xz"
CONTAINER=$(docker ps --filter ancestor=converthub-server --format '{{.ID}}' | head -1)
echo "Using container: $CONTAINER"

run_pair() {
  local from="$1" to="$2"
  local src="${SRC_DIR}/source.${from}"
  local label="${from}_to_${to}"
  echo "== ${label} =="

  upload_resp=$(curl -s -F "file=@${src}" "${BASE}/upload")
  fid=$(echo "$upload_resp" | grep -o '"fileId":"[^"]*"' | cut -d'"' -f4)
  if [ -z "$fid" ]; then
    echo "  UPLOAD FAILED: $upload_resp"
    return
  fi

  convert_resp=$(curl -s -X POST "${BASE}/convert" -H "Content-Type: application/json" \
    -d "{\"fileId\":\"${fid}\",\"sourceExt\":\"${from}\",\"targetExt\":\"${to}\"}")
  jid=$(echo "$convert_resp" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
  if [ -z "$jid" ]; then
    echo "  CONVERT FAILED: $convert_resp"
    return
  fi

  st=""
  for i in $(seq 1 20); do
    sleep 2
    job_resp=$(curl -s "${BASE}/job/${jid}")
    st=$(echo "$job_resp" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    [ "$st" = "done" ] && break
    [ "$st" = "failed" ] && { echo "  JOB FAILED BODY: $job_resp"; break; }
  done
  echo "  status: $st"
  [ "$st" != "done" ] && return

  curl -s -o "${OUT_DIR}/${label}.${to}" "${BASE}/download/${jid}"

  docker exec "$CONTAINER" mkdir -p "/tmp/check_${label}"
  docker cp "${OUT_DIR}/${label}.${to}" "${CONTAINER}:/tmp/check_${label}/"
  docker exec "$CONTAINER" sh -c "cd /tmp/check_${label} && 7z x ${label}.${to} -y -o/tmp/check_${label}/extracted >/dev/null 2>&1"
  echo "  contents: $(docker exec "$CONTAINER" ls /tmp/check_${label}/extracted)"
}

for from in $FORMATS; do
  for to in $FORMATS; do
    [ "$from" = "$to" ] && continue
    run_pair "$from" "$to"
    sleep 5
  done
done