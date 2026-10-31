#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER_PATH="$SCRIPT_DIR/bin/lidm-launcher.sh"
DIST_PATH="$SCRIPT_DIR/dist/lidm.js"
TARGET_BIN="$HOME/.local/bin/lidm"
DESKTOP_DIR="$HOME/.local/share/applications"
TARGET_DESKTOP="$DESKTOP_DIR/lidm.desktop"

echo "================================================================="
echo " Installing Linux Internet Download Manager (LIDM)"
echo " Unlimited Edition - No Trial - Debian / Linux Optimized"
echo "================================================================="

# 1. Verify Node.js
if ! command -v node >/dev/null 2>&1 && [ ! -x "$HOME/.nvm/versions/node/v24.19.0/bin/node" ]; then
    echo "[-] Error: Node.js is required but not installed."
    echo "    Please install Node.js 18+ and rerun this script."
    exit 1
fi

# 2. Build standalone zero-dependency bundle with esbuild
if [ -f "$SCRIPT_DIR/../rea/node_modules/.bin/esbuild" ]; then
    echo "[+] Bundling LIDM into standalone JavaScript..."
    "$SCRIPT_DIR/../rea/node_modules/.bin/esbuild" "$SCRIPT_DIR/src/main.ts" \
        --bundle \
        --platform=node \
        --target=node18 \
        --format=esm \
        --outfile="$DIST_PATH"
fi

# 3. Make executables runnable
chmod +x "$LAUNCHER_PATH" "$SCRIPT_DIR/bin/lidm.js" "$SCRIPT_DIR/bin/lidm-app.py" "$DIST_PATH"

# 4. Install binary to ~/.local/bin
mkdir -p "$HOME/.local/bin"
rm -f "$TARGET_BIN"
ln -sf "$LAUNCHER_PATH" "$TARGET_BIN"
echo "[+] Linked executable to $TARGET_BIN"

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo "[!] Note: Please ensure $HOME/.local/bin is added to your PATH:"
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\" (in ~/.bashrc or ~/.zshrc)"
fi

# 5. Install Desktop Entry for GNOME / KDE / XFCE
mkdir -p "$DESKTOP_DIR"
cat << EOF > "$TARGET_DESKTOP"
[Desktop Entry]
Version=1.0
Type=Application
Name=Internet Download Manager (LIDM)
GenericName=Download Manager
Comment=Unlimited Multi-Threaded Download Manager for Linux
Exec=$LAUNCHER_PATH ui
Icon=$SCRIPT_DIR/public/lidm.svg
Terminal=false
Categories=Network;FileTransfer;
Keywords=download;idm;accelerator;
StartupNotify=true
StartupWMClass=lidm
EOF

chmod +x "$TARGET_DESKTOP"
echo "[+] Installed desktop application launcher: $TARGET_DESKTOP"

# 6. Install to Desktop folder if present
for DT in "$HOME/Destop" "$HOME/Desktop"; do
    if [ -d "$DT" ]; then
        cp -f "$TARGET_DESKTOP" "$DT/lidm.desktop"
        chmod +x "$DT/lidm.desktop"
        if command -v gio >/dev/null 2>&1; then
            gio set "$DT/lidm.desktop" metadata::trusted true >/dev/null 2>&1 || true
        fi
        echo "[+] Installed desktop shortcut to $DT/lidm.desktop"
    fi
done

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi

# 7. MCP Server Registration Snippet
echo ""
echo "================================================================="
echo " MCP Server Configuration (For AI Agents & REA Integration):"
echo "================================================================="
echo "To use LIDM tools in your AI agents (Claude, Gemini CLI, Cursor),"
echo "add the following to your mcpServers configuration:"
echo ""
cat << EOF
{
  "lidm": {
    "command": "$TARGET_BIN",
    "args": ["mcp"]
  }
}
EOF

echo ""
echo "================================================================="
echo " Installation Complete!"
echo " Launch LIDM anytime by running:"
echo "   $ lidm ui"
echo " Or open 'Internet Download Manager (LIDM)' from your app menu or desktop!"
echo "================================================================="
