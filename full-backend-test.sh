#!/bin/bash
# full-backend-test.sh — exhaustive backend conversion matrix test.
# Respects the server's rate limiter: every HTTP call auto-retries on
# 429 using the server's own retryAfter value.

set -uo pipefail

BASE="http://localhost:4000"
CONTAINER="converthub-server-run"
OUTDIR="full-backend-test-$(date +%Y%m%d-%H%M%S)"
SRCDIR="$OUTDIR/sources"
mkdir -p "$SRCDIR" "$OUTDIR/outputs"
RESULTS_LOG="$OUTDIR/RESULTS.md"
> "$RESULTS_LOG"

MANUAL_OPEN_FILES=()

log() { echo -e "$1" | tee -a "$RESULTS_LOG"; }

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "ERROR: container '$CONTAINER' is not running. Start it first."
  exit 1
fi

log "# Full Backend Conversion Test — $(date)"

# ------------------------------------------------------------
# Retry-aware request helpers. Every call to the API goes through
# these so a 429 never kills the run — it just waits and retries.
# ------------------------------------------------------------
curl_json_retry() {
  # $@ = full curl args (should include -s already)
  local resp retry_after
  while true; do
    resp=$(curl -s "$@")
    if echo "$resp" | grep -q '"statusCode":429'; then
      retry_after=$(echo "$resp" | grep -o '"retryAfter":[0-9]*' | grep -o '[0-9]*')
      [ -z "$retry_after" ] && retry_after=10
      log "  (rate limited — waiting ${retry_after}s)"
      sleep "$((retry_after + 1))"
      continue
    fi
    echo "$resp"
    return
  done
}

curl_download_retry() {
  # $1 = output path, rest = curl args for the GET
  local out="$1"; shift
  local retry_after
  while true; do
    curl -s -o "$out" "$@"
    if grep -q '"statusCode":429' "$out" 2>/dev/null; then
      retry_after=$(grep -o '"retryAfter":[0-9]*' "$out" | grep -o '[0-9]*')
      [ -z "$retry_after" ] && retry_after=10
      log "  (rate limited on download — waiting ${retry_after}s)"
      sleep "$((retry_after + 1))"
      continue
    fi
    return
  done
}

# ============================================================
# 1. GENERATE SOURCE FIXTURES (unchanged from before)
# ============================================================
log "\n## Generating source fixtures"

cat > "$SRCDIR/source.md" <<'EOF'
# Full Backend Test Document

This is a **backend format-matrix test**. It has *italic* text, a list:

- Item one
- Item two
- Item three

## Section Two

Some more content here for a complete conversion test.
EOF

cat > "$SRCDIR/source.html" <<'EOF'
<!DOCTYPE html>
<html><head><title>Test</title></head>
<body>
<h1>Full Backend Test Document</h1>
<p>This is a <b>backend format-matrix test</b>.</p>
<ul><li>Item one</li><li>Item two</li></ul>
</body></html>
EOF

cat > "$SRCDIR/source.adoc" <<'EOF'
= Full Backend Test Document

This is a *backend format-matrix test*.

== Section Two

Some more content.
EOF

cat > "$SRCDIR/source.rst" <<'EOF'
Full Backend Test Document
===========================

This is a **backend format-matrix test**.

Section Two
-----------

Some more content.
EOF

cat > "$SRCDIR/source.csv" <<'EOF'
name,age,city
Alice,30,London
Bob,25,Paris
EOF

cat > "$SRCDIR/source.json" <<'EOF'
{"name":"Alice","age":30,"city":"London"}
EOF

cat > "$SRCDIR/source.yaml" <<'EOF'
name: Alice
age: 30
city: London
EOF

cat > "$SRCDIR/source.xml" <<'EOF'
<?xml version="1.0"?>
<person><name>Alice</name><age>30</age><city>London</city></person>
EOF

cat > "$SRCDIR/source.toml" <<'EOF'
name = "Alice"
age = 30
city = "London"
EOF

cat > "$SRCDIR/source.tex" <<'EOF'
\documentclass{article}
\title{Full Backend Test}
\begin{document}
\maketitle
\section{Introduction}
This is a test paragraph with \textbf{bold} and \textit{italic} text.
\end{document}
EOF

cat > "$SRCDIR/source.bib" <<'EOF'
@article{test2026,
  title={A Test Article},
  author={Doe, Jane},
  journal={Journal of Testing},
  year={2026}
}
EOF

cat > "$SRCDIR/source.ipynb" <<'EOF'
{
 "cells": [
  {"cell_type": "markdown", "metadata": {}, "source": ["# Test Notebook"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["print('hello')"]}
 ],
 "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python", "version": "3.11.2"}},
 "nbformat": 4,
 "nbformat_minor": 5
}
EOF

log "Plain-text sources created."

docker cp "$SRCDIR/source.md" "${CONTAINER}:/tmp/source.md"
docker cp "$SRCDIR/source.csv" "${CONTAINER}:/tmp/source.csv"

docker exec -i "$CONTAINER" bash -c '
  set -e
  cd /tmp
  pandoc source.md -t rtf -o source.rtf
  pandoc source.md -t odt -o source.odt
  pandoc source.md -t docx -o source.docx
  pandoc source.md -t pptx -o source.pptx
  pandoc source.md -o source.pdf
  soffice --headless --convert-to xlsx source.csv --outdir /tmp
  echo "archive test content" > /tmp/archive-content.txt
  7z a -tzip   /tmp/source.zip /tmp/archive-content.txt
  7z a -t7z    /tmp/source.7z  /tmp/archive-content.txt
  7z a -ttar   /tmp/source.tar /tmp/archive-content.txt
  7z a -tgzip  /tmp/source.gz  /tmp/archive-content.txt
  7z a -tbzip2 /tmp/source.bz2 /tmp/archive-content.txt
  7z a -txz    /tmp/source.xz  /tmp/archive-content.txt
' 2>&1 | tee -a "$RESULTS_LOG"

for f in rtf odt docx pptx pdf xlsx zip 7z tar gz bz2 xz; do
  docker cp "${CONTAINER}:/tmp/source.${f}" "$SRCDIR/source.${f}" 2>/dev/null \
    || log "WARNING: failed to generate/copy source.${f}"
done

log "Binary/archive sources generated.\n"

# ============================================================
# 2. TEST RUNNER (now rate-limit aware)
# ============================================================
run_pair() {
  local src_file="$1" source_ext="$2" target_ext="$3"
  local label="${source_ext}_to_${target_ext}"

  log "\n## ${source_ext} -> ${target_ext}"

  if [ ! -f "$src_file" ] || [ ! -s "$src_file" ]; then
    log "SKIPPED — source file missing/empty: $src_file"
    return
  fi

  local upload_resp file_id
  upload_resp=$(curl_json_retry -F "file=@${src_file}" "${BASE}/upload")
  file_id=$(echo "$upload_resp" | grep -o '"fileId":"[^"]*"' | cut -d'"' -f4)
  if [ -z "$file_id" ]; then
    log "UPLOAD FAILED: $upload_resp"
    return
  fi

  local convert_resp job_id
  convert_resp=$(curl_json_retry -X POST "${BASE}/convert" -H "Content-Type: application/json" \
    -d "{\"fileId\":\"$file_id\",\"sourceExt\":\"$source_ext\",\"targetExt\":\"$target_ext\"}")
  job_id=$(echo "$convert_resp" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
  if [ -z "$job_id" ]; then
    log "CONVERT REQUEST FAILED: $convert_resp"
    return
  fi

  local status="processing" job_resp=""
  for i in $(seq 1 60); do
    sleep 3
    job_resp=$(curl_json_retry "${BASE}/job/${job_id}")
    status=$(echo "$job_resp" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    [ "$status" = "done" ] && break
    [ "$status" = "failed" ] && break
  done

  if [ "$status" != "done" ]; then
    log "FAILED/TIMEOUT (status: $status): $job_resp"
    return
  fi

  local out_file="$OUTDIR/outputs/${label}.${target_ext}"
  curl_download_retry "$out_file" "${BASE}/download/${job_id}"

  if [ ! -s "$out_file" ]; then
    log "DOWNLOAD EMPTY/FAILED for job $job_id"
    return
  fi

  log "SUCCESS — saved to $out_file"

  case "$target_ext" in
    txt|md|html|json|yaml|toml|xml|csv)
      log '```'
      log "$(head -c 2000 "$out_file")"
      log '```'
      ;;
    *)
      log "(binary — open manually to verify)"
      MANUAL_OPEN_FILES+=("$out_file")
      ;;
  esac

  # Small courtesy pause between pairs regardless of rate-limit state,
  # to spread load and reduce how often we hit 429 in the first place.
  sleep 2
}

# ============================================================
# 3. RUN EVERY REGISTERED PAIR (same list as before)
# ============================================================
run_pair "$SRCDIR/source.md"    md    html
run_pair "$SRCDIR/source.md"    md    pdf
run_pair "$SRCDIR/source.md"    md    docx

run_pair "$SRCDIR/source.html"  html  md
run_pair "$SRCDIR/source.html"  html  pdf

run_pair "$SRCDIR/source.adoc"  adoc  html
run_pair "$SRCDIR/source.rst"   rst   html
run_pair "$SRCDIR/source.rtf"   rtf   docx
run_pair "$SRCDIR/source.odt"   odt   html
run_pair "$SRCDIR/source.docx"  docx  pdf

run_pair "$SRCDIR/source.xlsx"  xlsx  pdf
run_pair "$SRCDIR/source.xlsx"  xlsx  csv

run_pair "$SRCDIR/source.pptx"  pptx  pdf
run_pair "$SRCDIR/source.pptx"  pptx  odp

run_pair "$SRCDIR/source.csv"   csv   json
run_pair "$SRCDIR/source.csv"   csv   xml
run_pair "$SRCDIR/source.csv"   csv   yaml
run_pair "$SRCDIR/source.csv"   csv   toml

run_pair "$SRCDIR/source.json"  json  csv
run_pair "$SRCDIR/source.json"  json  yaml
run_pair "$SRCDIR/source.json"  json  toml
run_pair "$SRCDIR/source.json"  json  xml

run_pair "$SRCDIR/source.yaml"  yaml  json
run_pair "$SRCDIR/source.yaml"  yaml  csv
run_pair "$SRCDIR/source.yaml"  yaml  xml
run_pair "$SRCDIR/source.yaml"  yaml  toml

run_pair "$SRCDIR/source.xml"   xml   json
run_pair "$SRCDIR/source.xml"   xml   csv
run_pair "$SRCDIR/source.xml"   xml   yaml
run_pair "$SRCDIR/source.xml"   xml   toml

run_pair "$SRCDIR/source.toml"  toml  json
run_pair "$SRCDIR/source.toml"  toml  yaml
run_pair "$SRCDIR/source.toml"  toml  xml
run_pair "$SRCDIR/source.toml"  toml  csv

run_pair "$SRCDIR/source.tex"   tex   pdf
run_pair "$SRCDIR/source.tex"   tex   html
run_pair "$SRCDIR/source.tex"   tex   docx

run_pair "$SRCDIR/source.bib"   bib   html
run_pair "$SRCDIR/source.bib"   bib   json

run_pair "$SRCDIR/source.ipynb" ipynb html
run_pair "$SRCDIR/source.ipynb" ipynb md
run_pair "$SRCDIR/source.ipynb" ipynb docx

run_pair "$SRCDIR/source.pdf"   pdf   txt
run_pair "$SRCDIR/source.pdf"   pdf   docx
run_pair "$SRCDIR/source.pdf"   pdf   html
run_pair "$SRCDIR/source.pdf"   pdf   md

run_pair "$SRCDIR/source.zip"   zip   7z
run_pair "$SRCDIR/source.zip"   zip   tar
run_pair "$SRCDIR/source.zip"   zip   gz
run_pair "$SRCDIR/source.zip"   zip   bz2
run_pair "$SRCDIR/source.zip"   zip   xz

run_pair "$SRCDIR/source.7z"    7z    zip
run_pair "$SRCDIR/source.7z"    7z    tar
run_pair "$SRCDIR/source.7z"    7z    gz
run_pair "$SRCDIR/source.7z"    7z    bz2
run_pair "$SRCDIR/source.7z"    7z    xz

run_pair "$SRCDIR/source.tar"   tar   zip
run_pair "$SRCDIR/source.tar"   tar   7z
run_pair "$SRCDIR/source.tar"   tar   gz
run_pair "$SRCDIR/source.tar"   tar   bz2
run_pair "$SRCDIR/source.tar"   tar   xz

run_pair "$SRCDIR/source.gz"    gz    zip
run_pair "$SRCDIR/source.gz"    gz    7z
run_pair "$SRCDIR/source.gz"    gz    tar

run_pair "$SRCDIR/source.bz2"   bz2   zip
run_pair "$SRCDIR/source.bz2"   bz2   7z
run_pair "$SRCDIR/source.bz2"   bz2   tar

run_pair "$SRCDIR/source.xz"    xz    zip
run_pair "$SRCDIR/source.xz"    xz    7z
run_pair "$SRCDIR/source.xz"    xz    tar

# ============================================================
# 4. SUMMARY
# ============================================================
log "\n# Summary"
log "\nFull results log: $RESULTS_LOG"
log "\n## Files to open manually and verify (binary formats):"
if [ ${#MANUAL_OPEN_FILES[@]} -eq 0 ]; then
  log "(none — every output was text-printable, or every binary conversion failed, check the log above)"
else
  for f in "${MANUAL_OPEN_FILES[@]}"; do
    log "- $f"
  done
fi

echo ""
echo "DONE. Open $RESULTS_LOG for the full report."
echo "Windows path: C:\\Projects\\converthub\\$RESULTS_LOG"