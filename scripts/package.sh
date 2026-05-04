#!/usr/bin/env bash
set -euo pipefail

# Package Trade repository into a distributable ZIP located in /dist
# Excludes node_modules, .git, dist, and large binary assets by default

VERSION=$(node -e "console.log(require('./package.json').version || '0.0.0')")
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT_DIR="dist"
OUT_FILE="$OUT_DIR/trade-${VERSION}-${TIMESTAMP}.zip"

mkdir -p "$OUT_DIR"

echo "Packaging repository into: $OUT_FILE"

# Use zip if available
if command -v zip >/dev/null 2>&1; then
  zip -r "$OUT_FILE" . \
    -x "node_modules/*" \
    -x ".git/*" \
    -x "dist/*" \
    -x "*.zip" \
    -x "*.DS_Store" \
    -x "day-trader-os-enhanced.zip" \
    -x "*.pem" \
    -x "*.key"
  echo "Created $OUT_FILE"
  exit 0
fi

# Fallback to tar.gz if zip not available
if command -v tar >/dev/null 2>&1; then
  OUT_FILE_TGZ="$OUT_DIR/trade-${VERSION}-${TIMESTAMP}.tar.gz"
  echo "zip not found, creating tar.gz: $OUT_FILE_TGZ"
  tar --exclude='./node_modules' --exclude='./.git' --exclude='./dist' --exclude='*.zip' -czf "$OUT_FILE_TGZ" .
  echo "Created $OUT_FILE_TGZ"
  exit 0
fi

echo "Error: neither zip nor tar is available on this system. Install zip or tar and retry."