#!/usr/bin/env bash
set -e

###############################################################################
# 1) Start Xvfb
###############################################################################
export DISPLAY=:1
RESOLUTION="1024x768x24"

echo "[INFO] Starting Xvfb on $DISPLAY with resolution $RESOLUTION"
Xvfb "$DISPLAY" -screen 0 "$RESOLUTION" -ac +extension GLX +render -noreset &
XVFB_PID=$!

# Give Xvfb a moment to start
sleep 2

###############################################################################
# 2) Start Tint2 panel
###############################################################################
echo "[INFO] Starting Tint2"
tint2 2>/tmp/tint2_stderr.log &
TINT2_PID=$!

###############################################################################
# 3) Start Mutter
###############################################################################
echo "[INFO] Starting Mutter (window manager)"
XDG_SESSION_TYPE=x11 mutter --replace --sm-disable 2>/tmp/mutter_stderr.log &
MUTTER_PID=$!

###############################################################################
# 4) Start x11vnc
###############################################################################
echo "[INFO] Starting x11vnc on port 5900"
x11vnc -display "$DISPLAY" \
       -forever \
       -nopw \
       -listen 0.0.0.0 \
       -rfbport 5900 \
       -bg

###############################################################################
# 5) Start noVNC on port 8080 (using novnc_proxy)
###############################################################################
echo "[INFO] Starting noVNC on http://localhost:8080"
/opt/noVNC/utils/novnc_proxy \
    --vnc localhost:5900 \
    --listen 8080 \
    --web /opt/noVNC \
    > /tmp/novnc.log 2>&1 &

# Wait a few seconds for noVNC to be up, or poll until it’s listening
timeout=10
while [ $timeout -gt 0 ]; do
    if netstat -tuln | grep -q ":8080 "; then
        break
    fi
    sleep 1
    ((timeout--))
done

echo "[INFO] noVNC started successfully"

###############################################################################
# 6) Start Eliza server & client
###############################################################################
echo "[INFO] Starting Eliza server & client"
cd ~/eliza

# Source NVM so pnpm/node are in PATH
. "$NVM_DIR/nvm.sh"

# Start the server on port 3000
echo "[INFO] Starting Eliza server on port 3000"
SERVER_HOST=0.0.0.0 SERVER_PORT=3000 pnpm start &
SERVER_PID=$!

# Give the server a few seconds to initialize
sleep 5

# Start the client (Vite) on port 5173
echo "[INFO] Starting Eliza client on port 5173"
VITE_SERVER_URL=http://localhost:3000 pnpm start:client --host=0.0.0.0 &
CLIENT_PID=$!

###############################################################################
# 7) Keep container running
###############################################################################
echo "[INFO] Environment setup complete."
echo "[INFO] noVNC:     http://localhost:8080/vnc.html"
echo "[INFO] Eliza app: http://localhost:5173"

tail -f /dev/null
