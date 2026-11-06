#!/bin/bash
# Render the A4 QR poster to PDF (print) and PNG (screens/WhatsApp) with headless Chrome.
set -euo pipefail
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p out
P="file://$PWD/poster.html"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=8000 \
  --print-to-pdf="$PWD/out/hopnosis-quiz-poster-a4.pdf" "$P" 2>/dev/null
# A4 at 150 dpi = 1240 x 1754
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=8000 --force-device-scale-factor=1.5 \
  --window-size=794,1123 --screenshot="$PWD/out/hopnosis-quiz-poster-a4.png" "$P" 2>/dev/null
ls -lh out
