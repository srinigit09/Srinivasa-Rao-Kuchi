#!/bin/bash
clear
echo "==================================================="
echo "  Panic Alarm Server — Quick Rebuild Tool (macOS)"
echo "==================================================="
echo
echo "[1/2] Preparing dependencies..."
cd server || exit 1
npm install
echo
echo "[2/2] Packaging the installer..."
npm run build-mac
echo
echo "==================================================="
echo "  REBUILD SUCCESSFUL!"
echo "  Your new installer is ready in:"
echo "  server/dist/"
echo "==================================================="
read -p "Press enter to close..."
