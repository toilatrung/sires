// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Collect each completed attempt before requesting an all-jobs rerun of the same workflow run/SHA.
// Usage: node agent/execution/PID-00006/measure-spk10.cjs RUN_ID [--allow-failures] [--collect-only]
const { execFileSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const runId = process.argv[2];
assert.match(runId ?? '', /^\d+$/);
const root = `repos/toilatrung/sires/actions/runs/${runId}`;
const folder = join(__dirname, 'spk10', runId);
mkdirSync(folder, { recursive: true });
const api = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
const wait = () => new Promise((done) => setTimeout(done, 20_000));
const seconds = (from, to) => (Date.parse(to) - Date.parse(from)) / 1000;

async function main() {
  const initial = api(root);
  const sha = initial.head_sha;
  const count = process.argv.includes('--collect-only') ? initial.run_attempt : 5;
  for (let attempt = 1; attempt <= count; attempt += 1) {
    let run;
    while (true) {
      run = api(`${root}/attempts/${attempt}`);
      assert.equal(run.head_sha, sha, 'Measured SHA changed');
      if (run.status === 'completed') break;
      process.stdout.write(`SPK-10 attempt ${attempt}: ${run.status}\n`);
      await wait();
    }
    const jobs = api(`${root}/attempts/${attempt}/jobs?per_page=100`).jobs;
    let timing;
    // Timing endpoint describes the latest attempt; historical attempts retain their job timestamps.
    const latest = api(root);
    if (latest.run_attempt === attempt) timing = api(`${root}/timing`);
    const snapshotPath = join(folder, `attempt-${attempt}.json`);
    const metadata = existsSync(snapshotPath) ? JSON.parse(readFileSync(snapshotPath, 'utf8')) : {
      runId, attempt, sha, url: `${run.html_url}/attempts/${attempt}`,
      conclusion: run.conclusion, startedAt: run.run_started_at, updatedAt: run.updated_at,
      workflowSeconds: timing?.run_duration_ms !== undefined ? timing.run_duration_ms / 1000
        : seconds(run.run_started_at, run.updated_at),
      durationSource: timing?.run_duration_ms !== undefined ? 'GitHub run_duration_ms' : 'GitHub run_started_at to updated_at',
      jobs: jobs.map((job) => ({
        id: job.id, name: job.name, conclusion: job.conclusion, runnerName: job.runner_name,
        startedAt: job.started_at, completedAt: job.completed_at,
        seconds: seconds(job.started_at, job.completed_at),
        steps: job.steps.map((step) => ({
          name: step.name, conclusion: step.conclusion,
          startedAt: step.started_at, completedAt: step.completed_at,
          seconds: step.started_at && step.completed_at ? seconds(step.started_at, step.completed_at) : null,
        })),
      })), timing,
    };
    assert.equal(metadata.sha, sha);
    writeFileSync(snapshotPath, `${JSON.stringify(metadata, null, 2)}\n`);
    process.stdout.write(`SPK-10 attempt ${attempt}: ${run.conclusion}, ${metadata.workflowSeconds}s\n`);
    if (run.conclusion !== 'success' && !process.argv.includes('--allow-failures')) {
      throw new Error(`Attempt ${attempt} failed; inspect CI before further reruns`);
    }
    if (attempt < count && latest.run_attempt === attempt) {
      execFileSync('gh', ['run', 'rerun', runId, '--repo', 'toilatrung/sires'], { stdio: 'inherit' });
      while (api(root).run_attempt === attempt) await wait();
    }
  }
}
main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
