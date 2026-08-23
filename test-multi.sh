#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# test-multi.sh
# Run multiple Panic Alarm client instances on ONE machine for testing.
# Each instance uses a separate --user-data-dir so they behave as independent PCs.
#
# Usage:
#   chmod +x test-multi.sh
#   ./test-multi.sh
#
# This launches:
#   Instance 1 — Doctor   (shows ALERT button + receives popups)
#   Instance 2 — Viewer 1 (runs in tray, popup on alarm)
#   Instance 3 — Viewer 2 (runs in tray, popup on alarm)
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLIENT="$SCRIPT_DIR/client"
ELECTRON="$CLIENT/node_modules/.bin/electron"
MAIN="$CLIENT/main.js"

if [ ! -f "$ELECTRON" ]; then
  echo "❌  electron not found. Run: cd client && npm install"
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  🚨  PANIC ALARM — MULTI-INSTANCE TEST                    ║"
echo "║  Launching 3 virtual PCs on this machine                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Each instance opens a first-run setup wizard."
echo "Enter different details for each (Doctor / Viewer / Viewer)."
echo "Use the SAME Hospital Code for all three."
echo ""

# Instance 1 — Doctor PC
echo "▶  Starting Instance 1 (Doctor PC)..."
ELECTRON_USER_DATA="$SCRIPT_DIR/.test-data/pc1" \
  "$ELECTRON" "$MAIN" --user-data-dir="$SCRIPT_DIR/.test-data/pc1" &
PID1=$!
sleep 1

# Instance 2 — Viewer PC (e.g. Nurse station)
echo "▶  Starting Instance 2 (Viewer PC — Nurse Station)..."
ELECTRON_USER_DATA="$SCRIPT_DIR/.test-data/pc2" \
  "$ELECTRON" "$MAIN" --user-data-dir="$SCRIPT_DIR/.test-data/pc2" &
PID2=$!
sleep 1

# Instance 3 — Viewer PC (e.g. Admin / Ward)
echo "▶  Starting Instance 3 (Viewer PC — Ward)..."
ELECTRON_USER_DATA="$SCRIPT_DIR/.test-data/pc3" \
  "$ELECTRON" "$MAIN" --user-data-dir="$SCRIPT_DIR/.test-data/pc3" &
PID3=$!

echo ""
echo "✅  3 instances running. PIDs: $PID1 $PID2 $PID3"
echo ""
echo "Instructions:"
echo "  1. In the first setup window → enter role: Doctor"
echo "  2. In the second setup window → enter role: Viewer"
echo "  3. In the third setup window → enter role: Viewer"
echo "  4. Use the SAME Hospital Code (e.g. APL001) for all three"
echo "  5. Click ALERT on the Doctor button"
echo "  6. Both Viewer instances should show the popup"
echo ""
echo "Press Ctrl+C to kill all instances."
echo ""

# Wait for all to exit
wait $PID1 $PID2 $PID3
