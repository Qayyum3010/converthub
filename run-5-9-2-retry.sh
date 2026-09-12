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

  sleep 1
  JOB=$(curl -s "${BASE}/job/${JOB_ID}")
  STATUS=$(echo $JOB | grep -o '"status":"[^"]*' | cut -d'"' -f4)

  echo "Result: $STATUS"
  if [ "$STATUS" != "done" ]; then
    echo "Detail: $JOB"
  fi
  echo ""
  sleep 10
}

test_conversion "test-fixtures/sample-image.png" "png" "webp"
test_conversion "test-fixtures/sample-image.png" "png" "gif"
test_conversion "test-fixtures/sample-image.png" "png" "tiff"
test_conversion "test-fixtures/sample-image.png" "png" "avif"
test_conversion "test-fixtures/sample-image.webp" "webp" "jpg"
test_conversion "test-fixtures/sample-image.webp" "webp" "png"
test_conversion "test-fixtures/sample-image.webp" "webp" "gif"
test_conversion "test-fixtures/sample-image.webp" "webp" "tiff"
test_conversion "test-fixtures/sample-image.webp" "webp" "avif"
test_conversion "test-fixtures/sample-image.gif" "gif" "jpg"
test_conversion "test-fixtures/sample-image.gif" "gif" "png"
test_conversion "test-fixtures/sample-image.gif" "gif" "webp"
test_conversion "test-fixtures/sample-image.gif" "gif" "tiff"
test_conversion "test-fixtures/sample-image.gif" "gif" "avif"
test_conversion "test-fixtures/sample-image.tiff" "tiff" "jpg"
test_conversion "test-fixtures/sample-image.tiff" "tiff" "png"
test_conversion "test-fixtures/sample-image.tiff" "tiff" "webp"
test_conversion "test-fixtures/sample-image.tiff" "tiff" "gif"
test_conversion "test-fixtures/sample-image.tiff" "tiff" "avif"
test_conversion "test-fixtures/sample-image.avif" "avif" "jpg"
test_conversion "test-fixtures/sample-image.avif" "avif" "png"
test_conversion "test-fixtures/sample-image.avif" "avif" "webp"
test_conversion "test-fixtures/sample-image.avif" "avif" "gif"
test_conversion "test-fixtures/sample-image.avif" "avif" "tiff"

echo "=== Retry complete ==="
