#!/usr/bin/env bash
set -euo pipefail

# Install desktop-session autostart for Linux. This deliberately uses the
# graphical desktop's autostart mechanism, not a virtual display or a
# remote-desktop stack.

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
install_dir=${1:-$(dirname "$script_dir")}
install_dir=$(CDPATH= cd -- "$install_dir" && pwd)
node_bin=${NODE_BIN:-$(command -v node || true)}
runtime_dir=${CONDUIT_HOME:-"$HOME/.conduit"}
launcher_dir="$runtime_dir/bin"
launcher_file="$launcher_dir/conduit-bridge-start"
autostart_home=${XDG_CONFIG_HOME:-"$HOME/.config"}
autostart_dir="$autostart_home/autostart"
autostart_file="$autostart_dir/conduit-bridge.desktop"

if [[ -z "$node_bin" ]]; then
  echo 'Node.js was not found on PATH.' >&2
  exit 1
fi
if [[ ! -f "$install_dir/dist/cli.js" ]]; then
  echo "Built CLI not found at $install_dir/dist/cli.js. Run npm run build first." >&2
  exit 1
fi

mkdir -p "$autostart_dir"
mkdir -p "$launcher_dir"
cat > "$launcher_file" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export CONDUIT_HOME="$runtime_dir"
cd "$install_dir"
exec "$node_bin" "$install_dir/dist/cli.js" start --host=127.0.0.1 --port=31338
EOF
chmod 0755 "$launcher_file"

cat > "$autostart_file" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Conduit Bridge
Comment=Start the local OpenAI-compatible Conduit Bridge
Exec="$launcher_file"
Terminal=false
X-GNOME-Autostart-enabled=true
EOF
chmod 0644 "$autostart_file"

echo "Installed Linux desktop autostart: $autostart_file"
echo "Installed Conduit launcher: $launcher_file"
echo 'It starts at the next graphical login. The bridge listens only on 127.0.0.1:31338.'
