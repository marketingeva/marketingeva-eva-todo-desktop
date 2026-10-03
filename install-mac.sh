#!/bin/bash
# Eva To-do agent installeren op de Mac, zonder de melding "kan niet worden geopend".
# Gebruik (in Terminal):
#   curl -fsSL https://raw.githubusercontent.com/marketingeva/marketingeva-eva-todo-desktop/main/install-mac.sh | bash
set -euo pipefail

APP="Eva To-do agent"
URL="https://github.com/marketingeva/marketingeva-eva-todo-desktop/releases/latest/download/Eva-To-do-agent.dmg"
DEST="/Applications"
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }

TMP="$(mktemp -d)"
cleanup() { [ -n "${MNT:-}" ] && hdiutil detach "$MNT" -quiet 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT

echo "Eva To-do agent downloaden..."
curl -fL --progress-bar "$URL" -o "$TMP/eva.dmg"

MNT="$(hdiutil attach -nobrowse -noautoopen "$TMP/eva.dmg" | tail -1 | awk -F'\t' '{print $NF}')"
osascript -e "quit app \"$APP\"" >/dev/null 2>&1 || true
rm -rf "$DEST/$APP.app"
cp -R "$MNT/$APP.app" "$DEST/"
xattr -dr com.apple.quarantine "$DEST/$APP.app" 2>/dev/null || true

# Snelkoppeling op het bureaublad.
ln -sfn "$DEST/$APP.app" "$HOME/Desktop/$APP" 2>/dev/null || true

echo "Geïnstalleerd in $DEST, met een snelkoppeling op je bureaublad. De app start nu."
echo "Tip: klik met rechts op het icoon in het Dock → Opties → Behoud in Dock."
open "$DEST/$APP.app"
