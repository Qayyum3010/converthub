#!/bin/bash
BASE=http://localhost:4000

test_conversion() {
  local file=$1
  local source_ext=$2
  local target_ext=$3
  echo "=== Testing $(basename $file): ${source_ext} -> ${target_ext} ==="

  UPLOAD=$(curl -s -F "file=@${file}" "${BASE}/upload")
  FILE_ID=$(echo $UPLOAD | grep -o '"fileId":"[^"]*' | cut -d'"' -f4)

  if [ -z "$FILE_ID" ]; then
    echo "Upload failed: $UPLOAD"
    echo ""
    return
  fi

  CONVERT=$(curl -s -X POST "${BASE}/convert" \
    -H "Content-Type: application/json" \
    -d "{\"fileId\":\"${FILE_ID}\",\"sourceExt\":\"${source_ext}\",\"targetExt\":\"${target_ext}\"}")

  JOB_ID=$(echo $CONVERT | grep -o '"jobId":"[^"]*' | cut -d'"' -f4)

  if [ -z "$JOB_ID" ]; then
    echo "Convert call failed: $CONVERT"
    echo ""
    return
  fi

  echo "jobId: $JOB_ID -- polling for completion..."

  STATUS="processing"
  ATTEMPTS=0
  while [ "$STATUS" != "done" ] && [ "$STATUS" != "failed" ] && [ $ATTEMPTS -lt 30 ]; do
    sleep 2
    JOB=$(curl -s "${BASE}/job/${JOB_ID}")
    STATUS=$(echo $JOB | grep -o '"status":"[^"]*' | cut -d'"' -f4)
    ATTEMPTS=$((ATTEMPTS + 1))
  done

  echo "Final status: $STATUS (after ${ATTEMPTS} polls)"
  echo "Job detail: $JOB"

  OOM=$(docker inspect converthub --format='{{.State.OOMKilled}}')
  RUNNING=$(docker inspect converthub --format='{{.State.Running}}')
  PEAK_MEM=$(docker stats converthub --no-stream --format '{{.MemUsage}}')
  echo "OOMKilled: $OOM | Still running: $RUNNING | Mem at check: $PEAK_MEM"
  echo ""

  if [ "$RUNNING" != "true" ]; then
    echo "!!! Container died. Restarting for next test. !!!"
    docker start converthub
    sleep 3
  fi
}

test_conversion "test-fixtures/sample.docx" "docx" "pdf"
test_conversion "test-fixtures/sample.tex" "tex" "pdf"
test_conversion "test-fixtures/sample.pdf" "pdf" "docx"
test_conversion "test-fixtures/sample.ipynb" "ipynb" "docx"
test_conversion "test-fixtures/sample.zip" "zip" "tar.gz"
test_conversion "test-fixtures/sample.pptx" "pptx" "pdf"

echo "=== Full memory log ==="
docker stats converthub --no-stream
