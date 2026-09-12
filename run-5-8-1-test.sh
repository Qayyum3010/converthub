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

# doc as source
test_conversion "test-fixtures/sample.doc" "doc" "pdf"
test_conversion "test-fixtures/sample.doc" "doc" "docx"
test_conversion "test-fixtures/sample.doc" "doc" "odt"
test_conversion "test-fixtures/sample.doc" "doc" "html"
test_conversion "test-fixtures/sample.doc" "doc" "txt"

# docx as source (new targets)
test_conversion "test-fixtures/sample.docx" "docx" "doc"
test_conversion "test-fixtures/sample.docx" "docx" "odt"
test_conversion "test-fixtures/sample.docx" "docx" "rtf"

# odt as source
test_conversion "test-fixtures/sample.odt" "odt" "docx"
test_conversion "test-fixtures/sample.odt" "odt" "doc"
test_conversion "test-fixtures/sample.odt" "odt" "pdf"
test_conversion "test-fixtures/sample.odt" "odt" "txt"

# rtf as source
test_conversion "test-fixtures/sample.rtf" "rtf" "pdf"
test_conversion "test-fixtures/sample.rtf" "rtf" "html"
test_conversion "test-fixtures/sample.rtf" "rtf" "odt"

# md as source (new targets)
test_conversion "test-fixtures/sample.md" "md" "rtf"
test_conversion "test-fixtures/sample.md" "md" "odt"

# html as source (new targets)
test_conversion "test-fixtures/sample.html" "html" "docx"
test_conversion "test-fixtures/sample.html" "html" "odt"

echo "=== All 5.8.1 tests complete ==="
