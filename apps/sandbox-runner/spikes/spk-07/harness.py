#!/usr/bin/env python3
# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
"""Sequential, disposable Docker jobs; keep raw artifacts, exit status and metrics."""

import argparse
import hashlib
import io
import json
import platform
import subprocess
import tarfile
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def docker(*args, check=True):
    result = subprocess.run(["docker", *map(str, args)], check=False, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(f"Docker {args[0]} failed: {result.stderr}")
    return result


def cases():
    inputs = {p.stem: p.read_text() for p in sorted((HERE / "fixtures").glob("*.mmd"))}
    items = [
        {"name": name, "source": source, "expected": "ok"}
        for name, source in inputs.items()
        if not name.startswith(("invalid", "external"))
    ]
    items += [
        {"name": "invalid-syntax", "source": inputs["invalid-syntax"], "expected": "syntax_error", "expectedLine": 3},
        {"name": "external-image", "source": inputs["external-image"], "expected": "network_blocked"},
        {"name": "external-link", "source": inputs["external-link"], "expected": "ok"},
        {
            "name": "large",
            "source": "%% SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0\nflowchart TD\n"
            + "\n".join(f"n{i} --> n{i + 1}" for i in range(350)),
            "expected": ["ok", "timeout"],
        },
        {"name": "render-failure", "source": inputs["flowchart"], "badBrowser": True, "expected": "render_error"},
        {
            "name": "parse-timeout",
            "source": inputs["flowchart"],
            "stallParse": True,
            "parseTimeout": 0.5,
            "expected": "timeout",
        },
        {
            "name": "render-timeout",
            "source": inputs["flowchart"],
            "stallRender": True,
            "renderTimeout": 0.5,
            "expected": "timeout",
        },
        {"name": "pdf-fallback", "source": inputs["flowchart"], "failPdf": True, "expected": "png_fallback"},
    ]
    return items


def run_case(case, image, runtime, output):
    output.mkdir(parents=True, exist_ok=False)
    with tempfile.TemporaryDirectory(prefix="sires-spk07-") as temporary:
        input_dir = Path(temporary)
        (input_dir / "input.mmd").write_text(case["source"])
        (input_dir / "case.json").write_text(json.dumps({k: v for k, v in case.items() if k != "source"}))
        input_dir.chmod(0o755)
        create = docker(
            "create",
            "--runtime",
            runtime,
            "--network=none",
            "--read-only",
            "--user=65532:65532",
            "--memory=2g",
            "--memory-swap=2g",
            "--cpus=2",
            "--pids-limit=256",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--tmpfs=/work:rw,nosuid,nodev,size=500000000,mode=1777",
            "--tmpfs=/tmp:ro,nosuid,nodev,size=1048576,mode=1777",
            "--mount",
            f"type=bind,src={input_dir},dst=/input,readonly",
            image,
        )
        container = create.stdout.strip()
        memory_peak = 0
        started = time.monotonic()
        try:
            docker("start", container)
            state = json.loads(docker("inspect", container).stdout)[0]
            pid = state["State"]["Pid"]
            cgroup = None
            try:
                relative = Path(f"/proc/{pid}/cgroup").read_text().split("0::", 1)[1].strip()
                cgroup = Path("/sys/fs/cgroup", relative.lstrip("/"), "memory.peak")
            except (OSError, IndexError):
                pass
            while time.monotonic() - started < 400:
                if cgroup and cgroup.exists():
                    memory_peak = max(memory_peak, int(cgroup.read_text()))
                logs = docker("logs", container)
                if "SPK_DONE" in logs.stdout:
                    break
                state = json.loads(docker("inspect", container).stdout)[0]
                if not state["State"]["Running"]:
                    raise RuntimeError(f"container exited before evidence: {state['State']}; {logs.stderr}")
                time.sleep(0.1)
            else:
                raise TimeoutError("host deadline 400 s exceeded")
            # Docker cp cannot see mounts inside gVisor's guest filesystem.
            archive = subprocess.run(
                ["docker", "exec", container, "tar", "-C", "/work/evidence", "-cf", "-", "."],
                check=True,
                capture_output=True,
            )
            with tarfile.open(fileobj=io.BytesIO(archive.stdout)) as bundle:
                bundle.extractall(output, filter="data")
            (output / "container-inspect.json").write_text(docker("inspect", container).stdout)
            (output / "container.txt").write_text(logs.stdout + logs.stderr)
            result = json.loads((output / "result.json").read_text())
            result.update(
                hostSeconds=time.monotonic() - started,
                cgroupPeakBytes=memory_peak,
                sourceSha256=hashlib.sha256(case["source"].encode()).hexdigest(),
                runtime=runtime,
            )
            expected = case["expected"] if isinstance(case["expected"], list) else [case["expected"]]
            result["expected"] = expected
            result["passed"] = (
                result["code"] in expected and result["uid"] == 65532 and not result.get("unexpectedWritable")
            )
            if result["code"] == "ok":
                result["passed"] &= (output / "output.svg").is_file() and (
                    output / "output.pdf"
                ).read_bytes().startswith(b"%PDF-")
            if case["name"] == "invalid-syntax":
                result["passed"] &= result.get("detail", {}).get("line") == case["expectedLine"]
            if case["name"] == "external-image":
                result["passed"] &= bool(result.get("detail", {}).get("blockedRequests"))
            if result["code"] == "png_fallback":
                png = (output / "output.png").read_bytes()
                result["passed"] &= png.startswith(b"\x89PNG\r\n\x1a\n") and b"pHYs" in png
            (output / "result.json").write_text(json.dumps(result, indent=2))
            return result
        finally:
            docker("rm", "-f", container, check=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", default="sires/spk-07:mermaid-11.12.0")
    parser.add_argument("--runtime", default="runsc")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--case", action="append", help="Select case(s); default all")
    parser.add_argument("--repetitions", type=int, default=1)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if (args.output / "summary.json").exists():
        raise SystemExit("Use a new output directory; never overwrite earlier evidence.")
    metadata = {
        "platform": platform.platform(),
        "image": json.loads(docker("image", "inspect", args.image).stdout),
        "docker": docker("version").stdout,
        "runtime": args.runtime,
        "runsc": subprocess.run(["runsc", "--version"], capture_output=True, text=True).stdout,
    }
    (args.output / "environment.json").write_text(json.dumps(metadata, indent=2))
    results = []
    selected = [c for c in cases() if not args.case or c["name"] in args.case]
    if not selected or args.repetitions < 1:
        raise SystemExit("No cases selected or invalid repetitions")
    for repetition in range(1, args.repetitions + 1):
        for case in selected:
            result = run_case(case, args.image, args.runtime, args.output / f"{case['name']}-{repetition}")
            results.append(result)
            (args.output / "summary.json").write_text(json.dumps(results, indent=2))
            print(
                f"{case['name']} #{repetition}: {result['code']}, {result['hostSeconds']:.2f}s, "
                f"{result['cgroupPeakBytes'] / 1048576:.1f} MiB, passed={result['passed']}",
                flush=True,
            )
    return 0 if all(r["passed"] for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
