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

  STATUS="processing"
  ATTEMPTS=0
  while [ "$STATUS" != "done" ] && [ "$STATUS" != "failed" ] && [ $ATTEMPTS -lt 15 ]; do
    sleep 2
    JOB=$(curl -s "${BASE}/job/${JOB_ID}")
    STATUS=$(echo $JOB | grep -o '"status":"[^"]*' | cut -d'"' -f4)
    ATTEMPTS=$((ATTEMPTS + 1))
  done

  echo "Result: $STATUS"
  if [ "$STATUS" != "done" ]; then
    echo "Detail: $JOB"
  fi
  echo ""
  sleep 4
}

test_conversion "test-fixtures/sample-image.heic" "heic" "jpg"
test_conversion "test-fixtures/sample-image.heic" "heic" "png"
test_conversion "test-fixtures/sample-image.jpg" "jpg" "heic"
test_conversion "test-fixtures/sample-image.png" "png" "heic"

echo "=== All 5.9.4 tests complete ==="
