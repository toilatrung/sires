// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import { execFileSync } from 'node:child_process';

const repository = process.argv[2] ?? 'toilatrung/sires';
// Keep repository/actor metadata out of the buffered response (100 runs exceed 1 MiB).
const api = (path, query) => JSON.parse(execFileSync('gh', ['api', path, '--jq', query], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
}));
let developPulls;
const developPullRequests = () => {
  if (developPulls) return developPulls;
  developPulls = [];
  for (let page = 1; page <= 10; page++) {
    const batch = api(`repos/${repository}/pulls?state=all&base=develop&per_page=100&page=${page}`,
      '[.[] | {base: {ref: .base.ref, sha: .base.sha}, headRef: .head.ref, headRepoId: .head.repo.id, created_at, closed_at}]');
    developPulls.push(...batch);
    if (batch.length < 100) break;
  }
  return developPulls;
};
const runs = (event, branch = '') => {
  const found = [];
  for (let page = 1; page <= 10; page++) {
    const query = new URLSearchParams({ event, status: 'completed', per_page: '100', page: String(page) });
    if (branch) query.set('branch', branch);
    const batch = api(`repos/${repository}/actions/workflows/ci.yml/runs?${query}`,
      '[.workflow_runs[] | {id, conclusion, pull_requests: [.pull_requests[] | {base: {ref: .base.ref, sha: .base.sha}}], head_sha, head_branch, headRepoId: .head_repository.id, run_attempt, created_at, updated_at}]');
    for (const run of batch) {
      if (run.conclusion === 'cancelled') continue;
      if (event === 'pull_request') {
        // GitHub empties workflow_runs.pull_requests after the trial branch is deleted.
        // Resolve closed PRs by branch, repository and lifetime, including earlier pushes.
        const pr = run.pull_requests.find(({ base }) => base.ref === 'develop')
          ?? developPullRequests().find((pull) => pull.headRef === run.head_branch
            && pull.headRepoId === run.headRepoId
            && pull.created_at <= run.created_at
            && (!pull.closed_at || run.created_at <= pull.closed_at));
        if (!pr) continue;
        const comparison = api(`repos/${repository}/compare/${pr.base.sha}...${run.head_sha}`,
          '{files: [.files[] | {filename, previous_filename}]}');
        if (!comparison.files?.length || comparison.files.length >= 300 ||
            comparison.files.some(({ filename, previous_filename }) => [filename, previous_filename]
              .filter(Boolean).some((file) => !/^(agent\/|docs\/(?!api-design\/))/.test(file)))) continue;
      }
      const jobs = api(`repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
        '[.jobs[] | {name, conclusion}]');
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
