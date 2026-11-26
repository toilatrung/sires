// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compareStateTransitionRows,
  findTransition,
  renderStateTransitionSql,
  type DatabaseStateTransitionRow,
} from '@sires/platform';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { artifactVersionMachine, claimApprovalMachine, evidenceMachine, stateMachines } from '../domain/state-machines';
import {
  approval,
  insertArtifact,
  insertClaim,
  insertEvidence,
  insertVersion,
  seedProject,
  seedReference,
  sqlState,
  startResearchPostgres,
  type ResearchPostgres,
} from './database.testkit';
import { MIGRATIONS_FOLDER, runMigrations } from './migrate';

describe('state machine research (S02)', () => {
  let pg: ResearchPostgres;
  const db = 'research_states';
  const reference = 'research_states_reference';
  const accountId = randomUUID();
  let projectId: string;
  let referenceId: string;

  beforeAll(async () => {
    pg = await startResearchPostgres();
    await pg.createDatabase(db);
    await pg.createDatabase(reference);
    await runMigrations(pg.migratorUrl(db));
    await pg.applyReferenceDdl(reference);
    await pg.asRole(db, 'system', undefined, async (c) => {
      projectId = await seedProject(c, accountId);
      referenceId = await seedReference(c, accountId, projectId);
    });
  }, 180_000);
  afterAll(async () => {
    await pg?.stop();
  });

  it('khớp DDL tham chiếu và khai báo; SQL được sinh bởi helper PID-00158', async () => {
    const sql = 'SELECT machine, from_state, to_state, code FROM app.state_transition ORDER BY 1,2,3';
    const rows = await pg.admin<DatabaseStateTransitionRow & Record<string, unknown>>(db, sql);
    expect(rows).toEqual(await pg.admin(reference, sql));
    expect(rows).toHaveLength(9);
    expect(compareStateTransitionRows(rows, stateMachines)).toEqual({ missing: [], unexpected: [], codeMismatch: [] });
    const migration = readFileSync(join(MIGRATIONS_FOLDER, '0000_init.sql'), 'utf8').replace(/\r\n/g, '\n');
    expect(migration).toContain(renderStateTransitionSql(stateMachines));
  });

  it('ngoài bảng bị từ chối (EC13); thử đủ 34 cặp, 9 chuyển hợp lệ', async () => {
    let count = 0;
    let accepted = 0;
    for (const machine of stateMachines) {
      for (const from of machine.states) {
        for (const to of machine.states) {
          const id = await pg.asRole(db, 'system', undefined, async (c) => {
            if (machine === evidenceMachine)
              return insertEvidence(c, accountId, projectId, referenceId, { status: from });
            if (machine === claimApprovalMachine)
              return insertClaim(c, accountId, projectId, { status: from, approval: approval(randomUUID()) });
            const artifactId = await insertArtifact(c, accountId, projectId);
            return insertVersion(c, accountId, projectId, artifactId, { status: from, approval: approval(artifactId) });
          });
          const [table, column] =
            machine === artifactVersionMachine
              ? ['app.artifact_version', 'status']
              : machine === evidenceMachine
                ? ['app.evidence', 'status']
                : ['app.claim', 'approval_status'];
          const outcome = await pg
            .asRole(db, 'app', accountId, (c) => c.query(`UPDATE ${table} SET ${column}=$1 WHERE id=$2`, [to, id]))
            .then(
              (result) => {
                expect(result.rowCount).toBe(1);
                return 'accepted';
              },
              (error: unknown) => sqlState(error),
            );
          // UPDATE giữ nguyên trạng thái là no-op đối với trigger DDL, không phải chuyển trạng thái mới.
          const allowed = from === to || findTransition(machine, from, to) !== undefined;
          expect(outcome, `${machine.machine}: ${from} → ${to}`).toBe(allowed ? 'accepted' : '23514');
          count += 1;
          if (from !== to && allowed) accepted += 1;
        }
      }
    }
    expect(count).toBe(34);
    expect(accepted).toBe(9);
  }, 120_000);
});
