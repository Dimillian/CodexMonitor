# macOS launchd: Start Codex Monitor Daemon on Login

Use a user `LaunchAgent` so the daemon starts automatically when you log in.

## Prerequisite

Confirm the installed app binaries exist:

```bash
APP_BIN_DIR="/Applications/Codex Monitor.app/Contents/MacOS"
ls -l "$APP_BIN_DIR/codex_monitor_daemon" "$APP_BIN_DIR/codex_monitor_daemonctl"
```

## 1) Create LaunchAgent plist

Create `~/Library/LaunchAgents/com.dimillian.codexmonitor.daemon.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.dimillian.codexmonitor.daemon</string>
    <key>ProgramArguments</key>
    <array>
      <string>/Applications/Codex Monitor.app/Contents/MacOS/codex_monitor_daemon</string>
      <string>--listen</string>
      <string>127.0.0.1:4732</string>
      <string>--token</string>
      <string>YOUR_TOKEN_HERE</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/com.dimillian.codexmonitor.daemon.out.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/com.dimillian.codexmonitor.daemon.err.log</string>
  </dict>
</plist>
```

## 2) Load and start

```bash
launchctl bootout "gui/$(id -u)" ~/Library/LaunchAgents/com.dimillian.codexmonitor.daemon.plist 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.dimillian.codexmonitor.daemon.plist
launchctl kickstart -k "gui/$(id -u)/com.dimillian.codexmonitor.daemon"
```

## 3) Check status and logs

```bash
launchctl print "gui/$(id -u)/com.dimillian.codexmonitor.daemon"
tail -f /tmp/com.dimillian.codexmonitor.daemon.out.log /tmp/com.dimillian.codexmonitor.daemon.err.log
```

## 4) Disable

```bash
launchctl bootout "gui/$(id -u)" ~/Library/LaunchAgents/com.dimillian.codexmonitor.daemon.plist
```
