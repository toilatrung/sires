#!/usr/bin/env python3
# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
"""Container supervisor; phase deadlines kill the whole child process group."""

import json
import os
import shutil
import signal
import struct
import subprocess
import time
import zlib
from pathlib import Path


def phase(name, command, timeout, extra_env=None):
    started = time.monotonic()
    env = {**os.environ, **(extra_env or {})}
    with open(f"/work/{name}.stdout", "w") as out, open(f"/work/{name}.stderr", "w") as err:
        process = subprocess.Popen(
            ["/usr/bin/time", "-v", "-o", f"/work/{name}.time", *command],
            stdout=out,
            stderr=err,
            env=env,
            start_new_session=True,
        )
        try:
            code = process.wait(timeout=timeout)
            timed_out = False
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            code, timed_out = -signal.SIGKILL, True
    return {"exitCode": code, "timeout": timed_out, "seconds": time.monotonic() - started}


def main():
    for name in ["tmp", "cache", "config"]:
        Path("/work", name).mkdir(exist_ok=True)
    shutil.copy("/input/input.mmd", "/work/input.mmd")
    case = json.loads(Path("/input/case.json").read_text())
    result = {"case": case["name"], "uid": os.getuid(), "phases": {}}
    for location in ["/etc/spk-write-probe", "/tmp/spk-write-probe"]:
        try:
            Path(location).write_text("probe")
            result.setdefault("unexpectedWritable", []).append(location)
        except OSError:
            pass
    parsed = phase(
        "parse",
        ["node", "/opt/spk-07/parse.mjs"],
        case.get("parseTimeout", 30),
        {"SPK_STALL_PARSE": "1"} if case.get("stallParse") else {},
    )
    result["phases"]["parse"] = parsed
    if parsed["timeout"]:
        result.update(ok=False, code="timeout", stage="parse")
    elif parsed["exitCode"]:
        details = json.loads(Path("/work/parse.json").read_text()) if Path("/work/parse.json").exists() else {}
        result.update(ok=False, code=details.get("code", "parse_error"), stage="parse", detail=details)
    else:
        env = {}
        if case.get("badBrowser"):
            env["SPK_BAD_BROWSER"] = "1"
        if case.get("stallRender"):
            env["SPK_STALL_RENDER"] = "1"
        rendered = phase("render", ["node", "/opt/spk-07/render.mjs"], case.get("renderTimeout", 120), env)
        result["phases"]["render"] = rendered
        if rendered["timeout"]:
            result.update(ok=False, code="timeout", stage="render")
        elif rendered["exitCode"]:
            details = json.loads(Path("/work/render.json").read_text()) if Path("/work/render.json").exists() else {}
            result.update(ok=False, code=details.get("code", "render_error"), stage="render", detail=details)
        else:
            converted = phase(
                "pdf",
                ["/bin/false"]
                if case.get("failPdf")
                else ["rsvg-convert", "--format=pdf", "--output=/work/output.pdf", "/work/output.svg"],
                120,
            )
            result["phases"]["pdf"] = converted
            if converted["exitCode"]:
                fallback = phase("png", ["node", "/opt/spk-07/render.mjs"], 120, {"SPK_PNG": "1"})
                result["phases"]["png"] = fallback
                if fallback["exitCode"] == 0:
                    # Chromium sets pixel scale but not PNG resolution metadata.
                    png = Path("/work/output.png")
                    data = png.read_bytes()
                    payload = b"pHYs" + struct.pack(">IIB", round(300 / 0.0254), round(300 / 0.0254), 1)
                    chunk = struct.pack(">I", 9) + payload + struct.pack(">I", zlib.crc32(payload))
                    png.write_bytes(data[:33] + chunk + data[33:])
                result.update(
                    ok=fallback["exitCode"] == 0,
                    code="png_fallback" if fallback["exitCode"] == 0 else "render_error",
                    warning="PDF conversion failed; Chromium PNG at 300 dpi",
                )
            else:
                result.update(ok=True, code="ok")
    result["artifacts"] = {p.name: p.stat().st_size for p in Path("/work").glob("output.*")}
    Path("/work/result.json").write_text(json.dumps(result, indent=2))
    evidence = Path("/work/evidence")
    evidence.mkdir()
    for item in Path("/work").iterdir():
        if item.is_file():
            shutil.copy(item, evidence / item.name)
    print("SPK_DONE", flush=True)
    # tmpfs disappears on stop; keep the job alive for the host to copy evidence.
    time.sleep(600)
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
