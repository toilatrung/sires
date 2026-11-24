// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AGENT_ACTOR,
  SYSTEM_ACTOR,
  approval,
  insertArtifact,
  insertClaim,
  insertEvidence,
  insertVersion,
  seedProject,
  seedReference,
  startResearchPostgres,
  type ResearchPostgres,
} from './database.testkit';
import { runMigrations } from './migrate';

/** Gọi từ migration.spec.ts để mọi EC01–EC12 thuộc suite migration theo hồ sơ. */
export function migrationBehaviourTests() {
  describe('hành vi DDL research (EC01–EC12)', () => {
    let pg: ResearchPostgres;
    const db = 'research_behaviour';
    const accountId = randomUUID();
    let projectId: string;
    let referenceId: string;
    const asApp = <T>(work: (client: Client) => Promise<T>) => pg.asRole(db, 'app', accountId, work);
    const asSystem = <T>(work: (client: Client) => Promise<T>) => pg.asRole(db, 'system', undefined, work);

    beforeAll(async () => {
      pg = await startResearchPostgres();
      await pg.createDatabase(db);
      await runMigrations(pg.migratorUrl(db));
      await asSystem(async (client) => {
        projectId = await seedProject(client, accountId);
        referenceId = await seedReference(client, accountId, projectId);
      });
    }, 180_000);
    afterAll(async () => {
      await pg?.stop();
    });

    it('chạy trên PostgreSQL 16 (EC01), migrator và owner không có đặc quyền', async () => {
      const rows = await pg.admin<{ version: string }>(db, "SELECT current_setting('server_version_num') AS version");
      expect(Number(rows[0].version)).toBeGreaterThanOrEqual(160000);
      expect(Number(rows[0].version)).toBeLessThan(170000);
      const roles = await pg.admin(
        db,
        `SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
        FROM pg_roles WHERE rolname IN ('sires_research_owner','sires_research_migrator') ORDER BY rolname`,
      );
      expect(roles).toHaveLength(2);
      for (const role of roles)
        expect(role).toMatchObject({ rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false });
      const owners = await pg.admin<{ owner: string }>(
        db,
        `SELECT DISTINCT pg_get_userbyid(relowner) AS owner
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('app','replica') AND c.relkind='r'`,
      );
      expect(owners).toEqual([{ owner: 'sires_research_owner' }]);
    });

    it('RLS (EC04): tài khoản khác, thiếu context và ghi sai tenant', async () => {
      const evidence = await asApp((c) => insertEvidence(c, accountId, projectId, referenceId));
      const tables = [
        'app.artifact',
        'app.artifact_version',
        'app.claim',
        'app.claim_evidence_link',
        'app.claim_revision',
        'app.evidence',
        'app.idempotency_key',
        'app.provenance_input',
        'app.verification_result',
        'replica.project_reference_scope',
        'replica.project_state',
        'replica.reference_state',
      ];
      await asApp(async (c) => {
        const artifactId = await insertArtifact(c, accountId, projectId);
        const versionId = await insertVersion(c, accountId, projectId, artifactId);
        const claimId = await insertClaim(c, accountId, projectId);
        await c.query(
          `INSERT INTO app.claim_revision (claim_id,account_id,revision,statement,approval_status,support_status,created_by)
           VALUES ($1,$2,1,'Bản gốc','Draft','Supported',$3)`,
          [claimId, accountId, SYSTEM_ACTOR],
        );
        await c.query(
          `INSERT INTO app.claim_evidence_link (account_id,project_id,claim_id,evidence_id,relation,created_by)
           VALUES ($1,$2,$3,$4,'supports',$5)`,
          [accountId, projectId, claimId, evidence, SYSTEM_ACTOR],
        );
        await c.query(
          `INSERT INTO app.verification_result
           (account_id,project_id,target_type,target_id,agent_run_id,outcome,thresholds_used,created_by)
           VALUES ($1,$2,'claim',$3,$4,'Supported','{}',$5)`,
          [accountId, projectId, claimId, randomUUID(), SYSTEM_ACTOR],
        );
        await c.query(
          `INSERT INTO app.provenance_input (account_id,dependent_type,dependent_id,input_type,input_id,input_version)
           VALUES ($1,'artifact_version',$2,'claim',$3,1)`,
          [accountId, versionId, claimId],
        );
        await c.query(
          `INSERT INTO app.idempotency_key (account_id,key,operation,request_hash)
           VALUES ($1,$2,'research-test',$3)`,
          [accountId, randomUUID(), Buffer.alloc(32)],
        );
        // Đối chứng: tenant A phải thấy dữ liệu mồi ở từng bảng, tránh test xanh vì bảng rỗng.
        for (const table of tables)
          expect((await c.query(`SELECT 1 FROM ${table}`)).rowCount, table).toBeGreaterThan(0);
      });
      const tenantTables = await pg.admin<{ name: string }>(
        db,
        `SELECT table_schema || '.' || table_name AS name FROM information_schema.columns
         WHERE table_schema IN ('app','replica') AND column_name='account_id'
         AND table_name NOT IN ('outbox','inbox') ORDER BY 1`,
      );
      expect(tenantTables.map((row) => row.name)).toEqual(tables);
      for (const tenant of [randomUUID(), undefined]) {
        await pg.asRole(db, 'app', tenant, async (client) => {
          for (const table of tables) expect((await client.query(`SELECT * FROM ${table}`)).rows, table).toEqual([]);
        });
      }
      expect((await asApp((c) => c.query('SELECT id FROM app.evidence WHERE id=$1', [evidence]))).rowCount).toBe(1);
      await expect(asApp((c) => insertArtifact(c, randomUUID(), projectId))).rejects.toMatchObject({ code: '42501' });
      for (const table of ['replica.reference_state', 'replica.project_reference_scope', 'replica.project_state']) {
        await expect(asApp((c) => c.query(`DELETE FROM ${table}`))).rejects.toMatchObject({ code: '42501' });
      }
    });

    it('bản sao trống chặn Evidence (EC05)', async () => {
      await expect(asApp((c) => insertEvidence(c, accountId, projectId, randomUUID()))).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('Evidence chỉ từ Reference Trusted được chọn (EC06)', async () => {
      for (const [status, scope] of [
        ['Trusted', null],
        ['Trusted', 'Removed'],
        ['Pending', 'Active'],
      ] as const) {
        const ref = await asSystem((c) => seedReference(c, accountId, projectId, status, scope));
        await expect(asApp((c) => insertEvidence(c, accountId, projectId, ref))).rejects.toMatchObject({
          code: '23514',
        });
      }
      await expect(asApp((c) => insertEvidence(c, accountId, projectId, referenceId))).resolves.toBeTypeOf('string');
    });

    it('ràng buộc ArtifactVersion (EC07)', async () => {
      const artifactId = await asApp((c) => insertArtifact(c, accountId, projectId));
      for (const status of ['Accepted', 'Superseded']) {
        await expect(
          asApp((c) => insertVersion(c, accountId, projectId, artifactId, { status })),
        ).rejects.toMatchObject({ code: '23514' });
      }
      for (const content of [null, { text: 'Có cả hai' }]) {
        await expect(
          asApp((c) =>
            insertVersion(c, accountId, projectId, artifactId, { content, file: content ? 'research/test' : null }),
          ),
        ).rejects.toMatchObject({ code: '23514' });
      }
      await asApp(async (c) => {
        const id = await insertVersion(c, accountId, projectId, artifactId, {
          status: 'Accepted',
          approval: approval(artifactId),
        });
        await c.query('UPDATE app.artifact SET current_accepted_version_id=$1 WHERE id=$2', [id, artifactId]);
      });
      await expect(
        asApp((c) =>
          insertVersion(c, accountId, projectId, artifactId, {
            version: 2,
            status: 'Accepted',
            approval: approval(artifactId),
          }),
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('Claim Accepted cần đánh giá và phê duyệt (EC08)', async () => {
      for (const options of [
        { status: 'Accepted', support: 'Not Assessed', approval: approval(randomUUID()) },
        { status: 'Accepted', support: 'Supported' },
      ])
        await expect(asApp((c) => insertClaim(c, accountId, projectId, options))).rejects.toMatchObject({
          code: '23514',
        });
      await expect(
        asApp((c) => insertClaim(c, accountId, projectId, { status: 'Accepted', approval: approval(randomUUID()) })),
      ).resolves.toBeTypeOf('string');
    });

    it('provenance bắt buộc (EC09)', async () => {
      await expect(
        asApp((c) => insertEvidence(c, accountId, projectId, referenceId, { actor: AGENT_ACTOR })),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(asApp((c) => insertClaim(c, accountId, projectId, { actor: AGENT_ACTOR }))).rejects.toMatchObject({
        code: '23514',
      });
      const artifactId = await asApp((c) => insertArtifact(c, accountId, projectId));
      await expect(
        asApp((c) => insertVersion(c, accountId, projectId, artifactId, { provenance: null })),
      ).rejects.toMatchObject({ code: '23502' });
      await expect(
        asApp((c) =>
          insertVersion(c, accountId, projectId, artifactId, {
            provenance: { createdBy: { type: 'invalid' }, inputs: [] },
          }),
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('provenance thiếu inputs phải bị từ chối (EC09)', async () => {
      const artifactId = await asApp((c) => insertArtifact(c, accountId, projectId));
      await expect(
        asApp((c) =>
          insertVersion(c, accountId, projectId, artifactId, {
            provenance: { createdBy: SYSTEM_ACTOR },
          }),
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    // G4: giữ assertion từ chối (không skip/expected failure) trong lúc chờ PO sửa DDL G1–G3.
    const missingAgent = { type: 'agent', agentRunId: randomUUID() };
    const missingInstance = { ...missingAgent, agent: 'analysis' };
    const writingActor = { ...missingAgent, agent: 'writing' };
    const evidenceActor = { ...missingAgent, agent: 'evidence_retrieval' };
    const synthesisActor = { ...missingAgent, agent: 'synthesis' };

    it.each([
      ['I02', { createdBy: missingAgent, inputs: [] }],
      ['I03', { createdBy: missingInstance, inputs: [] }],
      ['I04', { createdBy: SYSTEM_ACTOR, inputs: {} }],
    ])('%s: ArtifactVersion từ chối provenance không hợp lệ (EC09)', async (_id, provenance) => {
      const artifactId = await asApp((c) => insertArtifact(c, accountId, projectId));
      await expect(
        asApp((c) => insertVersion(c, accountId, projectId, artifactId, { provenance })),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('I05: ArtifactVersion từ chối created_by thiếu agent', async () => {
      const artifactId = await asApp((c) => insertArtifact(c, accountId, projectId));
      await expect(
        asApp((c) => insertVersion(c, accountId, projectId, artifactId, { actor: missingAgent })),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it.each([
      ['I06', SYSTEM_ACTOR, { createdBy: SYSTEM_ACTOR }],
      ['I07', evidenceActor, { createdBy: evidenceActor }],
      ['I08', missingAgent, { createdBy: missingAgent, inputs: [] }],
    ])('%s: Evidence từ chối actor/provenance không hợp lệ (EC09)', async (_id, actor, provenance) => {
      await expect(
        asApp((c) => insertEvidence(c, accountId, projectId, referenceId, { actor, provenance })),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('I09: Claim từ chối provenance thiếu inputs (EC09)', async () => {
      await expect(
        asApp((c) =>
          insertClaim(c, accountId, projectId, {
            actor: synthesisActor,
            provenance: { createdBy: synthesisActor },
          }),
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    const approvalCases = [
      ['thiếu approvedBy (I10, I12)', 'approvedBy'],
      ['thiếu decision', 'decision'],
      ['thiếu apr', 'apr'],
      ['approvedBy thiếu type (I13)', 'type'],
      ['chỉ còn bốn trường (I11)', 'all'],
    ] as const;
    for (const entity of ['Claim', 'ArtifactVersion'] as const) {
      it.each(approvalCases)(`${entity} Accepted từ chối approval %s (EC07, EC08)`, async (_label, field) => {
        const record: Record<string, unknown> = approval(randomUUID());
        if (field === 'type') record.approvedBy = { accountId };
        else if (field === 'all') {
          delete record.approvedBy;
          delete record.decision;
          delete record.apr;
        } else delete record[field];
        await expect(
          asApp(async (c) => {
            if (entity === 'Claim')
              return insertClaim(c, accountId, projectId, { status: 'Accepted', approval: record });
            const artifactId = await insertArtifact(c, accountId, projectId);
            return insertVersion(c, accountId, projectId, artifactId, { status: 'Accepted', approval: record });
          }),
        ).rejects.toMatchObject({ code: '23514' });
      });
    }

    it('I14: Artifact từ chối analysis thiếu instance', async () => {
      await expect(asApp((c) => insertArtifact(c, accountId, projectId, missingInstance))).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('I15: ClaimEvidenceLink từ chối created_by thiếu agent', async () => {
      await expect(
        asApp(async (c) => {
          const evidenceId = await insertEvidence(c, accountId, projectId, referenceId);
          const claimId = await insertClaim(c, accountId, projectId);
          return c.query(
            `INSERT INTO app.claim_evidence_link (account_id,project_id,claim_id,evidence_id,relation,created_by)
           VALUES ($1,$2,$3,$4,'supports',$5)`,
            [accountId, projectId, claimId, evidenceId, missingAgent],
          );
        }),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('I16: VerificationResult từ chối created_by thiếu agent', async () => {
      await expect(
        asApp((c) =>
          c.query(
            `INSERT INTO app.verification_result
         (account_id,project_id,target_type,target_id,agent_run_id,outcome,thresholds_used,created_by)
         VALUES ($1,$2,'claim',$3,$4,'Supported','{}',$5)`,
            [accountId, projectId, randomUUID(), randomUUID(), missingAgent],
          ),
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('I17: Artifact từ chối updated_by thiếu agent', async () => {
      const artifactId = await asApp((c) => insertArtifact(c, accountId, projectId));
      await expect(
        asApp((c) => c.query('UPDATE app.artifact SET updated_by=$1 WHERE id=$2', [missingAgent, artifactId])),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('V1/V2: agent writing và inputs rỗng hợp lệ vẫn ghi được (EC09)', async () => {
      await asApp(async (c) => {
        const provenance = { createdBy: writingActor, inputs: [] };
        const artifactId = await insertArtifact(c, accountId, projectId, writingActor);
        const versionId = await insertVersion(c, accountId, projectId, artifactId, { actor: writingActor, provenance });
        const evidenceId = await insertEvidence(c, accountId, projectId, referenceId, {
          actor: evidenceActor,
          provenance: { createdBy: evidenceActor, inputs: [] },
        });
        const claimId = await insertClaim(c, accountId, projectId, {
          actor: synthesisActor,
          provenance: { createdBy: synthesisActor, inputs: [] },
          status: 'Accepted',
          approval: approval(randomUUID()),
        });
        const rows = await c.query('SELECT created_by, provenance FROM app.artifact_version WHERE id=$1', [versionId]);
        expect(rows.rows).toEqual([{ created_by: writingActor, provenance }]);
        expect(evidenceId).toBeTypeOf('string');
        expect(claimId).toBeTypeOf('string');
      });
    });

    it('bản ghi bất biến (EC10)', async () => {
      const evidenceId = await asApp((c) => insertEvidence(c, accountId, projectId, referenceId));
      await expect(
        asApp((c) => c.query("UPDATE app.evidence SET quote='Đổi' WHERE id=$1", [evidenceId])),
      ).rejects.toMatchObject({ code: '23000' });
      await asApp((c) =>
        c.query("UPDATE app.evidence SET status='Excluded',status_reason='Lý do' WHERE id=$1", [evidenceId]),
      );
      const artifactId = await asApp((c) => insertArtifact(c, accountId, projectId));
      const versionId = await asApp((c) => insertVersion(c, accountId, projectId, artifactId));
      await expect(
        asApp((c) => c.query("UPDATE app.artifact_version SET content='{}' WHERE id=$1", [versionId])),
      ).rejects.toMatchObject({ code: '23000' });
      const claimId = await asApp((c) => insertClaim(c, accountId, projectId));
      await asApp(async (c) => {
        await c.query(
          `INSERT INTO app.claim_revision (claim_id,account_id,revision,statement,approval_status,support_status,created_by)
          VALUES ($1,$2,1,'Bản gốc','Draft','Supported',$3)`,
          [claimId, accountId, SYSTEM_ACTOR],
        );
        await c.query(
          `INSERT INTO app.verification_result
          (account_id,project_id,target_type,target_id,agent_run_id,outcome,thresholds_used,created_by)
          VALUES ($1,$2,'claim',$3,$4,'Supported','{}',$5)`,
          [accountId, projectId, claimId, randomUUID(), SYSTEM_ACTOR],
        );
      });
      for (const role of ['app', 'system'] as const) {
        for (const table of ['app.claim_revision', 'app.verification_result']) {
          await expect(
            pg.asRole(db, role, accountId, (c) => c.query(`UPDATE ${table} SET created_by=created_by`)),
          ).rejects.toMatchObject({ code: '42501' });
        }
      }
      // Superuser vượt quyền UPDATE và RLS; trigger bất biến vẫn phải chặn sửa nội dung.
      await expect(
        pg.admin(db, "UPDATE app.claim_revision SET statement='Đổi' WHERE claim_id=$1", [claimId]),
      ).rejects.toMatchObject({ code: '23000' });
      await expect(
        pg.admin(db, "UPDATE app.verification_result SET outcome='Unsupported' WHERE target_id=$1", [claimId]),
      ).rejects.toMatchObject({ code: '23000' });
    });

    it('chặn ghi theo vòng đời project (EC11)', async () => {
      for (const mode of ['Archived', 'Deleted', 'Missing']) {
        const pid = randomUUID();
        if (mode !== 'Missing')
          await asSystem((c) =>
            seedProject(c, accountId, pid, mode === 'Archived' ? 'Archived' : 'Active', mode === 'Deleted'),
          );
        const artifactId = await asSystem((c) => insertArtifact(c, accountId, pid));
        await expect(asApp((c) => insertClaim(c, accountId, pid))).rejects.toMatchObject({ code: '23514' });
        await expect(asApp((c) => insertVersion(c, accountId, pid, artifactId))).rejects.toMatchObject({
          code: '23514',
        });
        const claimId = await asSystem((c) => insertClaim(c, accountId, pid));
        const versionId = await asSystem((c) => insertVersion(c, accountId, pid, artifactId));
        await expect(
          asApp((c) => c.query("UPDATE app.claim SET statement='Đổi' WHERE id=$1", [claimId])),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          asApp((c) => c.query("UPDATE app.artifact_version SET review='{}' WHERE id=$1", [versionId])),
        ).rejects.toMatchObject({ code: '23514' });
      }
    }, 30_000);

    it('liên kết khác project (EC12)', async () => {
      const pid = await asSystem((c) => seedProject(c, accountId));
      const ref = await asSystem((c) => seedReference(c, accountId, pid));
      const evidenceId = await asApp((c) => insertEvidence(c, accountId, pid, ref));
      const claimId = await asApp((c) => insertClaim(c, accountId, projectId));
      await expect(
        asApp((c) =>
          c.query(
            `INSERT INTO app.claim_evidence_link
        (account_id,project_id,claim_id,evidence_id,relation,created_by) VALUES ($1,$2,$3,$4,'supports',$5)`,
            [accountId, projectId, claimId, evidenceId, SYSTEM_ACTOR],
          ),
        ),
      ).rejects.toMatchObject({ code: '23503' });
      const sameProjectEvidence = await asApp((c) => insertEvidence(c, accountId, projectId, referenceId));
      await asApp((c) =>
        c.query(
          `INSERT INTO app.claim_evidence_link
        (account_id,project_id,claim_id,evidence_id,relation,created_by) VALUES ($1,$2,$3,$4,'supports',$5)`,
          [accountId, projectId, claimId, sameProjectEvidence, SYSTEM_ACTOR],
        ),
      );
    });
  });
}
