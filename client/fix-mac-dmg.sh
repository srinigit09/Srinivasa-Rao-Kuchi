#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fix-mac-dmg.sh
#
# Run this AFTER building the DMG (npm run build-mac-arm or build-mac).
# It ad-hoc signs the app and strips macOS quarantine so the DMG:
#   • Opens on YOUR Mac without "not responding" / no-op click
#   • Opens on OTHER Macs without "damaged, move to bin" error
#
# Usage:
#   bash fix-mac-dmg.sh            ← fixes arm64 DMG (default, M1/M2/M3)
#   bash fix-mac-dmg.sh --intel    ← fixes Intel x64 DMG
#   bash fix-mac-dmg.sh --both     ← fixes both
# ─────────────────────────────────────────────────────────────────────────────
set -e
DIST="$(cd "$(dirname "$0")/dist" && pwd)"

fix_dmg() {
  local APP_DIR="$1"   # dist/mac-arm64 or dist/mac
  local DMG_FILE="$2"  # dist/PanicAlarm-1.0.0-arm64.dmg or dist/PanicAlarm-1.0.0.dmg
  local ARCH="$3"      # arm64 or x64

  echo ""
  echo "▶  Fixing DMG: $DMG_FILE"

  if [ ! -d "$APP_DIR" ]; then
    echo "   ⚠️  App dir not found: $APP_DIR"
    echo "   Run 'npm run build-mac-arm' (or 'build-mac') first."
    return 1
  fi

  # 1. Strip quarantine from unpacked app
  echo "   → Stripping quarantine from .app ..."
  xattr -cr "$APP_DIR/PanicAlarm.app"

  # 2. Ad-hoc code sign (local use — no Apple ID needed)
  echo "   → Ad-hoc signing .app ..."
  codesign --deep --force --sign - "$APP_DIR/PanicAlarm.app"

  # 3. Verify the signature
  codesign --verify --deep --strict "$APP_DIR/PanicAlarm.app"
  echo "   ✅ App signature valid"

  # 4. Rebuild DMG from the signed app
  echo "   → Rebuilding DMG ..."
  npx electron-builder --mac dmg --"$ARCH" --prepackaged "$APP_DIR/PanicAlarm.app" 2>&1 \
    | grep -E "building|built|error" || true

  # 5. Strip quarantine from the DMG itself
  echo "   → Stripping quarantine from DMG ..."
  xattr -cr "$DMG_FILE"

  local REMAINING
  REMAINING=$(xattr -l "$DMG_FILE" 2>/dev/null || true)
  if [ -z "$REMAINING" ]; then
    echo "   ✅ No quarantine attributes on DMG"
  else
    echo "   ⚠️  Remaining attributes: $REMAINING"
  fi

  local SIZE
  SIZE=$(du -sh "$DMG_FILE" | cut -f1)
  echo "   ✅ Done → $DMG_FILE ($SIZE)"
}

case "${1:-}" in
  --intel)
    fix_dmg "$DIST/mac"           "$DIST/PanicAlarm-1.0.0.dmg"        "x64"
    ;;
  --both)
    fix_dmg "$DIST/mac-arm64"     "$DIST/PanicAlarm-1.0.0-arm64.dmg"  "arm64"
    fix_dmg "$DIST/mac"           "$DIST/PanicAlarm-1.0.0.dmg"        "x64"
    ;;
  *)
    fix_dmg "$DIST/mac-arm64"     "$DIST/PanicAlarm-1.0.0-arm64.dmg"  "arm64"
    ;;
esac

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  DMG fixed and ready to share!                          ║"
echo "║                                                          ║"
echo "║  Share:  dist/PanicAlarm-1.0.0-arm64.dmg  (M1/M2/M3)  ║"
echo "║  Other:  dist/PanicAlarm-1.0.0.dmg        (Intel Mac)  ║"
echo "║                                                          ║"
echo "║  On recipient Mac, if still blocked:                    ║"
echo "║  System Settings → Privacy & Security → Open Anyway    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
