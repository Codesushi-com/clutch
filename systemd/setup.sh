#!/bin/bash
# Systemd service setup script for OpenClutch
# Generates .service files from templates with user-provided paths

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${INSTALL_DIR:-$(dirname "$SCRIPT_DIR")}"
USER_NAME="${USER_NAME:-$USER}"

# Auto-detect Node path if not provided
if [ -z "$NODE_PATH" ]; then
    if command -v volta &> /dev/null; then
        NODE_PATH="$HOME/.volta/tools/image/node/$(volta list node | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)/bin/node"
    elif command -v node &> /dev/null; then
        NODE_PATH=$(command -v node)
    else
        echo "Error: Could not find node. Please set NODE_PATH explicitly."
        exit 1
    fi
fi

echo "Generating systemd service files..."
echo "  Install directory: $INSTALL_DIR"
echo "  Node path: $NODE_PATH"
echo "  User: $USER_NAME"
echo ""

for template in "$SCRIPT_DIR"/*.service.template; do
    [ -e "$template" ] || continue
    
    filename=$(basename "$template" .template)
    output="$SCRIPT_DIR/$filename"
    
    echo "Creating $filename..."
    sed -e "s|{{INSTALL_DIR}}|$INSTALL_DIR|g" \
        -e "s|{{NODE_PATH}}|$NODE_PATH|g" \
        -e "s|{{USER}}|$USER_NAME|g" \
        "$template" > "$output"
done

echo ""
echo "Service files generated successfully!"
echo ""
echo "To install the services:"
echo "  1. Copy the .service files to your systemd user directory:"
echo "     cp $SCRIPT_DIR/*.service ~/.config/systemd/user/"
echo "  2. Reload systemd:"
echo "     systemctl --user daemon-reload"
echo "  3. Enable and start services:"
echo "     systemctl --user enable clutch-server clutch-loop clutch-bridge clutch-session-watcher"
echo "     systemctl --user start clutch-server clutch-loop clutch-bridge clutch-session-watcher"
echo ""
echo "To customize paths, set environment variables before running this script:"
echo "  INSTALL_DIR=/path/to/clutch NODE_PATH=/path/to/node $0"
