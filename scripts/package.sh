#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/mfl-enhancement-suite.zip"

cd "$ROOT"
rm -f "$OUT"

zip -r "$OUT" \
  manifest.json \
  background.js \
  content_script.js \
  fetch_interceptor.js \
  styles.css \
  popup.html \
  popup.js \
  settings.html \
  settings.js \
  src/ \
  icons/ \
  teams.html \
  teams.css \
  teams.js

echo "✓ Built: $OUT ($(du -h "$OUT" | cut -f1))"
