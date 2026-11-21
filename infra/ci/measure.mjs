// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import { execFileSync } from 'node:child_process';

const repository = process.argv[2] ?? 'toilatrung/sires';
const api = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
const runs = (event, branch = '') => {
  const found = [];
  for (let page = 1; page <= 10; page++) {
    const query = new URLSearchParams({ event, status: 'completed', per_page: '100', page: String(page) });
    if (branch) query.set('branch', branch);
    const batch = api(`repos/${repository}/actions/workflows/ci.yml/runs?${query}`).workflow_runs;
    for (const run of batch) {
      if (run.conclusion === 'cancelled') continue;
      if (event === 'pull_request') {
        const pr = run.pull_requests.find(({ base }) => base.ref === 'develop');
        if (!pr) continue;
        const comparison = api(`repos/${repository}/compare/${pr.base.sha}...${run.head_sha}`);
        if (!comparison.files?.length || comparison.files.length >= 300 ||
            comparison.files.some(({ filename, previous_filename }) => [filename, previous_filename]
              .filter(Boolean).some((file) => !/^(agent\/|docs\/(?!api-design\/))/.test(file)))) continue;
      }
      const jobs = api(`repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`).jobs;
      if (!jobs.some((job) => job.name === 'changes' && job.conclusion === 'success')) continue;
      found.push(run);
      if (found.length === 20) return found;
    }
    if (batch.length < 100) break;
  }
  return found;
};

for (const [label, event, branch] of [
  ['PR vào develop chỉ đổi tài liệu', 'pull_request', ''],
  ['Push toàn bộ vào main', 'push', 'main'],
]) {
  const selected = runs(event, branch);
  console.log(`${label}: ${selected.length}/20 lần`);
  if (selected.length < 20) continue;
  const minutes = selected.map(({ created_at, updated_at }) =>
    (Date.parse(updated_at) - Date.parse(created_at)) / 60_000).sort((a, b) => a - b);
  const p95 = minutes[Math.ceil(minutes.length * 0.95) - 1];
  console.log(`p95 ${p95.toFixed(2)} phút · p95 + 20% ${(p95 * 1.2).toFixed(2)} phút`);
}
