#!/usr/bin/env bash
# Restart the controller bridge in the background. Run on the Pi: bash ~/taxi-controller/restart.sh
cd "$(dirname "$0")"
pkill -f "[b]ridge\.py" ; sleep 1
setsid -f "$HOME/Interactive-Lab-Hub/Lab 4/.venv/bin/python" -u bridge.py > bridge.log 2>&1 < /dev/null
sleep 3; cat bridge.log
