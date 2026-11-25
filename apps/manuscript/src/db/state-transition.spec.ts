// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00030 S02 (H1, DEC-57): dòng app.state_transition sinh từ khai báo ở src/domain/state-machines.ts bằng helper của
// PID-00158; trên database dựng từ migration, trigger change_proposal_state, build_state, manuscript_file_state nhận
// đúng các cặp khai báo (EC14) và Change Proposal có base = revision hiện hành chuyển được Accepted (EC09, nhánh chấp
// nhận). Cần Docker (Testcontainers).

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compareStateTransitionRows,
  type DatabaseStateTransitionRow,
  findTransition,
  renderStateTransitionSql,
  type StateMachine,
} from '@sires/platform';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildMachine, changeProposalMachine, manuscriptFileMachine, stateMachines } from '../domain/state-machines';
import {
  approval,
  insertBuild,
  insertFile,
  insertProposal,
  insertRevision,
  type ManuscriptPostgres,
  type SeededManuscript,
  seedManuscript,
  sqlState,
  startManuscriptPostgres,
} from './database.testkit';
import { MIGRATIONS_FOLDER, runMigrations } from './migrate';

const CONTAINER_TIMEOUT = 180_000;
const MIGRATED = 'manuscript_states';
const REFERENCE = 'manuscript_states_reference';
const ROWS_SQL = 'SELECT machine, from_state, to_state, code FROM app.state_transition ORDER BY 1, 2, 3';

type Row = DatabaseStateTransitionRow & Record<string, unknown>;

/** Bảng, câu UPDATE đổi trạng thái (giữ đúng các CHECK khác của bảng) và cách tạo dòng ở trạng thái nguồn. */
interface Target {
  readonly machine: StateMachine;
  readonly create: (client: Client, ms: SeededManuscript, from: string) => Promise<string>;
  readonly update: (client: Client, id: string, to: string) => Promise<unknown>;
}

const TARGETS: readonly Target[] = [
  {
    machine: changeProposalMachine,
    // Accepted kèm citation check đạt và phê duyệt (change_proposal_accept_ck); base luôn là revision hiện hành để chỉ
    // trigger trạng thái quyết định.
    create: (client, ms, from) =>
      insertProposal(client, ms, {
        status: from,
        citationCheckPassed: from === 'Accepted' ? true : null,
        approved: from === 'Accepted',
      }),
    update: (client, id, to) =>
      client.query(
        `UPDATE app.change_proposal SET status = $1,
           citation_check_id = CASE WHEN $1 = 'Accepted' THEN gen_random_uuid() ELSE citation_check_id END,
           citation_check_passed = CASE WHEN $1 = 'Accepted' THEN true ELSE citation_check_passed END,
           approval = CASE WHEN $1 = 'Accepted' THEN $2::jsonb ELSE approval END
         WHERE id = $3`,
        [to, approval(id), id],
      ),
  },
  {
    machine: buildMachine,
    create: (client, ms, from) => insertBuild(client, ms, { status: from }),
    update: (client, id, to) => client.query('UPDATE app.build SET status = $1 WHERE id = $2', [to, id]),
  },
  {
    machine: manuscriptFileMachine,
    // Deleted đi cùng deleted_at (manuscript_file_deleted_ck); mỗi file một đường dẫn riêng.
    create: (client, ms, from) =>
      insertFile(client, ms, { path: `files/${randomUUID()}.tex`, status: from as 'Active' | 'Deleted' }),
    update: (client, id, to) =>
      client.query(
        `UPDATE app.manuscript_file SET status = $1, deleted_at = CASE WHEN $1 = 'Deleted' THEN now() END WHERE id = $2`,
        [to, id],
      ),
  },
];

describe('dòng chuyển trạng thái và trigger (PID-00030 S02)', () => {
  let pg: ManuscriptPostgres;

  beforeAll(async () => {
    pg = await startManuscriptPostgres();
    await pg.createDatabase(MIGRATED);
    await pg.createDatabase(REFERENCE);
    await runMigrations(pg.url(MIGRATED, 'migrator'));
    await pg.applyReferenceDdl(REFERENCE);
  }, CONTAINER_TIMEOUT);

  afterAll(async () => {
    await pg?.stop();
  });

  it('khớp DDL tham chiếu (spec B2)', async () => {
    const migrated = await pg.admin<Row>(MIGRATED, ROWS_SQL);
    // Khớp khai báo domain (hàm so dòng của PID-00158): không thiếu, không thừa, mã đúng.
    expect(compareStateTransitionRows(migrated, stateMachines)).toEqual({
      missing: [],
      unexpected: [],
      codeMismatch: [],
    });
    // Khớp từng dòng (kể cả mã NULL) với database dựng từ DDL tham chiếu.
    expect(migrated).toEqual(await pg.admin<Row>(REFERENCE, ROWS_SQL));
    expect(migrated.map((row) => row.machine)).toEqual([
      'build',
      'build',
      'build',
      'build',
      'change_proposal',
      'change_proposal',
      'change_proposal',
      'manuscript_file',
    ]);
  });

  it('khớp DDL tham chiếu (spec B2) — file migration là đúng SQL helper sinh, không sửa tay (H1)', () => {
    const file = readFileSync(join(MIGRATIONS_FOLDER, '0001_state_transition.sql'), 'utf8').replace(/\r\n/g, '\n');
    // Ba dòng giấy phép và dòng trống do add-license.mjs thêm; phần còn lại phải bằng đầu ra của helper.
    expect(file.split('\n').slice(4).join('\n')).toBe(renderStateTransitionSql(stateMachines));
    // Migration đầu không chép dòng chuyển trạng thái của DDL: một nguồn duy nhất là khai báo (DR-01).
    const init = readFileSync(join(MIGRATIONS_FOLDER, '0000_init.sql'), 'utf8');
    expect(init).not.toMatch(/^INSERT INTO app\.state_transition/m);
  });

  it('ngoài bảng bị từ chối (EC14)', async () => {
    const ms = await seedManuscript(pg, MIGRATED);
    const pairs = TARGETS.flatMap((target) =>
      target.machine.states.flatMap((from) =>
        target.machine.states.filter((to) => to !== from).map((to) => ({ target, from, to })),
      ),
    );
    // Dựng mọi dòng ở trạng thái nguồn trong một phiên _system, rồi thử mọi cặp trong một phiên _app (savepoint mỗi cặp).
    const ids = await pg.asRole(MIGRATED, 'system', undefined, async (client) => {
      const created: string[] = [];
      for (const { target, from } of pairs) created.push(await target.create(client, ms, from));
      return created;
    });
    const outcomes = await pg.asRole(MIGRATED, 'app', ms.accountId, async (client) => {
      const result: { state?: string; message?: string }[] = [];
      for (const [index, { target, to }] of pairs.entries()) {
        await client.query('SAVEPOINT pair');
        try {
          await target.update(client, ids[index] as string, to);
          await client.query('RELEASE SAVEPOINT pair');
          result.push({});
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT pair');
          result.push({ state: sqlState(error), message: (error as Error).message });
        }
      }
      return result;
    });
    // 26 cặp khác trạng thái: trigger nhận đúng 8 cặp khai báo; 18 cặp còn lại bị tg_state_transition từ chối.
    let accepted = 0;
    for (const [index, { target, from, to }] of pairs.entries()) {
      const label = `${target.machine.machine}: ${from} → ${to}`;
      if (findTransition(target.machine, from, to)) {
        expect(outcomes[index], label).toEqual({});
        accepted += 1;
      } else {
        expect(outcomes[index]?.state, label).toBe('23514');
        expect(outcomes[index]?.message, label).toContain(
          `Chuyển trạng thái không hợp lệ cho ${target.machine.machine}`,
        );
      }
    }
    expect(pairs).toHaveLength(26);
    expect(accepted).toBe(8);
    // Các cặp tiêu biểu của EC14 giữ nguyên trạng thái nguồn.
    for (const [machine, table, from, to] of [
      ['change_proposal', 'app.change_proposal', 'Rejected', 'Accepted'],
      ['build', 'app.build', 'Succeeded', 'Running'],
      ['manuscript_file', 'app.manuscript_file', 'Deleted', 'Active'],
    ] as const) {
      const index = pairs.findIndex(
        (pair) => pair.target.machine.machine === machine && pair.from === from && pair.to === to,
      );
      expect(await pg.admin(MIGRATED, `SELECT status FROM ${table} WHERE id = $1`, [ids[index]])).toEqual([
        { status: from },
      ]);
    }
  });

  it('chấp nhận khi revision gốc khớp (EC09)', async () => {
    const ms = await seedManuscript(pg, MIGRATED);
    const [current, stale] = await pg.asRole(MIGRATED, 'system', undefined, async (client) => [
      await insertProposal(client, ms),
      await insertProposal(client, ms),
    ]);
    const accept = (id: string) =>
      pg.asRole(MIGRATED, 'app', ms.accountId, (client) =>
        client.query(
          `UPDATE app.change_proposal SET status = 'Accepted', citation_check_id = $1, citation_check_passed = true, approval = $2
           WHERE id = $3`,
          [randomUUID(), approval(id), id],
        ),
      );
    // Base = revision hiện hành, citation check đạt, có phê duyệt: chuyển được Accepted.
    await accept(current);
    expect(
      await pg.admin(MIGRATED, 'SELECT status, row_version FROM app.change_proposal WHERE id = $1', [current]),
    ).toEqual([{ status: 'Accepted', row_version: 2 }]);
    // Revision hiện hành đổi (revision mới từ proposal vừa chấp nhận): proposal còn lại thành lỗi thời, phải chuyển Outdated.
    await pg.asRole(MIGRATED, 'app', ms.accountId, async (client) => {
      const next = await insertRevision(client, ms, {
        number: 2,
        parentId: ms.revisionId,
        source: 'change_proposal',
        changeProposalId: current,
      });
      await client.query('UPDATE app.manuscript SET current_revision_id = $1 WHERE id = $2', [next, ms.manuscriptId]);
    });
    const rejected = await accept(stale).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(sqlState(rejected)).toBe('23514');
    expect(rejected?.message).toContain('đã lỗi thời');
    await pg.asRole(MIGRATED, 'app', ms.accountId, (client) =>
      client.query(`UPDATE app.change_proposal SET status = 'Outdated' WHERE id = $1`, [stale]),
    );
    expect(await pg.admin(MIGRATED, 'SELECT status FROM app.change_proposal WHERE id = $1', [stale])).toEqual([
      { status: 'Outdated' },
    ]);
  });
});
