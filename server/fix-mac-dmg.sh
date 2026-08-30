#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fix-mac-dmg.sh  (PanicAlarmServer)
#
# Run AFTER building the DMG. Ad-hoc signs the .app and strips quarantine
# from both the .app and the DMG so Gatekeeper allows installation.
#
# Usage:
#   bash fix-mac-dmg.sh            ← fixes arm64 DMG (default, M1/M2/M3)
#   bash fix-mac-dmg.sh --intel    ← fixes Intel x64 DMG
#   bash fix-mac-dmg.sh --both     ← fixes both
# ─────────────────────────────────────────────────────────────────────────────
set -e
DIST="$(cd "$(dirname "$0")/dist" && pwd)"
APP_NAME="PanicAlarmServer"
VERSION="1.0.0"

fix_dmg() {
  local APP_DIR="$1"  # e.g. dist/mac-arm64
  local DMG="$2"      # e.g. dist/PanicAlarmServer-1.0.0-arm64.dmg
  local ARCH="$3"     # arm64 or x64

  echo ""
  echo "▶  Fixing: $DMG  ($ARCH)"

  if [ ! -f "$DMG" ]; then
    echo "   ⚠️  DMG not found: $DMG — run the build script first"; return 1
  fi

  # 1. Sign the unpacked .app
  local APP="$APP_DIR/${APP_NAME}.app"
  if [ -d "$APP" ]; then
    echo "   → Signing .app ..."
    xattr -cr "$APP"
    codesign --deep --force --sign - "$APP"
    codesign --verify --deep --strict "$APP"
    echo "   ✅ App signed"
  fi

  # 2. Strip quarantine from the DMG
  echo "   → Stripping quarantine from DMG ..."
  xattr -cr "$DMG"

  local SIZE
  SIZE=$(du -sh "$DMG" | cut -f1)
  echo "   ✅ Done → $DMG ($SIZE)"
}

case "${1:-}" in
  --intel)
    fix_dmg "$DIST/mac"       "$DIST/${APP_NAME}-${VERSION}.dmg"       "x64"
    ;;
  --both)
    fix_dmg "$DIST/mac-arm64" "$DIST/${APP_NAME}-${VERSION}-arm64.dmg" "arm64"
    fix_dmg "$DIST/mac"       "$DIST/${APP_NAME}-${VERSION}.dmg"       "x64"
    ;;
  *)
    fix_dmg "$DIST/mac-arm64" "$DIST/${APP_NAME}-${VERSION}-arm64.dmg" "arm64"
    ;;
esac

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  DMG fixed and ready to share!                              ║"
echo "║                                                              ║"
echo "║  Share:  dist/${APP_NAME}-${VERSION}-arm64.dmg  (M1/M2/M3)  ║"
echo "║  Other:  dist/${APP_NAME}-${VERSION}.dmg         (Intel Mac)  ║"
echo "║                                                              ║"
echo "║  On recipient Mac, if still blocked:                        ║"
echo "║  System Settings → Privacy & Security → Open Anyway         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
