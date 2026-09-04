#!/bin/bash
# verify-everything.sh — full backend verification: all 68 conversion
# pairs + all 5 PDF tools. Every output file gets copied to VERIFY_ME/
# at the project root with simple flat names, and VERIFY_ME/CHECKLIST.md
# tells you exactly what to expect in each one.

set -uo pipefail

BASE="http://localhost:4000"
CONTAINER="converthub-server-run"
WORKDIR="verify-run-$(date +%Y%m%d-%H%M%S)"
SRCDIR="$WORKDIR/sources"
VERIFYDIR="VERIFY_ME"
mkdir -p "$SRCDIR" "$VERIFYDIR"
rm -f "$VERIFYDIR"/* 2>/dev/null
LOG="$WORKDIR/RESULTS.md"
> "$LOG"
CHECKLIST="$VERIFYDIR/CHECKLIST.md"
> "$CHECKLIST"

log() { echo -e "$1" | tee -a "$LOG"; }
checklist() { echo -e "$1" >> "$CHECKLIST"; }

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "ERROR: container '$CONTAINER' is not running. Start it first."
  exit 1
fi

log "# Full Verification Run — $(date)"
checklist "# Files to Check — what each one should look like"
checklist "\nGenerated $(date). Every file below is in this VERIFY_ME/ folder."

# ------------------------------------------------------------
# Retry-aware request helpers
# ------------------------------------------------------------
curl_json_retry() {
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
# 1. GENERATE SOURCE FIXTURES
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

cat > "$SRCDIR/source2.md" <<'EOF'
# Second Test Document

This is a completely separate document, used for merge/compare testing.

## Different Section

Different content entirely from the first document.
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
docker cp "$SRCDIR/source2.md" "${CONTAINER}:/tmp/source2.md"
docker cp "$SRCDIR/source.csv" "${CONTAINER}:/tmp/source.csv"

docker exec -i "$CONTAINER" bash -c '
  set -e
  cd /tmp
  pandoc source.md -t rtf -o source.rtf
  pandoc source.md -t odt -o source.odt
  pandoc source.md -t docx -o source.docx
  pandoc source.md -t pptx -o source.pptx
  pandoc source.md -o source.pdf
  pandoc source2.md -o source2.pdf
  soffice --headless --convert-to xlsx source.csv --outdir /tmp
  rm -f /tmp/archive-content.txt /tmp/source.zip /tmp/source.7z /tmp/source.tar /tmp/source.gz /tmp/source.bz2 /tmp/source.xz
  echo "archive test content" > /tmp/archive-content.txt
  7z a -tzip   /tmp/source.zip /tmp/archive-content.txt
  7z a -t7z    /tmp/source.7z  /tmp/archive-content.txt
  7z a -ttar   /tmp/source.tar /tmp/archive-content.txt
  7z a -tgzip  /tmp/source.gz  /tmp/archive-content.txt
  7z a -tbzip2 /tmp/source.bz2 /tmp/archive-content.txt
  7z a -txz    /tmp/source.xz  /tmp/archive-content.txt
' 2>&1 | tee -a "$LOG"

for f in rtf odt docx pptx pdf xlsx zip 7z tar gz bz2 xz; do
  docker cp "${CONTAINER}:/tmp/source.${f}" "$SRCDIR/source.${f}" 2>/dev/null \
    || log "WARNING: failed to generate/copy source.${f}"
done
docker cp "${CONTAINER}:/tmp/source2.pdf" "$SRCDIR/source2.pdf" 2>/dev/null

log "Binary/archive sources generated.\n"

# ============================================================
# 2. CONVERSION PAIR TEST RUNNER
# ============================================================
run_pair() {
  local src_file="$1" source_ext="$2" target_ext="$3" expected="$4"
  local label="${source_ext}_to_${target_ext}"
  local final_name="${VERIFYDIR}/${label}.${target_ext}"

  log "\n## ${source_ext} -> ${target_ext}"

  if [ ! -f "$src_file" ] || [ ! -s "$src_file" ]; then
    log "SKIPPED — source file missing/empty: $src_file"
    checklist "\n## ${final_name}\nSKIPPED (source file was missing) — flag this to Claude."
    return
  fi

  local upload_resp file_id
  upload_resp=$(curl_json_retry -F "file=@${src_file}" "${BASE}/upload")
  file_id=$(echo "$upload_resp" | grep -o '"fileId":"[^"]*"' | cut -d'"' -f4)
  if [ -z "$file_id" ]; then
    log "UPLOAD FAILED: $upload_resp"
    checklist "\n## ${final_name}\nFAILED TO GENERATE (upload error) — flag this to Claude."
    return
  fi

  local convert_resp job_id
  convert_resp=$(curl_json_retry -X POST "${BASE}/convert" -H "Content-Type: application/json" \
    -d "{\"fileId\":\"$file_id\",\"sourceExt\":\"$source_ext\",\"targetExt\":\"$target_ext\"}")
  job_id=$(echo "$convert_resp" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
  if [ -z "$job_id" ]; then
    log "CONVERT REQUEST FAILED: $convert_resp"
    checklist "\n## ${final_name}\nFAILED TO GENERATE (convert error: $convert_resp) — flag this to Claude."
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
    checklist "\n## ${final_name}\nFAILED TO GENERATE (status: $status) — flag this to Claude."
    return
  fi

  curl_download_retry "$final_name" "${BASE}/download/${job_id}"

  if [ ! -s "$final_name" ]; then
    log "DOWNLOAD EMPTY/FAILED for job $job_id"
    checklist "\n## ${final_name}\nFAILED TO GENERATE (empty download) — flag this to Claude."
    return
  fi

  log "SUCCESS — saved to $final_name"
  checklist "\n## ${final_name}\n${expected}"
  sleep 2
}

# ============================================================
# 3. RUN EVERY REGISTERED PAIR (with expected-content descriptions)
# ============================================================
DOC_TEXT="Should show: heading **Full Backend Test Document**, a paragraph with **bold** \"backend format-matrix test\" and *italic* \"italic\", a 3-item bullet list (Item one/two/three), an **## Section Two** heading, and a closing sentence \"Some more content here for a complete conversion test.\""
DATA_SINGLE="Should contain the single record: name=Alice, age=30, city=London (field order/exact syntax varies by format, values must match)."
DATA_MULTI="Should contain 2 records: Alice/30/London and Bob/25/Paris."

run_pair "$SRCDIR/source.md"    md    html  "$DOC_TEXT (as real HTML tags: <h1>, <strong>, <em>, <ul><li>, <h2>)"
run_pair "$SRCDIR/source.md"    md    pdf   "Open in a PDF viewer — $DOC_TEXT"
run_pair "$SRCDIR/source.md"    md    docx  "Open in Word — $DOC_TEXT, with real Word heading/bold/italic/list formatting"

run_pair "$SRCDIR/source.html"  html  md    "Should show as Markdown: # Full Backend Test Document, **backend format-matrix test** in bold, a bullet list with Item one/Item two"
run_pair "$SRCDIR/source.html"  html  pdf   "Open in a PDF viewer — heading 'Full Backend Test Document', bold text 'backend format-matrix test', 2-item list"

run_pair "$SRCDIR/source.adoc"  adoc  html  "Real Asciidoctor HTML — should have <h1>Full Backend Test Document</h1> and <h2>Section Two</h2>, with Asciidoctor's own CSS styling embedded"
run_pair "$SRCDIR/source.rst"   rst   html  "$DOC_TEXT (minus the list, just heading/bold/Section Two/closing text as HTML)"
run_pair "$SRCDIR/source.rtf"   rtf   docx  "Open in Word — $DOC_TEXT"
run_pair "$SRCDIR/source.odt"   odt   html  "$DOC_TEXT as HTML"
run_pair "$SRCDIR/source.docx"  docx  pdf   "Open in a PDF viewer — $DOC_TEXT"

run_pair "$SRCDIR/source.xlsx"  xlsx  pdf   "Open in a PDF viewer — should show a simple table: header row name/age/city, then Alice/30/London and Bob/25/Paris"
run_pair "$SRCDIR/source.xlsx"  xlsx  csv   "Plain CSV: name,age,city / Alice,30,London / Bob,25,Paris"

run_pair "$SRCDIR/source.pptx"  pptx  pdf   "Open in a PDF viewer — a simple slide deck rendering of the same document content"
run_pair "$SRCDIR/source.pptx"  pptx  odp   "Open in LibreOffice Impress (or similar) — same slide content as the source"

run_pair "$SRCDIR/source.csv"   csv   json  "$DATA_MULTI (as a JSON array of 2 objects)"
run_pair "$SRCDIR/source.csv"   csv   xml   "$DATA_MULTI (as XML, wrapped in <root><item>...)"
run_pair "$SRCDIR/source.csv"   csv   yaml  "$DATA_MULTI (as a YAML list)"
run_pair "$SRCDIR/source.csv"   csv   toml  "$DATA_MULTI (as TOML [[rows]] array-of-tables blocks — 2 blocks, one per person)"

run_pair "$SRCDIR/source.json"  json  csv   "$DATA_SINGLE (as a CSV header + 1 data row)"
run_pair "$SRCDIR/source.json"  json  yaml  "$DATA_SINGLE (as plain YAML key: value lines)"
run_pair "$SRCDIR/source.json"  json  toml  "$DATA_SINGLE (as plain TOML key = value lines, no [[rows]] wrapper needed for single objects)"
run_pair "$SRCDIR/source.json"  json  xml   "$DATA_SINGLE (wrapped in <root>...)"

run_pair "$SRCDIR/source.yaml"  yaml  json  "$DATA_SINGLE (as a JSON object)"
run_pair "$SRCDIR/source.yaml"  yaml  csv   "$DATA_SINGLE (as CSV header + 1 row)"
run_pair "$SRCDIR/source.yaml"  yaml  xml   "$DATA_SINGLE (wrapped in <root>...)"
run_pair "$SRCDIR/source.yaml"  yaml  toml  "$DATA_SINGLE (plain TOML key = value lines)"

run_pair "$SRCDIR/source.xml"   xml   json  "$DATA_SINGLE, nested under a \"person\" key (this nesting is correct/by-design for xml sources)"
run_pair "$SRCDIR/source.xml"   xml   csv   "$DATA_SINGLE as a FLAT CSV header + 1 row — name,age,city / Alice,30,London — must NOT show '[object Object]' anywhere (this was the bug we fixed)"
run_pair "$SRCDIR/source.xml"   xml   yaml  "$DATA_SINGLE, nested under a \"person:\" key"
run_pair "$SRCDIR/source.xml"   xml   toml  "$DATA_SINGLE, under a [person] table header"

run_pair "$SRCDIR/source.toml"  toml  json  "$DATA_SINGLE (as a JSON object)"
run_pair "$SRCDIR/source.toml"  toml  yaml  "$DATA_SINGLE (as plain YAML)"
run_pair "$SRCDIR/source.toml"  toml  xml   "$DATA_SINGLE (wrapped in <root>...)"
run_pair "$SRCDIR/source.toml"  toml  csv   "$DATA_SINGLE (as CSV header + 1 row)"

run_pair "$SRCDIR/source.tex"   tex   pdf   "Open in a PDF viewer — title 'Full Backend Test', an 'Introduction' section heading, a paragraph with bold 'bold' and italic 'italic' text"
run_pair "$SRCDIR/source.tex"   tex   html  "<h1>Introduction</h1>, paragraph with <strong>bold</strong> and <em>italic</em> text"
run_pair "$SRCDIR/source.tex"   tex   docx  "Open in Word — title/Introduction heading/bold+italic paragraph, same as the pdf version"

run_pair "$SRCDIR/source.bib"   bib   html  "A formatted bibliography entry: Doe, Jane. 2026. \"A Test Article.\" Journal of Testing."
run_pair "$SRCDIR/source.bib"   bib   json  "A JSON array with one object: type article, title 'A Test Article', author 'Doe, Jane', journal 'Journal of Testing', year 2026"

run_pair "$SRCDIR/source.ipynb" ipynb html  "Real Jupyter nbconvert HTML export — has heavy embedded CSS, should show 'Test Notebook' heading and print('hello') code cell when opened in a browser"
run_pair "$SRCDIR/source.ipynb" ipynb md    "# Test Notebook heading, followed by a \`\`\`python code block containing print('hello')"
run_pair "$SRCDIR/source.ipynb" ipynb docx  "Open in Word — 'Test Notebook' heading and the print('hello') code shown as text"

run_pair "$SRCDIR/source.pdf"   pdf   txt   "$DOC_TEXT (plain text, bullet points may show as • characters)"
run_pair "$SRCDIR/source.pdf"   pdf   docx  "Open in Word — $DOC_TEXT with real Word formatting"
run_pair "$SRCDIR/source.pdf"   pdf   html  "Real LibreOffice-exported HTML — $DOC_TEXT, may include absolute-positioned <span> elements (this is normal LibreOffice PDF-import behavior)"
run_pair "$SRCDIR/source.pdf"   pdf   md    "$DOC_TEXT as Markdown with **bold**/*italic*/## headings preserved (this is the custom formatting-preservation renderer built earlier)"

run_pair "$SRCDIR/source.zip"   zip   7z    "Open with 7-Zip/an archive tool — contains 1 file, archive-content.txt, with the text 'archive test content'"
run_pair "$SRCDIR/source.zip"   zip   tar   "Same — archive-content.txt containing 'archive test content'"
run_pair "$SRCDIR/source.zip"   zip   gz    "Same — a gzip of archive-content.txt"
run_pair "$SRCDIR/source.zip"   zip   bz2   "Same — a bzip2 of archive-content.txt"
run_pair "$SRCDIR/source.zip"   zip   xz    "Same — an xz of archive-content.txt"

run_pair "$SRCDIR/source.7z"    7z    zip   "Same content as above, repackaged as zip"
run_pair "$SRCDIR/source.7z"    7z    tar   "Same content, repackaged as tar"
run_pair "$SRCDIR/source.7z"    7z    gz    "Same content, repackaged as gz"
run_pair "$SRCDIR/source.7z"    7z    bz2   "Same content, repackaged as bz2"
run_pair "$SRCDIR/source.7z"    7z    xz    "Same content, repackaged as xz"

run_pair "$SRCDIR/source.tar"   tar   zip   "Same content, repackaged as zip"
run_pair "$SRCDIR/source.tar"   tar   7z    "Same content, repackaged as 7z"
run_pair "$SRCDIR/source.tar"   tar   gz    "Same content, repackaged as gz"
run_pair "$SRCDIR/source.tar"   tar   bz2   "Same content, repackaged as bz2"
run_pair "$SRCDIR/source.tar"   tar   xz    "Same content, repackaged as xz"

run_pair "$SRCDIR/source.gz"    gz    zip   "Same content, repackaged as zip"
run_pair "$SRCDIR/source.gz"    gz    7z    "Same content, repackaged as 7z"
run_pair "$SRCDIR/source.gz"    gz    tar   "Same content, repackaged as tar"

run_pair "$SRCDIR/source.bz2"   bz2   zip   "Same content, repackaged as zip"
run_pair "$SRCDIR/source.bz2"   bz2   7z    "Same content, repackaged as 7z"
run_pair "$SRCDIR/source.bz2"   bz2   tar   "Same content, repackaged as tar"

run_pair "$SRCDIR/source.xz"    xz    zip   "Same content, repackaged as zip"
run_pair "$SRCDIR/source.xz"    xz    7z    "Same content, repackaged as 7z"
run_pair "$SRCDIR/source.xz"    xz    tar   "Same content, repackaged as tar"

# ============================================================
# 4. PDF TOOLS
# ============================================================
log "\n## PDF TOOLS"

upload_and_get_id() {
  local resp
  resp=$(curl_json_retry -F "file=@${1}" "${BASE}/upload")
  echo "$resp" | grep -o '"fileId":"[^"]*"' | cut -d'"' -f4
}

PDF1_ID=$(upload_and_get_id "$SRCDIR/source.pdf")
PDF2_ID=$(upload_and_get_id "$SRCDIR/source2.pdf")
log "PDF1 (source.pdf): $PDF1_ID"
log "PDF2 (source2.pdf): $PDF2_ID"

poll_and_download() {
  local job_id="$1" out_file="$2"
  local status="processing" job_resp=""
  for i in $(seq 1 60); do
    sleep 3
    job_resp=$(curl_json_retry "${BASE}/job/${job_id}")
    status=$(echo "$job_resp" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    [ "$status" = "done" ] && break
    [ "$status" = "failed" ] && break
  done
  if [ "$status" != "done" ]; then
    log "FAILED/TIMEOUT: $job_resp"
    echo "$job_resp"
    return 1
  fi
  if echo "$job_resp" | grep -q '"outputPath"'; then
    curl_download_retry "$out_file" "${BASE}/download/${job_id}"
  fi
  echo "$job_resp"
  return 0
}

# --- Merge ---
log "\n### PDF Merge"
resp=$(curl_json_retry -X POST "${BASE}/pdf/merge" -H "Content-Type: application/json" \
  -d "{\"fileIds\":[\"$PDF1_ID\",\"$PDF2_ID\"]}")
job_id=$(echo "$resp" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
job_resp=$(poll_and_download "$job_id" "${VERIFYDIR}/pdf_merge.pdf")
log "$job_resp"
checklist "\n## ${VERIFYDIR}/pdf_merge.pdf\nOpen in a PDF viewer — should contain BOTH documents' content: page(s) with 'Full Backend Test Document' AND page(s) with 'Second Test Document' / 'Different Section' / 'Different content entirely'. Total should be more pages than either source alone."

# --- Split ---
log "\n### PDF Split"
resp=$(curl_json_retry -X POST "${BASE}/pdf/split" -H "Content-Type: application/json" \
  -d "{\"fileId\":\"$PDF1_ID\",\"pageRange\":\"1-1\"}")
job_id=$(echo "$resp" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
job_resp=$(poll_and_download "$job_id" "${VERIFYDIR}/pdf_split.pdf")
log "$job_resp"
checklist "\n## ${VERIFYDIR}/pdf_split.pdf\nOpen in a PDF viewer — should contain ONLY page 1 of source.pdf (the 'Full Backend Test Document' page). Should be a single-page PDF, not the full multi-page original."

# --- Compress ---
log "\n### PDF Compress"
resp=$(curl_json_retry -X POST "${BASE}/pdf/compress" -H "Content-Type: application/json" \
  -d "{\"fileId\":\"$PDF1_ID\"}")
job_id=$(echo "$resp" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
job_resp=$(poll_and_download "$job_id" "${VERIFYDIR}/pdf_compress.pdf")
log "$job_resp"
checklist "\n## ${VERIFYDIR}/pdf_compress.pdf\nOpen in a PDF viewer — content should look IDENTICAL to source.pdf ($DOC_TEXT). File size should be roughly the same or smaller (this fixture is tiny/text-only, so don't expect a dramatic size drop — the point is it opens correctly and reads the same, not corrupted)."

# --- Analyze ---
log "\n### PDF Analyze"
resp=$(curl_json_retry -X POST "${BASE}/pdf/analyze" -H "Content-Type: application/json" \
  -d "{\"fileId\":\"$PDF1_ID\"}")
job_id=$(echo "$resp" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
status="processing"
for i in $(seq 1 60); do
  sleep 3
  job_resp=$(curl_json_retry "${BASE}/job/${job_id}")
  status=$(echo "$job_resp" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  [ "$status" = "done" ] && break
  [ "$status" = "failed" ] && break
done
echo "$job_resp" > "${VERIFYDIR}/pdf_analyze.json"
log "$job_resp"
checklist "\n## ${VERIFYDIR}/pdf_analyze.json\nJSON report (open in any text editor) — should show: page count (1), a pdf version string, no encryption, embedded font info, and extracted raw text containing 'Full Backend Test Document' plus keyword/topic extraction results. status should be \"done\", not \"failed\"."

# --- Compare ---
log "\n### PDF Compare"
resp=$(curl_json_retry -X POST "${BASE}/pdf/compare" -H "Content-Type: application/json" \
  -d "{\"fileIdA\":\"$PDF1_ID\",\"fileIdB\":\"$PDF2_ID\"}")
job_id=$(echo "$resp" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
status="processing"
for i in $(seq 1 60); do
  sleep 3
  job_resp=$(curl_json_retry "${BASE}/job/${job_id}")
  status=$(echo "$job_resp" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  [ "$status" = "done" ] && break
  [ "$status" = "failed" ] && break
done
echo "$job_resp" > "${VERIFYDIR}/pdf_compare.json"
log "$job_resp"
checklist "\n## ${VERIFYDIR}/pdf_compare.json\nJSON report (open in any text editor) — since source.pdf and source2.pdf have completely different text ('Full Backend Test Document' vs 'Second Test Document'), this should report them as DIFFERENT/not matching, with some structural diff detail. status should be \"done\"."

# ============================================================
# 5. SUMMARY
# ============================================================
log "\n# Summary"
log "\nFull results log: $LOG"
log "\nAll files to check are in: $VERIFYDIR/"
log "Checklist describing what each should contain: $CHECKLIST"

echo ""
echo "DONE."
echo "Open the folder: C:\\Projects\\converthub\\$VERIFYDIR"
echo "Start with: C:\\Projects\\converthub\\$CHECKLIST"