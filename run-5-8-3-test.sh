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
  while [ "$STATUS" != "done" ] && [ "$STATUS" != "failed" ] && [ $ATTEMPTS -lt 24 ]; do
    sleep 3
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

# ppt as source
test_conversion "test-fixtures/sample.ppt" "ppt" "pptx"
test_conversion "test-fixtures/sample.ppt" "ppt" "odp"
test_conversion "test-fixtures/sample.ppt" "ppt" "pdf"

# pptx as source
test_conversion "test-fixtures/sample.pptx" "pptx" "ppt"

# odp as source
test_conversion "test-fixtures/sample.odp" "odp" "pptx"
test_conversion "test-fixtures/sample.odp" "odp" "ppt"
test_conversion "test-fixtures/sample.odp" "odp" "pdf"

# md as source (native Pandoc PPTX writer)
test_conversion "test-fixtures/sample.md" "md" "pptx"

# svg as source
test_conversion "test-fixtures/sample.svg" "svg" "pdf"

# bib as source (new xml path)
test_conversion "test-fixtures/sample.bib" "bib" "xml"

echo "=== All 5.8.3 tests complete ==="
