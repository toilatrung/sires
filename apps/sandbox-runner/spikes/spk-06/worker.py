#!/usr/bin/env python3
# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
"""Trusted in-container entry point. All fixture files are treated as untrusted."""
import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path


def main():
    engine, scenario = sys.argv[1:]
    Path('/work/tmp').mkdir()
    result = {'engine': engine, 'scenario': scenario, 'uid': os.getuid()}
    for key, filename in (('rootfs_readonly', '/SPK06_ROOT_WRITE'),
                          ('tmp_readonly', '/tmp/SPK06_TMP_WRITE')):
        try:
            Path(filename).write_text('probe')
            result[key] = False
            Path(filename).unlink()
        except OSError:
            result[key] = True
    started = time.monotonic()
    if scenario == 'network-probe':
        # Separate from TeX shell escape: proves the container network boundary.
        try:
            with socket.create_connection(('1.1.1.1', 443), timeout=3):
                result['network_blocked'] = False
        except OSError as exc:
            result.update(network_blocked=True, network_error=str(exc))
        result['exit_code'] = 0
    elif scenario == 'memory-probe':
        # Independent cgroup control: TeX normally hits its own capacity first.
        chunks = []
        while True:
            chunks.append(bytearray(32 * 1024 * 1024))
            time.sleep(0.01)
    else:
        shutil.copytree('/input', '/work', dirs_exist_ok=True)
        command = [
            '/usr/bin/time', '-f', '%e %M', '-o', '/work/time.txt',
            'latexmk', '-norc', '-pdf' if engine == 'pdflatex' else '-xelatex',
            '-interaction=nonstopmode', '-halt-on-error', '-file-line-error',
            '-no-shell-escape', 'main.tex',
        ]
        with Path('/work/build.log').open('wb') as log:
            completed = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT,
                                       check=False)
        build_log = Path('/work/build.log').read_text(errors='replace')
        tex_log = Path('/work/main.log').read_text(errors='replace')
        bibtex_log = Path('/work/main.blg')
        result.update(
            exit_code=completed.returncode,
            pdf_created=Path('/work/main.pdf').is_file(),
            shell_marker=Path('/work/SHELL_EXECUTED').exists(),
            network_marker=Path('/work/NETWORK_EXECUTED').exists(),
            passwd_denied='Not reading from /etc/passwd' in build_log,
            capacity_exceeded='TeX capacity exceeded' in build_log,
            bibtex_ran=bibtex_log.exists() and 'This is BibTeX' in bibtex_log.read_text(errors='replace'),
            bibliography_created=Path('/work/main.bbl').is_file(),
            natbib_loaded='natbib.sty' in tex_log,
            log_tail=build_log[-16000:],
        )
        timing = Path('/work/time.txt').read_text().splitlines()[-1].split()
        result.update(latexmk_seconds=float(timing[0]), process_max_rss_kib=int(timing[1]))
    result['worker_seconds'] = round(time.monotonic() - started, 4)
    print('__SPK06_RESULT__' + json.dumps(result, ensure_ascii=False), flush=True)
    # Host captures the cgroup memory.peak and artifacts before removing the cgroup.
    time.sleep(600)


if __name__ == '__main__':
    main()
