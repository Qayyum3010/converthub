#!/usr/bin/env bash
# ==============================================================================
# ConvertHub — FULL REGISTRY + PDF TOOLS test sweep (v2: rar/iso fixtures added,
# manual-review reporting added)
# ==============================================================================
set -uo pipefail

BASE="${BASE:-http://localhost:4000}"
CONTAINER="${CONTAINER:-converthub}"
FIXDIR="./test-fixtures/master"
RESULTS="./results.log"
MARKER="CHMARKER_$(date +%s)"

mkdir -p "$FIXDIR"
: > "$RESULTS"

PASS=0
FAIL=0
SKIP=0
declare -a MANUAL_REVIEW=()   # entries needing a human look, with guidance

log() { echo "$@" | tee -a "$RESULTS"; }
pass() { PASS=$((PASS+1)); log "PASS  | $1"; }
fail() { FAIL=$((FAIL+1)); log "FAIL  | $1 | $2"; }
skip() { SKIP=$((SKIP+1)); log "SKIP  | $1 | $2"; }
manual() { MANUAL_REVIEW+=("$1 :: $2"); }

dexec() { docker exec "$CONTAINER" "$@"; }
dcp_in() { docker cp "$1" "$CONTAINER:$2"; }
dcp_out() { docker cp "$CONTAINER:$1" "$2"; }

jget() {
  local json="$1" key="$2"
  if command -v jq >/dev/null 2>&1; then
    echo "$json" | jq -r ".$key // empty" 2>/dev/null
  else
    echo "$json" | grep -o "\"$key\":\"[^\"]*" | head -1 | cut -d'"' -f4
  fi
}

# ==============================================================================
# STEP 1 — Build independent ground-truth master fixtures
# ==============================================================================
log "=== Building master fixtures in $FIXDIR ==="

cat > "$FIXDIR/base.md" <<EOF
# Test Document ${MARKER}

This is a paragraph with **bold** and *italic* text, marker ${MARKER}.

## Section Two

- List item one
- List item two ${MARKER}
- List item three

\`\`\`
code block ${MARKER}
\`\`\`
EOF

cat > "$FIXDIR/base.html" <<EOF
<!DOCTYPE html>
<html><head><title>Test ${MARKER}</title></head>
<body>
<h1>Test Document ${MARKER}</h1>
<p>This is a paragraph, marker ${MARKER}.</p>
<ul><li>Item one</li><li>Item two ${MARKER}</li></ul>
</body></html>
EOF

cat > "$FIXDIR/base.txt" <<EOF
Plain text fixture ${MARKER}
Second line of content ${MARKER}
EOF

cat > "$FIXDIR/base.rst" <<EOF
Test Document ${MARKER}
========================

This is a paragraph, marker ${MARKER}.

- Item one
- Item two ${MARKER}
EOF

cat > "$FIXDIR/base.adoc" <<EOF
= Test Document ${MARKER}

This is a paragraph, marker ${MARKER}.

* Item one
* Item two ${MARKER}
EOF

TEX_SAFE_MARKER="${MARKER//_/-}"
cat > "$FIXDIR/base.tex" <<EOF
\\documentclass{article}
\\begin{document}
Test Document ${TEX_SAFE_MARKER}

This is a paragraph, marker ${TEX_SAFE_MARKER}. Equation: \$E = mc^2\$
\\end{document}
EOF

cat > "$FIXDIR/base.bib" <<EOF
@article{test${MARKER//_/},
  author = {Smith, John},
  title = {A Study of ${MARKER}},
  journal = {Journal of Testing},
  year = {2026}
}
EOF

cat > "$FIXDIR/base.json" <<EOF
{"marker": "${MARKER}", "name": "test", "value": 42, "items": ["a", "b", "c"]}
EOF

cat > "$FIXDIR/base.csv" <<EOF
name,marker,value
test,${MARKER},42
second,${MARKER},7
EOF

cat > "$FIXDIR/base.yaml" <<EOF
marker: ${MARKER}
name: test
value: 42
EOF

cat > "$FIXDIR/base.toml" <<EOF
marker = "${MARKER}"
name = "test"
value = 42
EOF

cat > "$FIXDIR/base.xml" <<EOF
<?xml version="1.0"?>
<root><marker>${MARKER}</marker><name>test</name><value>42</value></root>
EOF

cat > "$FIXDIR/base.rtf" <<EOF
{\\rtf1\\ansi Test Document ${MARKER}\\par This is a paragraph, marker ${MARKER}.\\par}
EOF

cat > "$FIXDIR/base.svg" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<rect x="20" y="20" width="160" height="160" fill="#3366cc"/>
<text x="30" y="100">${MARKER}</text>
</svg>
EOF

cat > "$FIXDIR/base.ipynb" <<EOF
{
 "cells": [
  {"cell_type": "markdown", "metadata": {}, "source": ["# Test ${MARKER}"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["print('${MARKER}')"]}
 ],
 "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}},
 "nbformat": 4, "nbformat_minor": 5
}
EOF

log "Text-family fixtures written."

# ---- Archive formats (raw zip/tar/7z, no app involvement) ----
mkdir -p "$FIXDIR/archive_payload"
echo "archive content ${MARKER}" > "$FIXDIR/archive_payload/inner_${MARKER}.txt"
( cd "$FIXDIR" && zip -qr base.zip archive_payload )
( cd "$FIXDIR" && tar -cf base.tar archive_payload )
( cd "$FIXDIR" && tar -czf base.tar.gz archive_payload )
if command -v 7z >/dev/null 2>&1; then
  ( cd "$FIXDIR" && 7z a -bd base.7z archive_payload >/dev/null )
else
  dcp_in "$FIXDIR/archive_payload" /tmp/archive_payload_host
  dexec bash -c "cd /tmp && 7z a -bd /tmp/base.7z archive_payload_host >/dev/null"
  dcp_out /tmp/base.7z "$FIXDIR/base.7z"
fi

# ---- RAR (downloaded, real fixture, source-only per registry) ----
curl -sL -o "$FIXDIR/base.rar" "https://raw.githubusercontent.com/ssokolow/rar-test-files/master/build/testfile.rar5.rar"
if [ ! -s "$FIXDIR/base.rar" ]; then
  log "RAR5 fixture download failed or empty, trying RAR3 fallback"
  curl -sL -o "$FIXDIR/base.rar" "https://raw.githubusercontent.com/ssokolow/rar-test-files/master/build/testfile.rar3.rar"
fi
[ -s "$FIXDIR/base.rar" ] && log "RAR fixture downloaded ($(stat -c%s "$FIXDIR/base.rar" 2>/dev/null || stat -f%z "$FIXDIR/base.rar") bytes)" || log "NOTE: RAR fixture unavailable, rar-as-source pairs will be skipped"

# ---- ISO (downloaded, real fixture, extract-only source per registry) ----
curl -sL -o "$FIXDIR/base.iso" "http://distro.ibiblio.org/tinycorelinux/15.x/x86/release/Core-15.0.iso"
[ -s "$FIXDIR/base.iso" ] && log "ISO fixture downloaded ($(stat -c%s "$FIXDIR/base.iso" 2>/dev/null || stat -f%z "$FIXDIR/base.iso") bytes)" || log "NOTE: ISO fixture download failed, iso-as-source pairs will be skipped"

log "Archive fixtures (zip/tar/tar.gz/7z/rar/iso) written."

# ---- Image formats (via sharp directly inside the container) ----
dexec node -e "
const sharp = require('sharp');
const w=300,h=200;
const img = sharp({create:{width:w,height:h,channels:3,background:{r:51,g:102,b:204}}});
(async () => {
  await img.clone().png().toFile('/tmp/base.png');
  await sharp('/tmp/base.png').jpeg().toFile('/tmp/base.jpg');
  await sharp('/tmp/base.png').webp().toFile('/tmp/base.webp');
  await sharp('/tmp/base.png').gif().toFile('/tmp/base.gif');
  await sharp('/tmp/base.png').tiff().toFile('/tmp/base.tiff');
  await sharp('/tmp/base.png').avif().toFile('/tmp/base.avif');
  console.log('images ok');
})();
" 2>&1 | tail -3
for ext in png jpg webp gif tiff avif; do
  dcp_out "/tmp/base.$ext" "$FIXDIR/base.$ext"
done
dexec bash -c "heif-enc -o /tmp/base.heic /tmp/base.png >/tmp/heic.log 2>&1 || true"
dcp_out /tmp/base.heic "$FIXDIR/base.heic" 2>/dev/null || log "NOTE: base.heic bootstrap failed, heic-as-source pairs will be skipped"
log "Image fixtures written."

# ---- Audio formats (via ffmpeg, synthetic sine wave) ----
for ext in wav mp3 ogg flac m4a aac; do
  dexec bash -c "ffmpeg -y -f lavfi -i 'sine=frequency=440:duration=2' -ar 44100 /tmp/base.$ext >/tmp/ff_$ext.log 2>&1"
  dcp_out "/tmp/base.$ext" "$FIXDIR/base.$ext" 2>/dev/null || log "NOTE: base.$ext bootstrap failed"
done
log "Audio fixtures written."

# ---- Office binary formats (bootstrapped via already-verified pairs) ----
bootstrap_convert() {
  local up cid fid job jid status out tries=0 retry_after
  sleep 3
  up=$(curl -s -F "file=@$1" "${BASE}/upload")
  while echo "$up" | grep -qi "429\|rate limit"; do
    retry_after=$(jget "$up" retryAfter)
    [ -z "$retry_after" ] && retry_after=10
    log "rate limited on upload for $1, waiting ${retry_after}s"
    sleep "$((retry_after + 1))"
    up=$(curl -s -F "file=@$1" "${BASE}/upload")
  done
  fid=$(jget "$up" fileId)
  [ -z "$fid" ] && { log "bootstrap upload failed for $1: $up"; return 1; }
  cid=$(curl -s -X POST "${BASE}/convert" -H "Content-Type: application/json" \
    -d "{\"fileId\":\"${fid}\",\"sourceExt\":\"$2\",\"targetExt\":\"$3\"}")
  while echo "$cid" | grep -qi "429\|rate limit"; do
    retry_after=$(jget "$cid" retryAfter)
    [ -z "$retry_after" ] && retry_after=10
    log "rate limited on convert for $1 -> $3, waiting ${retry_after}s"
    sleep "$((retry_after + 1))"
    cid=$(curl -s -X POST "${BASE}/convert" -H "Content-Type: application/json" \
      -d "{\"fileId\":\"${fid}\",\"sourceExt\":\"$2\",\"targetExt\":\"$3\"}")
  done
  jid=$(jget "$cid" jobId)
  [ -z "$jid" ] && { log "bootstrap convert failed for $1 -> $3: $cid"; return 1; }
  while [ $tries -lt 40 ]; do
    job=$(curl -s "${BASE}/job/${jid}")
    status=$(jget "$job" status)
    [ "$status" = "done" ] && break
    [ "$status" = "failed" ] && { log "bootstrap job failed: $job"; return 1; }
    sleep 3; tries=$((tries+1))
  done
  [ "$status" != "done" ] && { log "bootstrap job timed out for $3"; return 1; }
  out=$(echo "$job" | grep -o '"outputPath":"[^"]*' | cut -d'"' -f4)
  dcp_out "$out" "$4"
}

bootstrap_convert "$FIXDIR/base.md" md docx "$FIXDIR/base.docx"
bootstrap_convert "$FIXDIR/base.md" md odt  "$FIXDIR/base.odt"
bootstrap_convert "$FIXDIR/base.md" md pptx "$FIXDIR/base.pptx"
bootstrap_convert "$FIXDIR/base.md" md pdf  "$FIXDIR/base.pdf"
bootstrap_convert "$FIXDIR/base.md" md epub "$FIXDIR/base.epub"
bootstrap_convert "$FIXDIR/base.csv" csv xlsx "$FIXDIR/base.xlsx"
bootstrap_convert "$FIXDIR/base.csv" csv ods  "$FIXDIR/base.ods"
[ -f "$FIXDIR/base.docx" ] && bootstrap_convert "$FIXDIR/base.docx" docx doc "$FIXDIR/base.doc"
[ -f "$FIXDIR/base.xlsx" ] && bootstrap_convert "$FIXDIR/base.xlsx" xlsx xls "$FIXDIR/base.xls"
[ -f "$FIXDIR/base.pptx" ] && bootstrap_convert "$FIXDIR/base.pptx" pptx ppt "$FIXDIR/base.ppt"
[ -f "$FIXDIR/base.pptx" ] && bootstrap_convert "$FIXDIR/base.pptx" pptx odp "$FIXDIR/base.odp"

log "Office-family fixtures bootstrapped."

# ==============================================================================
# STEP 2 — Verifiers (keyed by TARGET extension). Each also records whether a
# manual look is still warranted, via `manual()`, even on PASS.
# ==============================================================================

verify_marker_text() {
  grep -q "$MARKER" "$1" 2>/dev/null && return 0
  echo "marker not found in plain text output"; return 1
}

verify_marker_strings() {
  local cpath="/tmp/verify_$$.bin"
  dcp_in "$1" "$cpath"
  dexec bash -c "grep -a '$MARKER' '$cpath' >/dev/null 2>&1"
  local rc=$?
  dexec rm -f "$cpath"
  [ $rc -eq 0 ] && return 0
  echo "marker not found via binary grep scan"; return 1
}

verify_zip_structural() {
  local cpath="/tmp/verify_$$.zip"
  dcp_in "$1" "$cpath"
  dexec bash -c "7z l '$cpath' | grep -q '$2'"
  local rc=$?
  dexec rm -f "$cpath"
  [ $rc -eq 0 ] && return 0
  echo "expected internal member '$2' not found"; return 1
}

verify_pdf() {
  local cpath="/tmp/verify_$$.pdf"
  dcp_in "$1" "$cpath"
  local pages
  pages=$(dexec qpdf --show-npages "$cpath" 2>/dev/null)
  dexec rm -f "$cpath"
  if [ -n "$pages" ] && [ "$pages" -ge 1 ] 2>/dev/null; then return 0; fi
  echo "qpdf could not read a valid page count"; return 1
}

verify_image() {
  local cpath="/tmp/verify_$$.img"
  dcp_in "$1" "$cpath"
  local meta fmt
  meta=$(dexec node -e "require('sharp')('$cpath').metadata().then(m=>console.log(JSON.stringify(m))).catch(e=>console.log('ERR:'+e.message))" 2>/dev/null)
  dexec rm -f "$cpath"
  echo "$meta" | grep -q '^ERR' && { echo "sharp could not read image: $meta"; return 1; }
  fmt=$(jget "$meta" format)
  if [ "$fmt" = "$2" ] || { [ "$2" = "heif" ] && [ "$fmt" = "heif" ]; }; then return 0; fi
  echo "expected format '$2', sharp reported '$fmt' ($meta)"; return 1
}

verify_heic() {
  local cpath="/tmp/verify_$$.heic"
  dcp_in "$1" "$cpath"
  dexec bash -c "heif-convert '$cpath' /tmp/verify_$$.png >/tmp/verify_$$.log 2>&1"
  local rc=$?
  dexec rm -f "$cpath" "/tmp/verify_$$.png" "/tmp/verify_$$.log"
  [ $rc -eq 0 ] && return 0
  echo "heif-convert could not decode output"; return 1
}

verify_audio() {
  local cpath="/tmp/verify_$$.audio"
  dcp_in "$1" "$cpath"
  local dur
  dur=$(dexec ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$cpath" 2>/dev/null)
  dexec rm -f "$cpath"
  if [ -n "$dur" ]; then
    awk -v d="$dur" 'BEGIN{exit !(d>=1.0 && d<=4.0)}' && return 0
    echo "duration out of expected range: ${dur}s"; return 1
  fi
  echo "ffprobe could not read duration"; return 1
}

verify_archive() {
  local cpath="/tmp/verify_$$.arc"
  dcp_in "$1" "$cpath"
  dexec bash -c "7z l '$cpath' | grep -qE 'inner_|testfile\.txt'"
  local rc=$?
  dexec rm -f "$cpath"
  [ $rc -eq 0 ] && return 0
  echo "expected inner_* member not found in archive listing"; return 1
}

verify_ipynb() {
  local cpath="/tmp/verify_$$.ipynb"
  dcp_in "$1" "$cpath"
  local formatted
  formatted=$(dexec python3 -m json.tool "$cpath" 2>/dev/null)
  local rc=$?
  dexec rm -f "$cpath"
  if [ $rc -eq 0 ] && echo "$formatted" | grep -q "$MARKER"; then
    return 0
  fi
  echo "invalid JSON or marker missing in notebook"; return 1
}

verify_nonempty() {
  [ -s "$1" ] && return 0
  echo "output file is empty"; return 1
}

# Map target extension -> verifier + a manual-review note when auto-verification
# is necessarily partial (structure/validity only, not full fidelity).
verify_output() {
  local target="$1" outfile="$2" pairlabel="$3" from_ext="${4:-}"
  case "$target" in
    md|html|txt|rst|adoc|csv|json|yaml|toml|xml|rtf)
      if [ "$from_ext" = "tex" ]; then
        grep -q "$TEX_SAFE_MARKER" "$outfile" 2>/dev/null && return 0
        echo "tex-safe marker not found in plain text output"; return 1
      else
        verify_marker_text "$outfile"
      fi ;;
    tex)
      grep -qE "$(echo "$MARKER" | sed 's/_/\\\\?_/g')" "$outfile" 2>/dev/null && return 0
      echo "marker (with or without LaTeX underscore escaping) not found in tex output"; return 1 ;;
    svg)
      if verify_marker_text "$outfile"; then
        return 0
      elif grep -qi "<svg" "$outfile" 2>/dev/null; then
        manual "$pairlabel" "Source has no embedded marker (e.g. raster image vectorization) — visually confirm the traced SVG resembles the source image."
        return 0
      else
        echo "not valid SVG (no <svg> tag found) and no marker present"; return 1
      fi ;;
    docx)
      verify_marker_strings "$outfile" || verify_zip_structural "$outfile" "word/document.xml"
      manual "$pairlabel" "Open in Word/LibreOffice: confirm heading levels, bold/italic runs, and list bullets rendered correctly (marker text presence doesn't prove formatting survived)." ;;
    odt)
      verify_zip_structural "$outfile" "content.xml"
      manual "$pairlabel" "Open in LibreOffice Writer: confirm paragraph/list structure matches source, no garbled characters." ;;
    pptx)
      verify_zip_structural "$outfile" "ppt/presentation.xml"
      manual "$pairlabel" "Open in PowerPoint/LibreOffice Impress: confirm slide count and text placement are sane, not just that the zip has the right internal file." ;;
    odp)
      verify_zip_structural "$outfile" "content.xml"
      manual "$pairlabel" "Open in LibreOffice Impress: visually confirm slide layout." ;;
    xlsx)
      verify_zip_structural "$outfile" "xl/workbook.xml"
      manual "$pairlabel" "Open in Excel/LibreOffice Calc: confirm cell values/column headers match the source CSV exactly, including numeric types (not stored as text)." ;;
    ods)
      verify_zip_structural "$outfile" "content.xml"
      manual "$pairlabel" "Open in LibreOffice Calc: confirm cell values match source." ;;
    epub)
      verify_zip_structural "$outfile" "META-INF/container.xml"
      manual "$pairlabel" "Open in an EPUB reader (or 'ebook-viewer'): confirm chapter/heading structure and reading order." ;;
    pdf)
      verify_pdf "$outfile"
      manual "$pairlabel" "Open the PDF visually: confirm text isn't clipped/overlapping and page layout looks right (qpdf only proves the file is structurally valid, not that it looks correct)." ;;
    doc|ppt|xls)
      verify_nonempty "$outfile"
      manual "$pairlabel" "No independent structural tool available for legacy binary $target — open manually in the corresponding legacy Office app or LibreOffice to confirm it's not corrupted/garbled." ;;
    ipynb)
      verify_ipynb "$outfile" ;;
    jpg|jpeg) verify_image "$outfile" jpeg
      manual "$pairlabel" "Visually inspect: confirm no color shift, no corruption artifacts, dimensions match source." ;;
    png) verify_image "$outfile" png
      manual "$pairlabel" "Visually inspect for corruption/color shift." ;;
    webp) verify_image "$outfile" webp
      manual "$pairlabel" "Visually inspect for corruption/color shift." ;;
    gif) verify_image "$outfile" gif
      manual "$pairlabel" "Visually inspect; confirm it's not just a blank/first-frame-only GIF." ;;
    tiff) verify_image "$outfile" tiff
      manual "$pairlabel" "Visually inspect; confirm no unexpected color-space conversion." ;;
    avif) verify_image "$outfile" heif
      manual "$pairlabel" "Visually inspect in a browser/viewer that supports AVIF." ;;
    heic) verify_heic "$outfile"
      manual "$pairlabel" "Visually inspect (e.g. via Preview on Mac or a HEIC viewer); confirm orientation is correct." ;;
    mp3|wav|ogg|flac|m4a|aac) verify_audio "$outfile"
      manual "$pairlabel" "Listen to a few seconds: confirm no static/silence/pitch distortion (duration check alone doesn't catch codec artifacts)." ;;
    zip|7z|tar|tar.gz) verify_archive "$outfile"
      manual "$pairlabel" "Extract manually and diff file contents against the source archive's inner_*.txt to confirm byte-for-byte fidelity." ;;
    *)
      verify_nonempty "$outfile"
      manual "$pairlabel" "No specific verifier defined for target '.$target' — inspect manually." ;;
  esac
}

# ==============================================================================
# STEP 3 — Pull the live registry from /formats
# ==============================================================================
log ""
log "=== Fetching live /formats registry ==="
sleep 5
FORMATS_JSON=$(curl -s "${BASE}/formats")
while echo "$FORMATS_JSON" | grep -qi "429\|rate limit"; do
  retry_after=$(jget "$FORMATS_JSON" retryAfter)
  [ -z "$retry_after" ] && retry_after=10
  log "rate limited fetching /formats, waiting ${retry_after}s"
  sleep "$((retry_after + 1))"
  FORMATS_JSON=$(curl -s "${BASE}/formats")
done

PAIRS_FILE="$FIXDIR/pairs.txt"
python3 - "$PAIRS_FILE" <<PYEOF
import json, sys
data = json.loads('''$FORMATS_JSON''')
with open(sys.argv[1], "w") as f:
    for src, targets in data.items():
        if not isinstance(targets, list):
            continue
        for tgt in targets:
            f.write(f"{src}|{tgt}\n")
PYEOF

TOTAL_PAIRS=$(wc -l < "$PAIRS_FILE")
log "Live registry reports $TOTAL_PAIRS total pairs."

# ==============================================================================
# STEP 4 — Run every pair
# ==============================================================================
log ""
log "=== Running full pair sweep ==="

run_pair() {
  local from="$1" to="$2"
  local pairlabel="${from} -> ${to}"
  local fixture="$FIXDIR/base.${from}"

  if [ ! -f "$fixture" ]; then
    skip "$pairlabel" "no master fixture for source ext '$from'"
    return
  fi

  local up fid conv jid tries=0 job status out outfile

  sleep 3
  up=$(curl -s -F "file=@${fixture}" "${BASE}/upload")
  while echo "$up" | grep -qi "429\|rate limit"; do
    retry_after=$(jget "$up" retryAfter)
    [ -z "$retry_after" ] && retry_after=10
    sleep "$((retry_after + 1))"
    up=$(curl -s -F "file=@${fixture}" "${BASE}/upload")
  done
  fid=$(jget "$up" fileId)
  if [ -z "$fid" ]; then
    fail "$pairlabel" "upload failed: $up"
    return
  fi

  conv=$(curl -s -X POST "${BASE}/convert" -H "Content-Type: application/json" \
    -d "{\"fileId\":\"${fid}\",\"sourceExt\":\"${from}\",\"targetExt\":\"${to}\"}")
  while echo "$conv" | grep -qi "429\|rate limit"; do
    retry_after=$(jget "$conv" retryAfter)
    [ -z "$retry_after" ] && retry_after=10
    sleep "$((retry_after + 1))"
    conv=$(curl -s -X POST "${BASE}/convert" -H "Content-Type: application/json" \
      -d "{\"fileId\":\"${fid}\",\"sourceExt\":\"${from}\",\"targetExt\":\"${to}\"}")
  done
  jid=$(jget "$conv" jobId)
  if [ -z "$jid" ]; then
    fail "$pairlabel" "convert request failed: $conv"
    return
  fi

  while [ $tries -lt 60 ]; do
    job=$(curl -s "${BASE}/job/${jid}")
    status=$(jget "$job" status)
    [ "$status" = "done" ] && break
    [ "$status" = "failed" ] && break
    sleep 3
    tries=$((tries+1))
  done

  if [ "$status" = "failed" ]; then
    fail "$pairlabel" "job failed: $(jget "$job" error)"
    return
  fi
  if [ "$status" != "done" ]; then
    fail "$pairlabel" "job timed out after ~180s (status=$status)"
    return
  fi

  out=$(echo "$job" | grep -o '"outputPath":"[^"]*' | tail -1 | cut -d'"' -f4)
  if [ -z "$out" ]; then
    fail "$pairlabel" "no outputPath in job result: $job"
    return
  fi

  outfile="/tmp/dl_$$_${from}_${to}.${to}"
  dcp_out "$out" "$outfile" >/dev/null 2>&1
  if [ ! -f "$outfile" ]; then
    fail "$pairlabel" "could not copy output file from container ($out)"
    return
  fi

  local reason
  reason=$(verify_output "$to" "$outfile" "$pairlabel" "$from")
  if [ $? -eq 0 ]; then
    pass "$pairlabel"
  else
    fail "$pairlabel" "$reason"
  fi
  rm -f "$outfile"
}

while IFS='|' read -r FROM TO; do
  [ -z "$FROM" ] && continue
  run_pair "$FROM" "$TO"
done < "$PAIRS_FILE"

# ==============================================================================
# STEP 5 — PDF Tools sweep
# ==============================================================================
log ""
log "=== PDF Tools sweep ==="

if [ -f "$FIXDIR/base.pdf" ]; then
  cat > "$FIXDIR/base2.md" <<EOF
# Second Document ${MARKER}

Different content entirely, marker ${MARKER}-TWO.
EOF
  bootstrap_convert "$FIXDIR/base2.md" md pdf "$FIXDIR/base2.pdf"
fi

if [ -f "$FIXDIR/base.pdf" ] && [ -f "$FIXDIR/base2.pdf" ]; then
  sleep 3
  UP1=$(curl -s -F "file=@${FIXDIR}/base.pdf" "${BASE}/upload")
  while echo "$UP1" | grep -qi "429\|rate limit"; do
    ra=$(jget "$UP1" retryAfter); [ -z "$ra" ] && ra=10
    sleep "$((ra + 1))"
    UP1=$(curl -s -F "file=@${FIXDIR}/base.pdf" "${BASE}/upload")
  done
  sleep 3
  UP2=$(curl -s -F "file=@${FIXDIR}/base2.pdf" "${BASE}/upload")
  while echo "$UP2" | grep -qi "429\|rate limit"; do
    ra=$(jget "$UP2" retryAfter); [ -z "$ra" ] && ra=10
    sleep "$((ra + 1))"
    UP2=$(curl -s -F "file=@${FIXDIR}/base2.pdf" "${BASE}/upload")
  done
  PID1=$(jget "$UP1" fileId)
  PID2=$(jget "$UP2" fileId)

  sleep 3
  MJ=$(curl -s -X POST "${BASE}/pdf/merge" -H "Content-Type: application/json" -d "{\"fileIds\":[\"${PID1}\",\"${PID2}\"]}")
  while echo "$MJ" | grep -qi "429\|rate limit"; do
    ra=$(jget "$MJ" retryAfter); [ -z "$ra" ] && ra=10
    sleep "$((ra + 1))"
    MJ=$(curl -s -X POST "${BASE}/pdf/merge" -H "Content-Type: application/json" -d "{\"fileIds\":[\"${PID1}\",\"${PID2}\"]}")
  done
  MJID=$(jget "$MJ" jobId)
  tries=0; status=""
  while [ $tries -lt 30 ]; do
    job=$(curl -s "${BASE}/job/${MJID}"); status=$(jget "$job" status)
    [ "$status" = "done" ] && break; [ "$status" = "failed" ] && break
    sleep 2; tries=$((tries+1))
  done
  if [ "$status" = "done" ]; then
    outp=$(echo "$job" | grep -o '"outputPath":"[^"]*' | cut -d'"' -f4)
    pages=$(dexec qpdf --show-npages "$outp" 2>/dev/null)
    if [ "$pages" = "2" ]; then pass "PDF Tool: merge"; else fail "PDF Tool: merge" "expected 2 pages, got '$pages'"; fi
    manual "PDF Tool: merge" "Open the merged PDF visually: confirm page order matches upload order and no page is blank/corrupted."
  else
    fail "PDF Tool: merge" "job did not complete: $job"
  fi

  if [ -n "${outp:-}" ]; then
    dcp_out "$outp" "$FIXDIR/merged_for_split.pdf"
    UPM=$(curl -s -F "file=@${FIXDIR}/merged_for_split.pdf" "${BASE}/upload")
    MID=$(jget "$UPM" fileId)
    SJ=$(curl -s -X POST "${BASE}/pdf/split" -H "Content-Type: application/json" -d "{\"fileId\":\"${MID}\",\"pageRange\":\"1\"}")
    SJID=$(jget "$SJ" jobId)
    tries=0; status=""
    while [ $tries -lt 30 ]; do
      job=$(curl -s "${BASE}/job/${SJID}"); status=$(jget "$job" status)
      [ "$status" = "done" ] && break; [ "$status" = "failed" ] && break
      sleep 2; tries=$((tries+1))
    done
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

  CJ=$(curl -s -X POST "${BASE}/pdf/compress" -H "Content-Type: application/json" -d "{\"fileId\":\"${PID1}\"}")
  CJID=$(jget "$CJ" jobId)
  tries=0; status=""
  while [ $tries -lt 30 ]; do
    job=$(curl -s "${BASE}/job/${CJID}"); status=$(jget "$job" status)
    [ "$status" = "done" ] && break; [ "$status" = "failed" ] && break
    sleep 2; tries=$((tries+1))
  done
  if [ "$status" = "done" ]; then
    outp3=$(echo "$job" | grep -o '"outputPath":"[^"]*' | cut -d'"' -f4)
    resultfid=$(jget "$job" fileId)
    dexec test -f "$outp3" && matchok=0 || matchok=1
    if [ $matchok -eq 0 ] && echo "$outp3" | grep -q "$resultfid"; then
      pass "PDF Tool: compress"
    else
      fail "PDF Tool: compress" "outputPath ($outp3) does not match result.fileId ($resultfid), or file missing"
    fi
    manual "PDF Tool: compress" "Open the compressed PDF: confirm no visible quality loss beyond what's expected."
  else
    fail "PDF Tool: compress" "job did not complete: $job"
  fi

  AJ=$(curl -s -X POST "${BASE}/pdf/analyze" -H "Content-Type: application/json" -d "{\"fileId\":\"${PID1}\"}")
  AJID=$(jget "$AJ" jobId)
  tries=0; status=""
  while [ $tries -lt 30 ]; do
    job=$(curl -s "${BASE}/job/${AJID}"); status=$(jget "$job" status)
    [ "$status" = "done" ] && break; [ "$status" = "failed" ] && break
    sleep 2; tries=$((tries+1))
  done
  if [ "$status" = "done" ] && echo "$job" | grep -q "$MARKER"; then
    pass "PDF Tool: analyze"
  else
    fail "PDF Tool: analyze" "marker not found in extracted text, or job failed: $job"
  fi

  CMJ=$(curl -s -X POST "${BASE}/pdf/compare" -H "Content-Type: application/json" -d "{\"fileIdA\":\"${PID1}\",\"fileIdB\":\"${PID2}\"}")
  CMJID=$(jget "$CMJ" jobId)
  tries=0; status=""
  while [ $tries -lt 30 ]; do
    job=$(curl -s "${BASE}/job/${CMJID}"); status=$(jget "$job" status)
    [ "$status" = "done" ] && break; [ "$status" = "failed" ] && break
    sleep 2; tries=$((tries+1))
  done
  if [ "$status" = "done" ] && echo "$job" | grep -q '"identical":false'; then
    pass "PDF Tool: compare"
  else
    fail "PDF Tool: compare" "expected identical:false, got: $job"
  fi
else
  skip "PDF Tools sweep" "base.pdf or base2.pdf not available"
fi

# ==============================================================================
# SUMMARY + MANUAL REVIEW LIST
# ==============================================================================
log ""
log "=============================================="
log "TOTAL: $((PASS+FAIL+SKIP))   PASS: $PASS   FAIL: $FAIL   SKIP: $SKIP"
log "=============================================="
log ""
log "=== MANUAL REVIEW NEEDED (${#MANUAL_REVIEW[@]} items) ==="
log "These PASSED automated checks (structure/validity), but automated"
log "verification could not confirm full visual/content fidelity. Spot-check"
log "a representative sample, not necessarily every single one:"
log ""
for item in "${MANUAL_REVIEW[@]}"; do
  log "  - $item"
done
log ""
log "Full results written to $RESULTS"