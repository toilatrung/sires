// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nx = require.resolve('nx/bin/nx.js');
const run = (file, args) => execFileSync(file, args, { encoding: 'utf8' }).trim();
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const event = option('--event', process.env.GITHUB_EVENT_NAME);
const target = option('--target', process.env.GITHUB_BASE_REF);
const head = option('--head', 'HEAD');
const shared = /^(?:[^/]+\.(?:json|ya?ml|toml|lock|mjs)|\.nvmrc|\.python-version|\.github\/workflows\/|scripts\/development\/|infra\/ci\/)/;
const contract = /^docs\/api-design\//;
const chart = /^(?:infra\/helm\/sires-service\/|apps\/[^/]+\/deploy\/values\.yaml$)/;
const docker = /^infra\/docker\/(node|python)\/Dockerfile$/;
const terraform = /^infra\/terraform\//;
const dependency = /(?:^|\/)(?:pnpm-lock\.yaml|uv\.lock|package\.json|pyproject\.toml|pnpm-workspace\.yaml)$/;

let files = [];
let base = '';
let full = event !== 'pull_request' || target !== 'develop';
try {
  if (args.includes('--stdin')) {
    files = readFileSync(0, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  } else if (!full) {
    base = run('git', ['merge-base', head, `refs/remotes/origin/${target}`]);
    files = run('git', ['diff', '--name-only', '--no-renames', '-z', base, head]).split('\0').filter(Boolean);
  }
} catch (error) {
  console.error(`Không tính được thay đổi: ${error.message}`);
  full = true;
}
full ||= files.some((file) => shared.test(file));

const show = (...options) => JSON.parse(run(process.execPath, [nx, 'show', 'projects', '--json', ...options]));
const tsProjects = show('--projects=tag:lang:ts');
const pythonProjects = show('--projects=tag:lang:python');
let affected;
if (!full) {
  try {
    affected = files.length ? show('--affected', '--files', ...files) : [];
    if (files.some((file) => contract.test(file)) && !affected.includes('@sires/contracts')) {
      affected = [...new Set([...affected, ...show('--affected', '--files=libs/ts/contracts/package.json')])];
    }
  } catch (error) {
    console.error(`Không tính được project bị ảnh hưởng: ${error.message}`);
    full = true;
  }
}
affected = full ? show() : affected;

const images = readdirSync('apps')
  .filter((service) => existsSync(`apps/${service}/deploy/values.yaml`))
  .map((service) => {
    const isPython = pythonProjects.includes(service);
    return {
      service,
      language: isPython ? 'python' : 'node',
      project: isPython ? service : `@sires/${service}`,
      args: isPython ? `PACKAGE=sires-${service}\nMODULE=${service.replaceAll('-', '_')}.main` : `SERVICE=${service}`,
    };
  })
  .filter(({ service, language, project }) => full || affected.includes(project)
    || files.includes(`infra/docker/${language}/Dockerfile`)
    || files.includes(`apps/${service}/deploy/values.yaml`));

const result = {
  mode: full ? 'full' : 'filtered',
  base,
  head,
  affected: affected.join(','),
  ts: tsProjects.some((project) => affected.includes(project)),
  python: pythonProjects.some((project) => affected.includes(project)),
  contracts: full || files.some((file) => contract.test(file)),
  dependencies: full || files.some((file) => dependency.test(file)),
  docs: files.some((file) => /^(docs|agent)\//.test(file)),
  workflow: files.some((file) => file.startsWith('.github/workflows/')),
  shared: files.some((file) => shared.test(file)),
  chart: full || files.some((file) => chart.test(file)),
  terraform: full || files.some((file) => terraform.test(file)),
  docker: full || files.some((file) => docker.test(file)),
  node_docker: full || files.includes('infra/docker/node/Dockerfile'),
  python_docker: full || files.includes('infra/docker/python/Dockerfile'),
  images: JSON.stringify({ include: images }),
  has_images: images.length > 0,
};
console.log(JSON.stringify(result, null, 2));
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''));
}
