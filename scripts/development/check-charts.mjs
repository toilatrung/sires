// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse, parseAllDocuments } from 'yaml';

const root = fileURLToPath(new URL('../../', import.meta.url));
const chart = 'infra/helm/sires-service';
const values = (service) => `apps/${service}/deploy/values.yaml`;

function command(file, args) {
  const result = spawnSync(file, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error?.code === 'ENOENT') throw new Error(`Không tìm thấy ${file} trong PATH.`);
  if (result.error) throw result.error;
  return result;
}

function checked(file, args) {
  const result = command(file, args);
  if (result.status !== 0) throw new Error(`${file} ${args.join(' ')}: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function docker(...args) {
  if (process.platform === 'win32') {
    return checked('wsl.exe', [
      '-d',
      process.env.SIRES_WSL_DISTRO || 'Ubuntu-24.04',
      '--cd',
      root,
      '-e',
      'docker',
      ...args,
    ]);
  }
  return checked('docker', args);
}

function checkChart() {
  checked('helm', ['version', '--short']);
  const services = readdirSync(new URL('../../apps/', import.meta.url)).filter((service) =>
    existsSync(new URL(`../../${values(service)}`, import.meta.url)),
  );
  assert.ok(services.length, 'Không tìm thấy values của service');
  for (const service of services) {
    const args = [
      '-f',
      values(service),
      '--set-string',
      'secretName=fixture-secret,migration.secretName=fixture-migration-secret',
    ];
    const config = parse(readFileSync(new URL(`../../${values(service)}`, import.meta.url), 'utf8'));
    checked('helm', ['lint', chart, ...args]);
    const manifests = parseAllDocuments(checked('helm', ['template', service, chart, ...args])).map((doc) =>
      doc.toJS(),
    );
    const deployment = manifests.find((item) => item.kind === 'Deployment');
    assert.ok(deployment?.spec.replicas >= 2, `${service}: cần ít nhất hai replicas`);
    assert.equal(deployment.spec.strategy.type, 'RollingUpdate', service);
    const pod = deployment.spec.template.spec;
    assert.equal(pod.securityContext.runAsNonRoot, true, service);
    assert.ok(pod.securityContext.runAsUser > 0, service);
    assert.ok(
      manifests.some((item) => item.kind === 'ServiceAccount' && item.metadata.name === pod.serviceAccountName),
      service,
    );
    const [container] = pod.containers;
    for (const probe of ['readinessProbe', 'livenessProbe']) {
      assert.equal(container[probe].httpGet.path, '/health', service);
      assert.equal(container[probe].httpGet.port, config.port, service);
    }
    for (const level of ['requests', 'limits']) {
      for (const resource of ['cpu', 'memory']) {
        assert.ok(container.resources?.[level]?.[resource], `${service}: resources.${level}.${resource}`);
      }
    }
    assert.equal(container.securityContext.allowPrivilegeEscalation, false, service);
    assert.equal(container.envFrom[0].secretRef.name, 'fixture-secret', service);
    const job = manifests.find((item) => item.kind === 'Job');
    assert.equal(Boolean(job), Boolean(config.migration?.enabled), service);
    if (job) {
      assert.deepEqual(job.metadata.annotations['helm.sh/hook'].split(','), ['pre-install', 'pre-upgrade'], service);
      assert.equal(job.spec.template.spec.securityContext.runAsNonRoot, true, service);
      const [migration] = job.spec.template.spec.containers;
      assert.equal(migration.image, container.image, service);
      assert.equal(migration.envFrom[0].secretRef.name, 'fixture-migration-secret', service);
      assert.deepEqual(migration.command, config.migration.command, service);
    }
    console.log(`OK Helm ${service}`);
  }
  const failure = command('helm', ['template', 'missing-command', chart, '--set', 'migration.enabled=true']);
  assert.notEqual(failure.status, 0, 'migration thiếu command phải thất bại');
  assert.match(failure.stderr, /migration\.command is required/);
  console.log('OK Helm từ chối migration thiếu command');
}

async function checkImages(services) {
  for (const service of services) {
    const config = parse(readFileSync(new URL(`../../${values(service)}`, import.meta.url), 'utf8'));
    const tag = `sires/pid00010-check-${service}:local`;
    const python = service === 'agent-core';
    console.log(`Build image ${service}…`);
    docker(
      'build',
      '-f',
      `infra/docker/${python ? 'python' : 'node'}/Dockerfile`,
      '-t',
      tag,
      ...(python
        ? ['--build-arg', 'PACKAGE=sires-agent-core', '--build-arg', 'MODULE=agent_core.main']
        : ['--build-arg', 'SERVICE=gateway']),
      '.',
    );
    const name = `pid00010-${randomUUID()}`;
    docker('run', '-d', '--name', name, '-p', `127.0.0.1::${config.port}`, '-e', `PORT=${config.port}`, tag);
    try {
      const port = docker('port', name, `${config.port}/tcp`).trim().split(':').at(-1);
      let status;
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
          status = response.status;
          await response.body?.cancel();
          if (status === 200) break;
        } catch {
          // Retry while the process starts.
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      assert.equal(status, 200, `${service}: /health phải trả 200\n${docker('logs', name)}`);
      const processStatus = docker('exec', name, 'cat', '/proc/1/status');
      assert.match(processStatus, /^Uid:\s+[1-9]\d*\s+[1-9]\d*\s+[1-9]\d*\s+[1-9]\d*$/m, service);
      console.log(`OK image ${service}: /health 200, PID 1 non-root`);
    } finally {
      docker('rm', '-f', name);
    }
  }
}

try {
  const [mode, service, ...extra] = process.argv.slice(2);
  const imageServices = ['gateway', 'agent-core'];
  if (mode === '--images' && !extra.length && (service === undefined || imageServices.includes(service))) {
    await checkImages(service ? [service] : imageServices);
  } else if (mode === undefined) {
    checkChart();
  } else {
    throw new Error('Dùng: node scripts/development/check-charts.mjs [--images [gateway|agent-core]]');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
