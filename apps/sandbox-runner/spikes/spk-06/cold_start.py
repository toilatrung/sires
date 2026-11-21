#!/usr/bin/env python3
# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Cold start of the SPK-06 sandbox: Docker containers and Kubernetes pods (PID-00031, architecture 9.5).

Every case starts a new container or pod from an image already on the host/node and builds the
small Default fixture once with pdfLaTeX. The in-sandbox process prints a ready marker as its first
statement and then runs worker.py unchanged, so sandbox start-up and TeX time are measured apart.
Linux only; exit nonzero when a case fails to build or a measurement is missing.
"""
import argparse
import base64
import hashlib
import http.client
import json
import math
import platform
import queue
import re
import shutil
import socket
import ssl
import statistics
import subprocess
import tempfile
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, urlparse

from spike import DEADLINE, DISK, MEMORY, classify, docker, inspect, verdict

ROOT = Path(__file__).resolve().parent
ENGINE = 'pdflatex'
SCENARIO = 'default'
READY = '__SPK06_READY__'
RESULT = '__SPK06_RESULT__'
# First statement after interpreter start-up, then worker.py exactly as in the image ENTRYPOINT.
BOOT = (f"import runpy; print({READY!r}, flush=True); "
        "runpy.run_path('/opt/spk-06/worker.py', run_name='__main__')")
SOURCES = ('cold_start.py', 'cold-start.sh', 'cold-start-kind.yaml', 'cold-start-k8s.yaml',
           'spike.py', 'worker.py', 'Dockerfile')
NAMESPACE = 'default'
DOCKER_SOCKET = '/var/run/docker.sock'
FIXTURE_CONFIGMAP = 'spk06-default-fixture'
# WSL2 steps the realtime clock (seen: about 3 s back every 30-60 s). A case whose realtime-monotonic
# offset moves more than this is discarded and run again; it would corrupt GNU time and CRI timestamps.
CLOCK_TOLERANCE = 0.02
CLOCK_RETRIES = 3


def summarize(values):
    """Median, min, max and nearest-rank p95 of the measured (non warm-up) values."""
    data = sorted(value for value in values if value is not None)
    if not data:
        return None
    return dict(n=len(data), min=data[0], median=round(statistics.median(data), 4),
                p95=data[max(0, math.ceil(0.95 * len(data)) - 1)], max=data[-1])


def order(repeat, runtimes):
    # Alternate runtime order between rounds to spread cache/order bias, as spike.py does.
    return list(runtimes) if repeat % 2 == 0 else list(reversed(runtimes))


def parse_result(line):
    return json.loads(line[line.index(RESULT) + len(RESULT):])


def succeeded(row):
    row['status'] = classify(row.get('timed_out', False), row.get('oom_killed', False), row.get('result'))
    return verdict(SCENARIO, row) and row['result'].get('rootfs_readonly') is True \
        and row['result'].get('tmp_readonly') is True and row['result'].get('uid') == 65532


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fixture_files():
    source = ROOT / 'fixtures' / SCENARIO
    return sorted(path for path in source.rglob('*') if path.is_file())


class ClockWatch:
    """Samples realtime minus monotonic every 5 ms while a case runs."""

    def __init__(self):
        self.offsets = []
        self.stopped = threading.Event()
        self.thread = threading.Thread(target=self.sample, daemon=True)

    def sample(self):
        while not self.stopped.is_set():
            self.offsets.append(time.time() - time.monotonic())
            self.stopped.wait(0.005)

    def __enter__(self):
        self.offsets.append(time.time() - time.monotonic())
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.stopped.set()
        self.thread.join()
        self.offsets.append(time.time() - time.monotonic())

    @property
    def offset(self):
        return self.offsets[0]

    def record(self, row):
        row['clock_offset_spread_seconds'] = round(max(self.offsets) - min(self.offsets), 6)
        row['clock_step'] = row['clock_offset_spread_seconds'] > CLOCK_TOLERANCE


def common_environment():
    load = Path('/proc/loadavg').read_text().split()[:3]
    cpu = next((line.split(':', 1)[1].strip() for line in Path('/proc/cpuinfo').read_text().splitlines()
                if line.startswith('model name')), None)
    return dict(
        kernel=platform.release(), machine=platform.machine(), cpu_model=cpu,
        python=platform.python_version(), load_average_before=load,
        engine=ENGINE, scenario=SCENARIO, boot_wrapper=BOOT,
        limits=dict(seconds=DEADLINE, memory_bytes=MEMORY, workspace_bytes=DISK, cpus=2),
        source_sha256={name: sha256(ROOT / name) for name in SOURCES},
        fixture_sha256={str(path.relative_to(ROOT)): sha256(path) for path in fixture_files()},
    )


# --------------------------------------------------------------------------- Docker containers

class Engine:
    """Docker Engine API over the local unix socket, so no CLI start-up sits inside the timed path."""

    def __init__(self, path=DOCKER_SOCKET):
        self.path = path

    def socket(self, timeout):
        connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        connection.settimeout(timeout)
        connection.connect(self.path)
        return connection

    def request(self, method, path, body=None, expect=(200, 201, 204)):
        connection = http.client.HTTPConnection('docker', timeout=60)
        connection.sock = self.socket(60)
        try:
            connection.request(method, path, body=None if body is None else json.dumps(body),
                               headers={'Content-Type': 'application/json'})
            response = connection.getresponse()
            data = response.read()
        finally:
            connection.close()
        if response.status not in expect:
            raise RuntimeError(f'{method} {path}: HTTP {response.status} {data[:400]!r}')
        return json.loads(data) if data else None

    def attach(self, container):
        """Hijacked attach stream (no TTY: 8-byte multiplexed frame headers), opened before start."""
        connection = self.socket(None)
        connection.sendall(
            f'POST /containers/{container}/attach?stream=1&stdout=1&stderr=1 HTTP/1.1\r\n'
            'Host: docker\r\nUpgrade: tcp\r\nConnection: Upgrade\r\nContent-Length: 0\r\n\r\n'.encode())
        reader = connection.makefile('rb')
        status = reader.readline()
        if b' 101 ' not in status and b' 200 ' not in status:
            raise RuntimeError(f'attach: {status!r}')
        while reader.readline() not in (b'\r\n', b''):
            pass
        return connection, reader


def container_body(image, runtime, input_dir):
    # Same isolation and limits as spike.run_case (docker create flags); only the entrypoint wraps worker.py.
    return dict(
        Image=image, User='65532:65532', Entrypoint=['python3'], Cmd=['-c', BOOT, ENGINE, SCENARIO],
        AttachStdout=True, AttachStderr=True,
        HostConfig=dict(
            Runtime=runtime, NetworkMode='none', ReadonlyRootfs=True, CapDrop=['ALL'],
            SecurityOpt=['no-new-privileges'], Memory=MEMORY, MemorySwap=MEMORY, NanoCpus=2 * 10**9,
            PidsLimit=256, ShmSize=1024**2,
            Ulimits=[dict(Name='nofile', Soft=256, Hard=256), dict(Name='fsize', Soft=16777216, Hard=16777216)],
            Tmpfs={'/work': f'rw,noexec,nosuid,nodev,size={DISK},uid=65532,gid=65532,mode=0700'},
            Mounts=[dict(Type='bind', Source=str(input_dir), Target='/input', ReadOnly=True),
                    dict(Type='bind', Source=str(input_dir), Target='/tmp', ReadOnly=True)],
            LogConfig=dict(Type='local', Config={'max-size': '4m', 'max-file': '1', 'compress': 'false'}),
        ),
    )


def container_case(engine, image, runtime, label, folder):
    """One new container: create, attach, start, wait for the ready marker and the Default build."""
    name = 'sires-spk06-cs-' + uuid.uuid4().hex[:12]
    row = dict(mode='container', runtime=runtime, label=label, name=name)
    logs = []
    with tempfile.TemporaryDirectory(prefix='sires-spk06-cs-input-') as temporary, ClockWatch() as clock:
        input_dir = Path(temporary)
        input_dir.chmod(0o755)
        shutil.copytree(ROOT / 'fixtures' / SCENARIO, input_dir, dirs_exist_ok=True)
        body = container_body(image, runtime, input_dir)
        row['create_body'] = body
        stream = None
        try:
            t0 = time.monotonic()
            engine.request('POST', f'/containers/create?name={name}', body)
            t1 = time.monotonic()
            stream, reader = engine.attach(name)
            lines = queue.Queue()

            def collect():
                pending = b''
                while True:
                    header = reader.read(8)
                    if len(header) < 8:
                        break
                    pending += reader.read(int.from_bytes(header[4:], 'big'))
                    while b'\n' in pending:
                        line, pending = pending.split(b'\n', 1)
                        lines.put((time.monotonic(), line.decode('utf-8', errors='replace') + '\n'))
                lines.put((time.monotonic(), None))

            threading.Thread(target=collect, daemon=True).start()
            t2 = time.monotonic()
            engine.request('POST', f'/containers/{name}/start')
            t3 = time.monotonic()
            ready_at = result_at = None
            while result_at is None:
                remaining = DEADLINE - (time.monotonic() - t2)
                if remaining <= 0:
                    row['timed_out'] = True
                    break
                try:
                    at, line = lines.get(timeout=remaining)
                except queue.Empty:
                    continue
                if line is None:
                    break
                if ready_at is None and line.startswith(READY):
                    ready_at = at
                elif RESULT in line:
                    result_at = at
                    row['result'] = parse_result(line)
                else:
                    logs.append(line)
            metadata = engine.request('GET', f'/containers/{name}/json')
            row['oom_killed'] = metadata['State']['OOMKilled']
            row['container_config'] = {key: metadata['HostConfig'].get(key) for key in (
                'Runtime', 'NetworkMode', 'ReadonlyRootfs', 'Memory', 'MemorySwap', 'NanoCpus',
                'PidsLimit', 'CapDrop', 'SecurityOpt', 'Tmpfs', 'Ulimits')}
            row['user'] = metadata['Config']['User']
            row.update(
                create_seconds=round(t1 - t0, 4),
                attach_seconds=round(t2 - t1, 4),
                start_api_seconds=round(t3 - t2, 4),
                start_to_ready_seconds=round(ready_at - t2, 4) if ready_at else None,
                create_to_ready_seconds=round(ready_at - t0, 4) if ready_at else None,
                ready_to_result_seconds=round(result_at - ready_at, 4) if ready_at and result_at else None,
                create_to_result_seconds=round(result_at - t0, 4) if result_at else None,
            )
            # Reference only: one Docker CLI round trip, the cost a CLI-driven harness adds per call.
            cli = time.monotonic()
            inspect(name)
            row['docker_cli_inspect_seconds'] = round(time.monotonic() - cli, 4)
        finally:
            removing = time.monotonic()
            engine.request('DELETE', f'/containers/{name}?force=1', expect=(204, 404))
            row['remove_seconds'] = round(time.monotonic() - removing, 4)
            if stream:
                stream.close()
    clock.record(row)
    finish(row, logs, folder)
    return row


def finish(row, logs, folder):
    result = row.get('result')
    if result:
        row['worker_seconds'] = result.get('worker_seconds')
        row['latexmk_seconds'] = result.get('latexmk_seconds')
        if row.get('create_to_result_seconds') is not None:
            row['non_tex_seconds'] = round(row['create_to_result_seconds'] - result['latexmk_seconds'], 4)
        # Keep the evidence small: the full TeX log tail is not needed for timing.
        result['log_tail'] = result.get('log_tail', '')[-400:]
    row['passed'] = bool(result) and succeeded(row)
    (folder / f'{row["label"]}.json').write_text(
        json.dumps(dict(row, runtime_log=''.join(logs)[-4000:]), ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8')
    keys = ('create_to_ready_seconds', 'create_to_result_seconds') if row['mode'] == 'container' else (
        'pod_ready_seconds', 'worker_ready_seconds', 'result_seconds')
    print(f'{row["mode"]} {row["runtime"]} {row["label"]}: pass={row["passed"]} '
          + ' '.join(f'{key}={row.get(key)}' for key in keys), flush=True)


def run_containers(args, output):
    info = json.loads(docker('info', '--format', '{{json .}}').stdout)
    missing = [runtime for runtime in args.runtimes if runtime not in info['Runtimes']]
    if missing:
        raise SystemExit(f'Thiếu runtime Docker: {", ".join(missing)}')
    image = inspect(args.image)
    environment = common_environment()
    environment.update(
        docker_version=info['ServerVersion'], docker_cgroup_version=info['CgroupVersion'],
        docker_cgroup_driver=info['CgroupDriver'], containerd=info.get('ContainerdCommit'),
        cpus=info['NCPU'], host_memory_bytes=info['MemTotal'],
        image=args.image, image_id=image['Id'], image_size_bytes=image.get('Size'),
        runtimes={runtime: info['Runtimes'][runtime] for runtime in args.runtimes},
        runsc_version=subprocess.run(['runsc', '--version'], capture_output=True, text=True,
                                     check=False).stdout.strip(),
        repetitions=args.repetitions, warmup=args.warmup,
    )
    engine = Engine()
    return environment, lambda runtime, label, folder: container_case(engine, image['Id'], runtime, label, folder)


# --------------------------------------------------------------------------- Kubernetes pods

class Kube:
    """Minimal Kubernetes API client over the kind kubeconfig (client certificate), stdlib only."""

    def __init__(self, kubeconfig, directory):
        def field(key):
            match = re.search(rf'^\s*{key}:\s*(\S+)\s*$', kubeconfig, re.MULTILINE)
            if not match:
                raise SystemExit(f'kubeconfig thiếu {key}')
            return match.group(1)

        server = urlparse(field('server'))
        self.host, self.port = server.hostname, server.port
        paths = {}
        for key in ('certificate-authority-data', 'client-certificate-data', 'client-key-data'):
            path = directory / f'{key}.pem'
            path.write_bytes(base64.b64decode(field(key)))
            path.chmod(0o600)
            paths[key] = path
        self.context = ssl.create_default_context(cafile=str(paths['certificate-authority-data']))
        self.context.load_cert_chain(str(paths['client-certificate-data']), str(paths['client-key-data']))

    def connect(self, timeout):
        return http.client.HTTPSConnection(self.host, self.port, context=self.context, timeout=timeout)

    def request(self, method, path, body=None, expect=(200, 201, 202), raw=False):
        connection = self.connect(30)
        try:
            connection.request(method, path, body=None if body is None else json.dumps(body),
                               headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
            response = connection.getresponse()
            data = response.read()
        finally:
            connection.close()
        if response.status not in expect:
            raise RuntimeError(f'{method} {path}: HTTP {response.status} {data[:400]!r}')
        if raw:
            return response.status, data.decode('utf-8', errors='replace')
        return response.status, json.loads(data) if data else None

    def stream(self, path, timeout):
        connection = self.connect(timeout)
        connection.request('GET', path, headers={'Accept': 'application/json'})
        response = connection.getresponse()
        return connection, response


def realtime(stamp):
    # CRI log timestamps are RFC 3339 with nanoseconds; datetime keeps microseconds.
    head, _, rest = stamp.rstrip('Z').partition('.')
    return datetime.fromisoformat(f'{head}.{(rest + "000000")[:6]}+00:00').timestamp()


def pod_manifest(name, runtime, image):
    items = [dict(key=f'f{index}', path=str(path.relative_to(ROOT / 'fixtures' / SCENARIO)))
             for index, path in enumerate(fixture_files())]
    resources = dict(limits=dict(cpu='2', memory=str(MEMORY)), requests=dict(cpu='2', memory=str(MEMORY)))
    spec = dict(
        restartPolicy='Never', automountServiceAccountToken=False, enableServiceLinks=False,
        terminationGracePeriodSeconds=1,
        securityContext=dict(runAsUser=65532, runAsGroup=65532, seccompProfile=dict(type='RuntimeDefault')),
        # kubelet creates the emptyDir as root 0777; Docker's tmpfs had uid=65532,mode=0700. worker.py copies
        # /input with copytree, whose copystat on /work needs the owner, so a root step with only CHOWN sets it.
        initContainers=[dict(
            name='workspace', image=image, imagePullPolicy='Never', resources=resources,
            command=['python3', '-c', "import os; os.chmod('/work', 0o700); os.chown('/work', 65532, 65532)"],
            securityContext=dict(runAsUser=0, runAsGroup=0, readOnlyRootFilesystem=True,
                                 allowPrivilegeEscalation=False, capabilities=dict(drop=['ALL'], add=['CHOWN'])),
            volumeMounts=[dict(name='work', mountPath='/work')],
        )],
        containers=[dict(
            name='worker', image=image, imagePullPolicy='Never', resources=resources,
            command=['python3', '-c', BOOT], args=[ENGINE, SCENARIO],
            securityContext=dict(runAsNonRoot=True, readOnlyRootFilesystem=True, allowPrivilegeEscalation=False,
                                 capabilities=dict(drop=['ALL'])),
            volumeMounts=[dict(name='work', mountPath='/work'),
                          dict(name='input', mountPath='/input', readOnly=True),
                          dict(name='input', mountPath='/tmp', readOnly=True)],
        )],
        volumes=[dict(name='work', emptyDir=dict(medium='Memory', sizeLimit=str(DISK))),
                 dict(name='input', configMap=dict(name=FIXTURE_CONFIGMAP, items=items))],
    )
    if runtime == 'gvisor':
        spec['runtimeClassName'] = 'gvisor'
    return dict(apiVersion='v1', kind='Pod', spec=spec,
                metadata=dict(name=name, labels={'app.kubernetes.io/name': 'sires-spk06-cold-start'}))


def pod_case(kube, image, runtime, label, folder):
    """One new pod: create, wait for Ready, read worker markers from CRI log timestamps, delete."""
    name = f'spk06-cs-{runtime}-{uuid.uuid4().hex[:8]}'
    manifest = pod_manifest(name, runtime, image)
    row = dict(mode='pod', runtime=runtime, label=label, name=name,
               runtime_class=manifest['spec'].get('runtimeClassName'))
    base = f'/api/v1/namespaces/{NAMESPACE}/pods'
    selector = quote(f'metadata.name={name}')
    _, listing = kube.request('GET', f'{base}?fieldSelector={selector}')
    watch_connection, watch = kube.stream(
        f'{base}?watch=1&fieldSelector={selector}&resourceVersion={listing["metadata"]["resourceVersion"]}'
        '&timeoutSeconds=300', timeout=310)
    events = queue.Queue()

    def collect():
        try:
            for line in watch:
                events.put((time.monotonic(), json.loads(line)))
        except (OSError, ValueError, AttributeError, http.client.HTTPException):
            pass  # the main thread closed the watch connection
        events.put((time.monotonic(), None))

    threading.Thread(target=collect, daemon=True).start()
    first_true, deleted_at, logs = {}, None, []
    clock = ClockWatch().__enter__()
    t0 = time.monotonic()
    try:
        kube.request('POST', base, manifest)
        row['api_create_seconds'] = round(time.monotonic() - t0, 4)
        running = terminated = False
        while not running and not terminated:
            try:
                at, event = events.get(timeout=max(0.01, DEADLINE - (time.monotonic() - t0)))
            except queue.Empty:
                row['timed_out'] = True
                break
            if event is None:
                break
            status = event['object'].get('status', {})
            for condition in status.get('conditions', []):
                if condition.get('status') == 'True':
                    first_true.setdefault(condition['type'], at)
            for kind, key in (('initContainerStatuses', 'InitContainerTerminated'),
                              ('containerStatuses', 'ContainerRunning')):
                state = ((status.get(kind) or [{}])[0]).get('state', {})
                if kind == 'initContainerStatuses' and 'terminated' in state:
                    first_true.setdefault(key, at)
                    row['init_container_terminated'] = state['terminated']
                if kind == 'containerStatuses' and 'running' in state:
                    first_true.setdefault(key, at)
                    row['container_started_at'] = state['running'].get('startedAt')
                    running = True
                if kind == 'containerStatuses' and 'terminated' in state:
                    row['container_terminated'] = state['terminated']
                    terminated = True
        ready_wall = result_wall = None
        streamed = False
        while running and not streamed and time.monotonic() - t0 < DEADLINE:
            # Markers are timed by the containerd CRI log timestamp, not by when this client reads them.
            log_connection, response = kube.stream(
                f'{base}/{name}/log?container=worker&follow=true&timestamps=true', timeout=DEADLINE)
            try:
                if response.status != 200:
                    response.read()
                    time.sleep(0.05)
                    continue
                streamed = True
                for raw in response:
                    stamp, _, line = raw.decode('utf-8', errors='replace').partition(' ')
                    # CRI stamps are realtime: map them onto monotonic with the offset at case start.
                    if ready_wall is None and line.startswith(READY):
                        ready_wall = realtime(stamp) - clock.offset
                    elif RESULT in line:
                        result_wall = realtime(stamp) - clock.offset
                        break
            finally:
                log_connection.close()
        if running or terminated:
            # Plain log for content: CRI splits lines over 16 KiB and prefixes every part with a timestamp.
            _, plain = kube.request('GET', f'{base}/{name}/log?container=worker', raw=True)
            for line in plain.splitlines(keepends=True):
                if RESULT in line:
                    row['result'] = parse_result(line)
                elif not line.startswith(READY):
                    logs.append(line)
        # Ready can arrive after the worker marker: kubelet reports container state via PLEG.
        while running and 'Ready' not in first_true and time.monotonic() - t0 < DEADLINE:
            try:
                at, event = events.get(timeout=max(0.01, DEADLINE - (time.monotonic() - t0)))
            except queue.Empty:
                break
            if event is None:
                break
            for condition in event['object'].get('status', {}).get('conditions', []):
                if condition.get('status') == 'True':
                    first_true.setdefault(condition['type'], at)
        relative = {key: round(value - t0, 4) for key, value in sorted(first_true.items(), key=lambda x: x[1])}
        row['condition_seconds'] = relative
        row.update(
            scheduled_seconds=relative.get('PodScheduled'),
            sandbox_ready_seconds=relative.get('PodReadyToStartContainers'),
            initialized_seconds=relative.get('Initialized'),
            pod_ready_seconds=relative.get('Ready'),
            worker_ready_seconds=round(ready_wall - t0, 4) if ready_wall else None,
            result_seconds=round(result_wall - t0, 4) if result_wall else None,
            ready_to_result_seconds=round(result_wall - ready_wall, 4) if ready_wall and result_wall else None,
        )
        row['create_to_result_seconds'] = row['result_seconds']
    finally:
        removing = time.monotonic()
        kube.request('DELETE', f'{base}/{name}', dict(gracePeriodSeconds=1), expect=(200, 202, 404))
        while deleted_at is None and time.monotonic() - removing < 90:
            try:
                at, event = events.get(timeout=90)
            except queue.Empty:
                break
            if event is None:
                break
            if event['type'] == 'DELETED':
                deleted_at = at
        row['delete_seconds'] = round(deleted_at - removing, 4) if deleted_at else None
        # Unblock the reader thread first: close() waits for the buffered read the open watch holds.
        try:
            watch_connection.sock.shutdown(socket.SHUT_RDWR)
        except (AttributeError, OSError):
            pass
        watch_connection.close()
        clock.__exit__()
        clock.record(row)
    (folder / f'{label}.manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    finish(row, logs, folder)
    return row


def run_pods(args, output):
    kubeconfig = subprocess.run(['kind', 'get', 'kubeconfig', '--name', args.cluster], capture_output=True,
                                text=True, check=True).stdout
    credentials = Path(tempfile.mkdtemp(prefix='sires-spk06-kube-'))
    try:
        kube = Kube(kubeconfig, credentials)  # the SSL context keeps the keys in memory
    finally:
        shutil.rmtree(credentials, ignore_errors=True)
    node = f'{args.cluster}-control-plane'
    _, nodes = kube.request('GET', '/api/v1/nodes')
    _, runtime_class = kube.request('GET', '/apis/node.k8s.io/v1/runtimeclasses/gvisor')
    files = fixture_files()
    configmap = dict(apiVersion='v1', kind='ConfigMap', metadata=dict(name=FIXTURE_CONFIGMAP),
                     binaryData={f'f{index}': base64.b64encode(path.read_bytes()).decode()
                                 for index, path in enumerate(files)})
    kube.request('DELETE', f'/api/v1/namespaces/{NAMESPACE}/configmaps/{FIXTURE_CONFIGMAP}', expect=(200, 404))
    kube.request('POST', f'/api/v1/namespaces/{NAMESPACE}/configmaps', configmap)

    def node_exec(*command):
        return subprocess.run(['docker', 'exec', node, *command], capture_output=True, text=True,
                              check=False).stdout.strip()

    images = node_exec('crictl', 'images', '--digests', '-o', 'json')
    environment = common_environment()
    environment.update(
        cluster=args.cluster, node_container=node,
        kind_version=subprocess.run(['kind', 'version'], capture_output=True, text=True, check=False).stdout.strip(),
        node_image=inspect(node)['Config']['Image'],
        nodes=[dict(name=item['metadata']['name'], node_info=item['status']['nodeInfo'],
                    capacity=item['status']['capacity']) for item in nodes['items']],
        runtime_class=dict(name=runtime_class['metadata']['name'], handler=runtime_class['handler']),
        runsc_version_in_node=node_exec('runsc', '--version'),
        runsc_toml=node_exec('cat', '/etc/containerd/runsc.toml'),
        containerd_runsc_config=node_exec('sh', '-c', 'containerd config dump | grep -A8 "runtimes.runsc\\]"'),
        image=args.image,
        image_in_node=[item for item in json.loads(images or '{"images": []}')['images']
                       if any(args.image in tag for tag in item.get('repoTags', []))],
        image_pull='không đo: image nạp sẵn bằng kind load, imagePullPolicy=Never',
        repetitions=args.repetitions, warmup=args.warmup,
    )
    return environment, lambda runtime, label, folder: pod_case(kube, args.image, runtime, label, folder)


# --------------------------------------------------------------------------- main

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('container', 'pod'))
    parser.add_argument('--image', default='sires/spk-06:texlive-2022')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--repetitions', type=int, default=20, help='lượt đo mỗi runtime; nghiệm thu cần >= 10')
    parser.add_argument('--warmup', type=int, default=1, help='lượt khởi động mỗi runtime, không vào thống kê')
    parser.add_argument('--runtimes', default=None,
                        help='container: runc,runsc[,runsc-systrap]; pod: runc,gvisor')
    parser.add_argument('--cluster', default='sires-spk06')
    parser.add_argument('--settle', type=float, default=2.0, help='giây nghỉ giữa hai lượt')
    args = parser.parse_args()
    if platform.system() != 'Linux':
        parser.error('Chạy trên Linux/WSL2, cùng host với Docker.')
    if args.repetitions < 1 or args.warmup < 0:
        parser.error('--repetitions phải >= 1, --warmup >= 0')
    default_runtimes = 'runc,runsc' if args.mode == 'container' else 'runc,gvisor'
    args.runtimes = [item for item in (args.runtimes or default_runtimes).split(',') if item]
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=False)
    environment, run = (run_containers if args.mode == 'container' else run_pods)(args, args.output)
    environment['started_at'] = datetime.now().astimezone().isoformat()
    rows = []
    try:
        for index in range(args.warmup + args.repetitions):
            warm = index < args.warmup
            folder = args.output / ('warmup' if warm else f'repeat-{index - args.warmup + 1:02d}')
            folder.mkdir(exist_ok=True)
            for runtime in order(index, args.runtimes):
                for attempt in range(1 + CLOCK_RETRIES):
                    row = run(runtime, runtime if attempt == 0 else f'{runtime}-retry{attempt}', folder)
                    row.update(warmup=warm, round=0 if warm else index - args.warmup + 1, attempt=attempt)
                    rows.append(row)
                    time.sleep(args.settle)
                    if not row['clock_step']:
                        break
                    row['discarded'] = 'clock_step'
    finally:
        environment['finished_at'] = datetime.now().astimezone().isoformat()
        environment['load_average_after'] = Path('/proc/loadavg').read_text().split()[:3]
        (args.output / 'environment.json').write_text(json.dumps(environment, ensure_ascii=False, indent=2)
                                                      + '\n', encoding='utf-8')
        (args.output / 'results.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n',
                                                  encoding='utf-8')
        metrics = (('create_seconds', 'attach_seconds', 'start_api_seconds', 'start_to_ready_seconds',
                    'create_to_ready_seconds',
                    'ready_to_result_seconds', 'create_to_result_seconds', 'worker_seconds',
                    'latexmk_seconds', 'non_tex_seconds', 'docker_cli_inspect_seconds', 'remove_seconds')
                   if args.mode == 'container' else
                   ('api_create_seconds', 'scheduled_seconds', 'sandbox_ready_seconds', 'initialized_seconds',
                    'pod_ready_seconds',
                    'worker_ready_seconds', 'ready_to_result_seconds', 'result_seconds', 'worker_seconds',
                    'latexmk_seconds', 'non_tex_seconds', 'delete_seconds'))
        summary = {}
        for runtime in args.runtimes:
            measured = [row for row in rows if row['runtime'] == runtime and not row['warmup']
                        and not row.get('discarded')]
            summary[runtime] = dict(
                passed=sum(row['passed'] for row in measured), cases=len(measured),
                discarded_clock_step=sum(1 for row in rows if row['runtime'] == runtime and row.get('discarded')),
                warmup={key: [row.get(key) for row in rows if row['runtime'] == runtime and row['warmup']]
                        for key in metrics},
                **{key: summarize(row.get(key) for row in measured) for key in metrics},
            )
        (args.output / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n',
                                                  encoding='utf-8')
    kept = [row for row in rows if not row.get('discarded')]
    if not kept or not all(row['passed'] for row in kept):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
