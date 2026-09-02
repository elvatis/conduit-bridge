#!/usr/bin/env bash
set -euo pipefail

autostart_home=${XDG_CONFIG_HOME:-"$HOME/.config"}
autostart_file="$autostart_home/autostart/conduit-bridge.desktop"
runtime_dir=${CONDUIT_HOME:-"$HOME/.conduit"}
launcher_file="$runtime_dir/bin/conduit-bridge-start"

if [[ -f "$autostart_file" ]]; then
  rm -f -- "$autostart_file"
  echo "Removed Linux desktop autostart: $autostart_file"
else
  echo 'Linux desktop autostart is not installed.'
fi
if [[ -f "$launcher_file" ]]; then
  rm -f -- "$launcher_file"
  echo "Removed Conduit launcher: $launcher_file"
fi
