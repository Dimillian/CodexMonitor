#!/usr/bin/env python3
"""ACP smoke test for agents speaking JSON-RPC 2.0 over stdio.

Runs a minimal ACP flow:
- initialize
- session/new
- session/prompt

Usage:
  python3 scripts/acp_smoke.py
  COPILOT_BIN=/path/to/copilot python3 scripts/acp_smoke.py
"""

from __future__ import annotations

import json
import os
import selectors
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional, Tuple, cast


def _now_ms() -> int:
    return int(time.time() * 1000)


def _fail(message: str, detail: Any = None) -> None:
    payload = {
        "ok": False,
        "error": message,
        "detail": detail,
    }
    sys.stdout.write(json.dumps(payload, indent=2) + "\n")
    raise SystemExit(1)


def _send(proc: subprocess.Popen[bytes], obj: Dict[str, Any]) -> None:
    if proc.stdin is None:
        _fail("missing stdin")
    line = json.dumps(obj, separators=(",", ":"), ensure_ascii=True)
    stdin = cast(Any, proc.stdin)
    stdin.write((line + "\n").encode("utf-8"))
    stdin.flush()


def _readline(proc: subprocess.Popen[bytes], timeout_ms: int) -> Optional[str]:
    # Deprecated: kept for compatibility; not used by the non-blocking pump.
    _ = (proc, timeout_ms)
    return None


def _as_request(req_id: int, method: str, params: Any) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}


def _assert_envelope(msg: Any, label: str) -> None:
    if not isinstance(msg, dict):
        _fail(f"{label}: not an object", msg)
    if msg.get("jsonrpc") != "2.0":
        _fail(f"{label}: missing/invalid jsonrpc", msg)


def main() -> None:
    bin_path = os.environ.get("COPILOT_BIN", "copilot").strip() or "copilot"
    args = [bin_path, "--acp", "--stdio"]

    proc: Optional[subprocess.Popen[bytes]] = None
    try:
        proc = subprocess.Popen(
            args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except FileNotFoundError as e:
        _fail("failed to spawn copilot (not found)", str(e))
    except Exception as e:
        _fail("failed to spawn copilot", str(e))

    if proc is None:
        _fail("failed to spawn copilot")

    # Help type checkers: proc is non-None after this point.
    proc = cast(subprocess.Popen[bytes], proc)

    pending_by_id: Dict[str, Dict[str, Any]] = {}
    notifications: List[Dict[str, Any]] = []
    transcript_stdout: List[str] = []
    transcript_stderr: List[str] = []

    if proc.stdout is None or proc.stderr is None:
        _fail("missing stdout/stderr")

    sel = selectors.DefaultSelector()
    stdout = cast(Any, proc.stdout)
    stderr = cast(Any, proc.stderr)
    sel.register(stdout, selectors.EVENT_READ, data="stdout")
    sel.register(stderr, selectors.EVENT_READ, data="stderr")

    buffers: Dict[str, str] = {"stdout": "", "stderr": ""}

    def _drain_ready(timeout_s: float) -> List[Tuple[str, str]]:
        """Return list of (stream_name, line) lines."""
        out: List[Tuple[str, str]] = []
        for key, _mask in sel.select(timeout=timeout_s):
            stream_name = cast(str, key.data)
            try:
                fileobj = cast(Any, key.fileobj)
                chunk = fileobj.read1(65536)
            except AttributeError:
                fileobj = cast(Any, key.fileobj)
                chunk = fileobj.read(65536)
            if not chunk:
                continue
            text = chunk.decode("utf-8", errors="replace")
            buffers[stream_name] += text
            while True:
                idx = buffers[stream_name].find("\n")
                if idx == -1:
                    break
                line = buffers[stream_name][:idx].strip()
                buffers[stream_name] = buffers[stream_name][idx + 1 :]
                if line:
                    out.append((stream_name, line))
        return out

    def pump_until_response(target_id: int, timeout_ms: int) -> Dict[str, Any]:
        target_key = str(target_id)
        start = _now_ms()
        while _now_ms() - start <= timeout_ms:
            if proc.poll() is not None:
                # Drain anything left for context
                _drain_ready(0)
                _fail(
                    f"process exited before response id={target_id}",
                    {
                        "returncode": proc.returncode,
                        "stdout": transcript_stdout[-50:],
                        "stderr": transcript_stderr[-200:],
                    },
                )

            for stream_name, line in _drain_ready(timeout_s=0.25):
                if stream_name == "stdout":
                    transcript_stdout.append(line)
                    try:
                        msg = json.loads(line)
                    except Exception:
                        continue
                    if isinstance(msg, dict) and "id" in msg and (
                        "result" in msg or "error" in msg
                    ):
                        pending_by_id[str(msg.get("id"))] = msg
                    elif isinstance(msg, dict) and isinstance(msg.get("method"), str):
                        notifications.append(msg)
                else:
                    transcript_stderr.append(line)

            if target_key in pending_by_id:
                return pending_by_id[target_key]

        _fail(
            f"timeout waiting for response id={target_id}",
            {
                "stdout": transcript_stdout[-50:],
                "stderr": transcript_stderr[-200:],
                "notificationMethods": sorted(
                    [
                        cast(str, n.get("method"))
                        for n in notifications
                        if isinstance(n.get("method"), str)
                    ]
                ),
            },
        )

        # Unreachable.
        return {}

    # 1) initialize
    init_id = 0
    _send(
        proc,
        _as_request(
            init_id,
            "initialize",
            {
                "protocolVersion": 1,
                "clientCapabilities": {"fs": {"readTextFile": True, "writeTextFile": True}, "terminal": True},
                "clientInfo": {"name": "codex-monitor-acp-smoke", "title": "CodexMonitor ACP Smoke", "version": "0.0.0"},
            },
        ),
    )
    init_resp = pump_until_response(init_id, timeout_ms=15000)
    _assert_envelope(init_resp, "initialize response")
    if init_resp.get("error") is not None:
        _fail("initialize returned error", init_resp)
    protocol_version = init_resp.get("result", {}).get("protocolVersion")
    if not isinstance(protocol_version, int):
        _fail("initialize result missing protocolVersion", init_resp)

    # 2) session/new
    new_id = 1
    _send(
        proc,
        _as_request(
            new_id,
            "session/new",
            {"cwd": os.path.abspath(os.getcwd()), "mcpServers": []},
        ),
    )
    new_resp = pump_until_response(new_id, timeout_ms=15000)
    _assert_envelope(new_resp, "session/new response")
    if new_resp.get("error") is not None:
        _fail("session/new returned error", new_resp)
    session_id = new_resp.get("result", {}).get("sessionId")
    if not isinstance(session_id, str) or not session_id.strip():
        _fail("session/new result missing sessionId", new_resp)

    # 3) session/prompt
    prompt_id = 2
    _send(
        proc,
        _as_request(
            prompt_id,
            "session/prompt",
            {"sessionId": session_id, "prompt": [{"type": "text", "text": "Reply with a short greeting."}]},
        ),
    )
    prompt_resp = pump_until_response(prompt_id, timeout_ms=60000)
    _assert_envelope(prompt_resp, "session/prompt response")
    if prompt_resp.get("error") is not None:
        _fail("session/prompt returned error", prompt_resp)
    stop_reason = prompt_resp.get("result", {}).get("stopReason")
    if not isinstance(stop_reason, str):
        _fail("session/prompt result missing stopReason", prompt_resp)

    saw_update = False
    for n in notifications:
        if n.get("method") == "session/update":
            params = n.get("params")
            if isinstance(params, dict) and params.get("sessionId") == session_id:
                saw_update = True
                break

    methods = sorted(
        [cast(str, n.get("method")) for n in notifications if isinstance(n.get("method"), str)]
    )

    report = {
        "ok": True,
        "bin": bin_path,
        "args": ["--acp", "--stdio"],
        "protocolVersion": protocol_version,
        "sessionId": session_id,
        "stopReason": stop_reason,
        "sawSessionUpdate": saw_update,
        "notificationMethods": methods,
        "stderrTail": transcript_stderr[-50:],
    }

    try:
        proc.kill()
    except Exception:
        pass

    sys.stdout.write(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
