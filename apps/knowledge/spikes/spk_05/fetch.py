# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Download the SPK-05 sample set listed in samples.csv into a folder outside the repository.

Only the URL list is committed (ticket "Không gồm": no PDF in the repo). A URL that fails is skipped and logged
(EC03); a file whose sha256 differs from the manifest is kept aside and logged too.

    python -m spikes.spk_05.fetch [--data DIR] [--manifest samples.csv] [--update-manifest]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "samples.csv"
USER_AGENT = "sires-spk05-fetch/1.0 (research spike; python-urllib)"
POLITE_DELAY_S = {"export.arxiv.org": 3.0}  # arXiv asks automated clients to wait between requests


def data_dir(arg: str | None = None) -> Path:
    path = Path(arg or os.environ.get("SPK05_DATA") or Path.home() / ".cache" / "sires-spk05")
    path.mkdir(parents=True, exist_ok=True)
    return path


def read_manifest(path: Path = MANIFEST) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


@dataclass
class Fetched:
    id: str
    kind: str  # pdf or truth
    url: str
    ok: bool
    status: str  # downloaded, cached, http_<code>, error: ..., sha256_mismatch, not_pdf
    bytes: int = 0
    sha256: str = ""
    seconds: float = 0.0


def _get(url: str, timeout: float) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # URLs come from samples.csv only
        data: bytes = response.read()
        return data


def fetch_one(sample_id: str, kind: str, url: str, target: Path, expected: str, timeout: float) -> Fetched:
    start = time.perf_counter()
    if target.exists():
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        if not expected or digest == expected:
            return Fetched(sample_id, kind, url, True, "cached", target.stat().st_size, digest)
    host = urlparse(url).hostname or ""
    time.sleep(POLITE_DELAY_S.get(host, 0.5))
    try:
        data = _get(url, timeout)
    except urllib.error.HTTPError as exc:
        return Fetched(sample_id, kind, url, False, f"http_{exc.code}", seconds=round(time.perf_counter() - start, 2))
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        return Fetched(sample_id, kind, url, False, f"error: {reason}", seconds=round(time.perf_counter() - start, 2))
    digest = hashlib.sha256(data).hexdigest()
    seconds = round(time.perf_counter() - start, 2)
    if kind == "pdf" and b"%PDF-" not in data[:1024]:
        return Fetched(sample_id, kind, url, False, "not_pdf", len(data), digest, seconds)
    if expected and digest != expected:
        target.with_suffix(target.suffix + ".mismatch").write_bytes(data)
        return Fetched(sample_id, kind, url, False, "sha256_mismatch", len(data), digest, seconds)
    target.write_bytes(data)
    return Fetched(sample_id, kind, url, True, "downloaded", len(data), digest, seconds)


def fetch_all(rows: list[dict[str, str]], data: Path, timeout: float = 120.0) -> list[Fetched]:
    results: list[Fetched] = []
    for row in rows:
        results.append(
            fetch_one(row["id"], "pdf", row["url"], data / f"{row['id']}.pdf", row.get("sha256", ""), timeout)
        )
        if row.get("truth_url"):
            results.append(
                fetch_one(
                    row["id"],
                    "truth",
                    row["truth_url"],
                    data / f"{row['id']}.xml",
                    row.get("truth_sha256", ""),
                    timeout,
                )
            )
        print(f"{row['id']:32} " + "  ".join(f"{r.kind}:{r.status}" for r in results if r.id == row["id"]), flush=True)
    return results


def update_manifest(path: Path, rows: list[dict[str, str]], results: list[Fetched]) -> None:
    by_key = {(r.id, r.kind): r for r in results if r.ok}
    fields = list(rows[0].keys())
    if "truth_sha256" not in fields:
        fields.append("truth_sha256")
    for row in rows:
        pdf = by_key.get((row["id"], "pdf"))
        truth = by_key.get((row["id"], "truth"))
        if pdf:
            row["bytes"], row["sha256"] = str(pdf.bytes), pdf.sha256
        row["truth_sha256"] = truth.sha256 if truth else row.get("truth_sha256", "")
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", help="target folder (default $SPK05_DATA or ~/.cache/sires-spk05)")
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--update-manifest", action="store_true", help="write sha256 and size back to the manifest")
    args = parser.parse_args(argv)
    data = data_dir(args.data)
    rows = read_manifest(args.manifest)
    results = fetch_all(rows, data)
    log = data / f"fetch-log-{args.manifest.stem}.json"
    log.write_text(json.dumps([asdict(r) for r in results], indent=2), encoding="utf-8")
    failed = [r for r in results if not r.ok]
    print(
        f"{len(results) - len(failed)}/{len(results)} files ok; skipped: {[(r.id, r.kind, r.status) for r in failed]}"
    )
    print(f"log: {log}")
    if args.update_manifest:
        update_manifest(args.manifest, rows, results)
    return 0


if __name__ == "__main__":
    sys.exit(main())
