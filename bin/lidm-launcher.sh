#!/usr/bin/env bash
# LIDM Debian/Linux Desktop Launcher

if [ -x "$HOME/.nvm/versions/node/v24.19.0/bin/node" ]; then
    NODE_BIN="$HOME/.nvm/versions/node/v24.19.0/bin/node"
elif command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
elif [ -x "/usr/bin/node" ]; then
    NODE_BIN="/usr/bin/node"
else
    NODE_BIN="node"
fi

REAL_SCRIPT="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$REAL_SCRIPT")/.." && pwd)"

# If executed without args or with 'ui', check if server is running
CMD="${1:-ui}"
if [ "$CMD" = "ui" ] || [ -z "$1" ]; then
    # Check if LIDM server is already responding on port 3030
    if curl -s --max-time 1 http://localhost:3030/api/tasks >/dev/null 2>&1; then
        echo "[+] LIDM server is already active."
    else
        echo "[+] Starting LIDM background engine..."
        mkdir -p "$HOME/.lidm"
        nohup "$NODE_BIN" "$SCRIPT_DIR/dist/lidm.js" server >> "$HOME/.lidm/server.log" 2>&1 &
        # Wait up to 3 seconds for server to start
        for i in {1..15}; do
            if curl -s --max-time 1 http://localhost:3030/api/tasks >/dev/null 2>&1; then
                break
            fi
            sleep 0.2
        done
    fi

    # Launch desktop window as standalone native application
    if [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; then
        # 1. Native GTK3 + WebKit2 standalone app (100% independent, no browser UI)
        if command -v python3 >/dev/null 2>&1 && python3 -c "import gi; gi.require_version('Gtk', '3.0'); gi.require_version('WebKit2', '4.1')" 2>/dev/null; then
            exec python3 "$SCRIPT_DIR/bin/lidm-app.py" "http://localhost:3030"
        # 2. Fallback: Isolated app window with dedicated user-data-dir (never merges into regular browser tabs)
        elif command -v brave-browser >/dev/null 2>&1; then
            exec brave-browser --app=http://localhost:3030 --user-data-dir="$HOME/.lidm/browser-profile" --class=lidm
        elif command -v google-chrome >/dev/null 2>&1; then
            exec google-chrome --app=http://localhost:3030 --user-data-dir="$HOME/.lidm/browser-profile" --class=lidm
        elif command -v chromium >/dev/null 2>&1; then
            exec chromium --app=http://localhost:3030 --user-data-dir="$HOME/.lidm/browser-profile" --class=lidm
        elif command -v xdg-open >/dev/null 2>&1; then
            exec xdg-open http://localhost:3030
        fi
    fi
    exit 0
fi

# For any other CLI commands (add, list, pause, mcp, etc.), run directly in foreground
exec "$NODE_BIN" "$SCRIPT_DIR/dist/lidm.js" "$@"
