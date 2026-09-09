#!/usr/bin/env bash
# build-fixtures.sh
# Extracted from full-registry-test.sh's "STEP 1 — Build independent
# ground-truth master fixtures" — standalone, so you can generate every
# source-format test file (test-fixtures/master/base.*) without also
# kicking off the full automated pair sweep.
#
# Run this once, then use the resulting base.* files to manually test any
# pair through the app UI: upload test-fixtures/master/base.<ext>, pick your
# target format, and check the result.
#
# Requires: the converthub container running (for sharp/ffmpeg/7z/heif-enc
# calls inside it) and the app server reachable at $BASE for the office-format
# bootstrap conversions (docx/pptx/odt/xlsx/ods/doc/xls/ppt/odp), since those
# don't have a standalone generator and are built by round-tripping through
# your own live API.
set -uo pipefail

BASE="${BASE:-http://localhost:4000}"
CONTAINER="${CONTAINER:-converthub}"
FIXDIR="./test-fixtures/master"
RESULTS="./fixture-build.log"
MARKER="CHMARKER_$(date +%s)"

mkdir -p "$FIXDIR"
: > "$RESULTS"

log() { echo "$@" | tee -a "$RESULTS"; }

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

log "=== Building master fixtures in $FIXDIR ==="

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


log ""
log "=== Done. Fixtures written to $FIXDIR ==="
log "Listing:"
ls -la "$FIXDIR" | tee -a "$RESULTS"
