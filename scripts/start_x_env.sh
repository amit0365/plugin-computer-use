#!/usr/bin/env bash
set -e

# Script: start_x_env.sh
# Purpose: Starts Xvfb, x11vnc, noVNC, and an optional window manager on a headless Ubuntu server.

# Variables (tweak as needed)
DISPLAY_NUM="${DISPLAY_NUM:-1}"
WIDTH="${WIDTH:-1024}"
HEIGHT="${HEIGHT:-768}"
DEPTH="24"
VNCPORT="${VNCPORT:-5900}"
NOVNCPORT="${NOVNCPORT:-8080}"
DISPLAY=":$DISPLAY_NUM"

# 1. Start Xvfb
echo "[INFO] Starting Xvfb on $DISPLAY with resolution ${WIDTH}x${HEIGHT}x${DEPTH}"
Xvfb "$DISPLAY" -screen 0 "${WIDTH}x${HEIGHT}x${DEPTH}" -ac +extension GLX +render -noreset &
sleep 2

# 2. Start x11vnc
echo "[INFO] Starting x11vnc on port $VNCPORT"
x11vnc -display "$DISPLAY" -forever -nopw -rfbport "$VNCPORT" -bg
sleep 1

# 3. Start noVNC
if [[ -d /opt/noVNC ]]; then
  echo "[INFO] Starting noVNC on port $NOVNCPORT"
  cd /opt/noVNC
  ./utils/launch.sh --vnc localhost:"$VNCPORT" --listen "$NOVNCPORT" &
  cd - > /dev/null
else
  echo "[WARN] /opt/noVNC not found; skipping noVNC startup."
fi

# 4. Start a window manager & panel
echo "[INFO] Starting mutter (window manager) and tint2 (panel)"
mutter --display="$DISPLAY" --background &> /dev/null &
tint2 &> /dev/null &

echo "[INFO] X environment started. You can connect via VNC or noVNC (if configured)."

# Keep the script in the foreground
# In a real scenario, you might want a foreground process here:
exec bash
