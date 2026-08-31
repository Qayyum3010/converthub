#!/bin/sh
set -e

echo "== Node =="
node --version

echo "== Python =="
python3 --version

echo "== Ruby =="
ruby --version

echo "== Pandoc =="
pandoc --version | head -n 1

echo "== LibreOffice =="
soffice --version

echo "== Tesseract OCR =="
tesseract --version | head -n 1

echo "== 7zip =="
7z --help | head -n 2

echo "== qpdf =="
qpdf --version

echo "== TeX Live (pdflatex) =="
pdflatex --version | head -n 1

echo "== nbconvert =="
jupyter nbconvert --version

echo "== asciidoctor =="
asciidoctor --version | head -n 1


echo "All binaries responded."