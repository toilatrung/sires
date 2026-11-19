#!/usr/bin/env python3
# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
"""Linux-only, local-Docker spike. Exit nonzero for failed or unverified assertions."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import queue
import shutil
import subprocess
import tempfile
import tarfile
import threading
import time
import uuid

ROOT = Path(__file__).resolve().parent
MEMORY = 2 * 1024**3
DISK = 500 * 1000**2
DEADLINE = 120
ENGINES = ('pdflatex', 'xelatex')


def docker(*args, check=True):
    return subprocess.run(['docker', *args], capture_output=True, text=True,
                          encoding='utf-8', errors='replace', check=check, timeout=45)


def inspect(name):
    return json.loads(docker('inspect', name).stdout)[0]


def classify(timed_out, oom, result):
    if timed_out:
        return 'timeout'
    if oom:
        return 'memory_limit'
    if result is None:
        return 'runtime_error'
    if result.get('capacity_exceeded'):
        return 'memory_limit'
    return 'success' if result['exit_code'] == 0 else 'compile_error'


def verdict(scenario, row):
    result = row.get('result') or {}
    status = row['status']
    if scenario in ('article', 'thesis'):
        return status == 'success' and result.get('pdf_created') is True
    if scenario == 'shell':
        return status == 'success' and not result['shell_marker']
    if scenario == 'passwd':
        return status == 'compile_error' and result.get('passwd_denied') is True
    if scenario == 'network':
        return status == 'success' and not result['network_marker']
    if scenario == 'network-probe':
        return status == 'success' and result.get('network_blocked') is True
    if scenario == 'loop':
        return status == 'timeout'
    if scenario == 'memory':
        return status == 'memory_limit'
    if scenario == 'memory-probe':
        # Do not mistake exit 137, or a TeX capacity error, for a cgroup OOM.
        return status == 'memory_limit' and row['oom_killed'] is True
    return False


def cgroup_dir(pid):
    try:
        relative = Path(f'/proc/{pid}/cgroup').read_text().strip().split('0::')[1]
        return Path('/sys/fs/cgroup') / relative.lstrip('/')
    except (OSError, IndexError):
        return None


def read_number(path):
    try:
        return int(path.read_text())
    except (OSError, ValueError):
        return None


def run_case(image, runtime, engine, scenario, output):
    name = 'sires-spk06-' + uuid.uuid4().hex[:12]
    artifact = output / f'{runtime}-{engine}-{scenario}'
    artifact.mkdir()
    source = ROOT / 'fixtures' / scenario
    with tempfile.TemporaryDirectory(prefix='sires-spk06-input-') as temporary:
        # Read-only input contains only trusted test data, never host credentials.
        input_dir = Path(temporary)
        input_dir.chmod(0o755)
        if source.exists():
            shutil.copyfile(source / 'main.tex', input_dir / 'main.tex')
            shutil.copyfile(ROOT / 'fixtures' / 'preamble.tex', input_dir / 'preamble.tex')
        command = [
            'create', '--name', name, '--runtime', runtime, '--network=none',
            '--read-only', '--user=65532:65532', '--cap-drop=ALL',
            '--security-opt=no-new-privileges', f'--memory={MEMORY}',
            f'--memory-swap={MEMORY}', '--cpus=2', '--pids-limit=256',
            '--shm-size=1m', '--ulimit=nofile=256:256',
            '--ulimit=fsize=16777216:16777216',
            '--tmpfs', f'/work:rw,noexec,nosuid,nodev,size={DISK},uid=65532,gid=65532,mode=0700',
            '--mount', f'type=bind,src={input_dir},dst=/input,readonly',
            '--mount', f'type=bind,src={input_dir},dst=/tmp,readonly',
            '--log-driver=local', '--log-opt=max-size=4m', '--log-opt=max-file=1',
            '--log-opt=compress=false',
            image, engine, scenario,
        ]
        row = dict(runtime=runtime, engine=engine, scenario=scenario,
                   timeout_seconds=DEADLINE, memory_limit_bytes=MEMORY,
                   workspace_limit_bytes=DISK, command=['docker', *command])
        docker(*command)
        attach = None
        try:
            metadata = inspect(name)
            config = metadata['HostConfig']
            row['container_config'] = {
                key: config.get(key) for key in (
                    'Runtime', 'NetworkMode', 'ReadonlyRootfs', 'Memory',
                    'MemorySwap', 'NanoCpus', 'PidsLimit', 'CapDrop',
                    'SecurityOpt', 'Tmpfs', 'Ulimits',
                )
            }
            row['user'] = metadata['Config']['User']
            messages = queue.Queue()
            started = time.monotonic()
            attach = subprocess.Popen(['docker', 'start', '-a', name], stdout=subprocess.PIPE,
                                      stderr=subprocess.STDOUT, text=True, encoding='utf-8',
                                      errors='replace')

            def collect():
                for line in attach.stdout:
                    messages.put(line)
                messages.put(None)

            reader = threading.Thread(target=collect, daemon=True)
            reader.start()
            result, timed_out, finished = None, False, False
            peak, group = None, None
            logs = []
            next_inspect = 0
            while not finished:
                now = time.monotonic()
                if now - started >= DEADLINE:
                    timed_out = True
                    break
                if group is None and now >= next_inspect:
                    state = inspect(name)['State']
                    group = cgroup_dir(state['Pid']) if state['Pid'] else None
                    next_inspect = now + 0.2
                if group:
                    sample = read_number(group / 'memory.peak')
                    if sample is not None:
                        peak = max(peak or 0, sample)
                try:
                    line = messages.get(timeout=0.02)
                except queue.Empty:
                    continue
                if line is None:
                    finished = True
                elif line.startswith('__SPK06_RESULT__'):
                    result = json.loads(line[len('__SPK06_RESULT__'):])
                    finished = True
                else:
                    logs.append(line)
            row['wall_seconds'] = round(time.monotonic() - started, 4)
            row['cgroup_peak_bytes'] = peak
            row['cgroup_peak_source'] = 'cgroup-v2 memory.peak sampled every 20ms'
            state = inspect(name)['State']
            row['oom_killed'] = state['OOMKilled']
            row['container_exit_code'] = state['ExitCode'] if not state['Running'] else None
            row['result'] = result
            row['status'] = classify(timed_out, state['OOMKilled'], result)
            row['limit_reason'] = ('deadline' if timed_out else 'cgroup_oom' if state['OOMKilled']
                                   else 'tex_capacity' if result and result.get('capacity_exceeded') else None)
            row['passed'] = verdict(scenario, row)
            if result:
                row['isolation_verified'] = (result['uid'] == 65532
                    and result['rootfs_readonly'] and result['tmp_readonly'])
                row['passed'] = row['passed'] and row['isolation_verified']
            (artifact / 'runtime.log').write_text(''.join(logs), encoding='utf-8')
            if result and scenario not in ('network-probe', 'memory-probe'):
                filenames = ['build.log', 'main.log', 'time.txt']
                if result.get('pdf_created'):
                    filenames.append('main.pdf')
                # docker cp reads host mounts, which cannot see gVisor's guest tmpfs.
                exported = subprocess.run(
                    ['docker', 'exec', name, 'tar', '-C', '/work', '-cf', '-', *filenames],
                    capture_output=True, check=False, timeout=30,
                )
                row['artifact_export_exit_code'] = exported.returncode
                if exported.returncode == 0:
                    with tarfile.open(fileobj=io.BytesIO(exported.stdout)) as archive:
                        for filename in filenames:
                            content = archive.extractfile(filename).read()
                            (artifact / filename).write_bytes(content)
                    row['artifact_sha256'] = {
                        filename: hashlib.sha256((artifact / filename).read_bytes()).hexdigest()
                        for filename in filenames
                    }
                else:
                    row['passed'] = False
                    row['artifact_error'] = exported.stderr.decode(errors='replace')
            (artifact / 'result.json').write_text(json.dumps(row, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        finally:
            docker('rm', '-f', name, check=False)
            if attach:
                attach.wait(timeout=15)
        print(f'{runtime} {engine} {scenario}: {row["status"]}, pass={row["passed"]}, {row["wall_seconds"]}s', flush=True)
        return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('suite', choices=('measure', 'attack'))
    parser.add_argument('--image', default='sires/spk-06:texlive-2022')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--repetitions', type=int, default=3)
    args = parser.parse_args()
    if platform.system() != 'Linux':
        parser.error('Chạy trên Linux/WSL2, cùng host với Docker (đọc cgroup v2).')
    if args.repetitions < 1:
        parser.error('--repetitions phải >= 1')
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=False)
    info = json.loads(docker('info', '--format', '{{json .}}').stdout)
    if 'runsc' not in info['Runtimes']:
        parser.error('Thiếu runtime runsc; không thay bằng runc để kết luận ASM-07.')
    image = inspect(args.image)
    # Freeze tag to image ID for every case, including the baseline.
    image_id = image['Id']
    environment = dict(
        kernel=platform.release(), machine=platform.machine(),
        docker_version=info['ServerVersion'], docker_cgroup_version=info['CgroupVersion'],
        cpus=info['NCPU'], host_memory_bytes=info['MemTotal'],
        image_id=image_id, image_created=image['Created'],
        limits=dict(seconds=DEADLINE, memory_bytes=MEMORY, workspace_bytes=DISK),
        runsc=docker('info', '--format', '{{json .Runtimes.runsc}}').stdout.strip(),
        fixture_sha256={str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                        for p in sorted((ROOT / 'fixtures').rglob('*.tex'))},
        source_sha256={name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                       for name in ('Dockerfile', 'worker.py', 'spike.py', 'measure.sh', 'attack.sh')},
    )
    version = subprocess.run(['runsc', '--version'], capture_output=True, text=True, check=False)
    environment['runsc_version'] = version.stdout.strip()
    (args.output / 'environment.json').write_text(json.dumps(environment, indent=2) + '\n')
    rows = []
    try:
        if args.suite == 'measure':
            # Alternate runtime order to reduce systematic cache/order bias.
            for repeat in range(args.repetitions):
                folder = args.output / f'repeat-{repeat + 1}'
                folder.mkdir()
                for scenario in ('article', 'thesis'):
                    for engine in ENGINES:
                        for runtime in (('runc', 'runsc') if repeat % 2 == 0 else ('runsc', 'runc')):
                            rows.append(run_case(image_id, runtime, engine, scenario, folder))
        else:
            for engine in ENGINES:
                for scenario in ('shell', 'passwd', 'network', 'loop', 'memory'):
                    rows.append(run_case(image_id, 'runsc', engine, scenario, args.output))
            for scenario in ('network-probe', 'memory-probe'):
                rows.append(run_case(image_id, 'runsc', 'pdflatex', scenario, args.output))
    finally:
        (args.output / 'results.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if not rows or not all(row['passed'] for row in rows):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
