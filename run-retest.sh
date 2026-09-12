#!/bin/bash
BASE=http://localhost:4000

test_conversion() {
  local file=$1
  local source_ext=$2
  local target_ext=$3
  local label=$4
  echo "=== [$label] Testing $(basename $file): ${source_ext} -> ${target_ext} ==="

  UPLOAD=$(curl -s -F "file=@${file}" "${BASE}/upload")
  FILE_ID=$(echo $UPLOAD | grep -o '"fileId":"[^"]*' | cut -d'"' -f4)

  CONVERT=$(curl -s -X POST "${BASE}/convert" \
    -H "Content-Type: application/json" \
    -d "{\"fileId\":\"${FILE_ID}\",\"sourceExt\":\"${source_ext}\",\"targetExt\":\"${target_ext}\"}")
  JOB_ID=$(echo $CONVERT | grep -o '"jobId":"[^"]*' | cut -d'"' -f4)

  echo "jobId: $JOB_ID -- polling every 5s (gentler on rate limit)..."
  STATUS="processing"
  ATTEMPTS=0
  while [ "$STATUS" != "done" ] && [ "$STATUS" != "failed" ] && [ $ATTEMPTS -lt 24 ]; do
    sleep 5
    JOB=$(curl -s "${BASE}/job/${JOB_ID}")
    STATUS=$(echo $JOB | grep -o '"status":"[^"]*' | cut -d'"' -f4)
    ATTEMPTS=$((ATTEMPTS + 1))
  done

  echo "Final status: $STATUS"
  echo "Job detail: $JOB"
  PEAK_MEM=$(docker stats converthub --no-stream --format '{{.MemUsage}}')
  echo "Mem at check: $PEAK_MEM"
  echo ""
  echo "--- Cooling down 65s to reset rate limit window before next test ---"
  sleep 65
}

# Run docx->pdf and pptx->pdf THREE times each to check if failure is consistent
# or just a cold-start fluke. ipynb->docx run cleanly once, isolated.
test_conversion "test-fixtures/sample.docx" "docx" "pdf" "docx-pdf run 1"
test_conversion "test-fixtures/sample.docx" "docx" "pdf" "docx-pdf run 2"
test_conversion "test-fixtures/sample.pptx" "pptx" "pdf" "pptx-pdf run 1"
test_conversion "test-fixtures/sample.pptx" "pptx" "pdf" "pptx-pdf run 2"
test_conversion "test-fixtures/sample.ipynb" "ipynb" "docx" "ipynb-docx isolated"
