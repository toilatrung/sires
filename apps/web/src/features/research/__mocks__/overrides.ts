// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Stateful overrides of the 24 operations the research area owns (PID-00114 S01, H12), typed by PublicApi through
// the mock runtime of PID-00013. getTask, getWorkflow and getReferenceDocument are not here: their owners are
// planning, monitoring and library (tests override them locally).

import { MOCK_HEADER } from '../../../shell/mock';
import type { MockRequest, OperationId, Overrides, Schemas } from '../../../shell/mock';
import { agentActor, researcher } from './data';
import {
  assess, checkMermaid, endWorkflow, linkedClaimIds, newWorkflow, renderPreview, touch, verificationResult, type ResearchStore,
} from './store';

type Problem = Schemas['Problem'];

const problem = (status: number, code: Schemas['ErrorCode'], detail?: string): Problem => ({
  type: `https://sires.etroy.local/problems/${code}`, title: code, status, code, ...(detail ? { detail } : {}),
});

function page<T>(rows: readonly T[], query: { limit?: string; cursor?: string }) {
  const limit = Math.max(1, Number(query.limit ?? 50) || 50);
  const start = Math.max(0, Number(query.cursor ?? 0) || 0);
  return { items: rows.slice(start, start + limit), nextCursor: start + limit < rows.length ? String(start + limit) : null };
}

/** listEvidence returns Evidence: the in-context fields of getEvidence are dropped. */
function toEvidence(row: Schemas['EvidenceInContext']): Schemas['Evidence'] {
  const copy = { ...row };
  delete copy.reference;
  delete copy.before;
  delete copy.after;
  delete copy.linkedClaimIds;
  return copy;
}

const apr = (type: Schemas['ArtifactType']): Schemas['AprCode'] => (type === 'diagram' ? 'APR-07' : type === 'synthesis' ? 'APR-06' : 'APR-03');

const provider = 'anthropic' as const;
const model = 'claude-sonnet-5-5';

/** Every override of the area, bound to one store. */
export function createResearchOverrides(store: ResearchStore): Overrides {
  const replies = new Map<string, unknown>();

  /** Records the call; with an Idempotency-Key the first reply is returned again for the same key (DATA-IDEMP-001). */
  function handle<K extends OperationId, R>(request: MockRequest<K>, compute: () => R): R {
    const headers: Record<string, string> = {};
    for (const name of ['Idempotency-Key', 'If-Match', 'X-CSRF-Token', 'Content-Type']) {
      const value = request.request.headers.get(name);
      if (value !== null) headers[name] = value;
    }
    store.calls.push({ operationId: request.operationId, params: { ...request.params }, query: { ...request.query }, body: request.body, headers });
    const key = headers['Idempotency-Key'];
    if (!key) return compute();
    const cacheKey = `${request.operationId}:${key}`;
    if (replies.has(cacheKey)) return replies.get(cacheKey) as R;
    const reply = compute();
    replies.set(cacheKey, reply);
    return reply;
  }

  const inProject = (projectId: string) => projectId === store.projectId;
  const claimOf = (projectId: string, claimId: string) => (inProject(projectId) ? store.claims.find((row) => row.id === claimId) : undefined);
  const evidenceOf = (projectId: string, evidenceId: string) => (inProject(projectId) ? store.evidence.find((row) => row.id === evidenceId) : undefined);
  const artifactOf = (projectId: string, artifactId: string) => (inProject(projectId) ? store.artifacts.find((row) => row.id === artifactId) : undefined);
  const versionsOf = (artifactId: string) => store.versions.filter((row) => row.artifactId === artifactId).sort((a, b) => b.versionNumber - a.versionNumber);
  const claimEvent = (claim: Schemas['Claim'], fromState?: string) => store.emit({
    type: 'research.object_status_changed', projectId: store.projectId, objectType: 'claim', objectId: claim.id,
    ...(fromState ? { fromState } : {}), toState: claim.approvalStatus,
  });
  const versionEvent = (version: Schemas['ArtifactVersion'], fromState?: string) => store.emit({
    type: 'research.object_status_changed', projectId: store.projectId, objectType: 'artifact_version', objectId: version.id,
    ...(fromState ? { fromState } : {}), toState: version.status,
  });
  const refreshLatest = (artifactId: string) => {
    const artifact = store.artifacts.find((row) => row.id === artifactId);
    const latest = versionsOf(artifactId)[0];
    if (artifact && latest) artifact.latestVersion = { id: latest.id, versionNumber: latest.versionNumber, status: latest.status, createdAt: latest.createdAt };
  };
  const synthesisClaims = (version: Schemas['ArtifactVersion']) =>
    store.claims.filter((claim) => version.claimIds?.includes(claim.id) || claim.artifactVersionId === version.id);

  return {
    /* ---------- Evidence (path 11) ---------- */
    listEvidence: (request) => handle(request, () => {
      const { query } = request;
      const rows = inProject(request.params.projectId) ? store.evidence.filter((row) =>
        (!query.status || row.status === query.status) && (!query.referenceId || row.referenceId === query.referenceId)
        && (!query.taskId || row.taskId === query.taskId)) : [];
      return { status: 200, body: page(rows.map(toEvidence), query) };
    }),
    getEvidence: (request) => handle(request, () => {
      const row = evidenceOf(request.params.projectId, request.params.evidenceId);
      if (!row) return { status: 404, body: problem(404, 'not_found') };
      const reference = store.references.find((selection) => selection.referenceId === row.referenceId)?.reference;
      return { status: 200, body: { ...structuredClone(row), ...(reference ? { reference: structuredClone(reference) } : {}), linkedClaimIds: linkedClaimIds(store, row.id) } };
    }),
    excludeEvidence: (request) => handle(request, () => {
      const row = evidenceOf(request.params.projectId, request.params.evidenceId);
      if (!row || row.status !== 'Active') return { status: 409, body: problem(409, 'invalid_transition', 'Chỉ evidence Active mới loại được.') };
      row.status = 'Excluded';
      const reason = request.body?.reason;
      if (reason) row.statusReason = reason;
      else delete row.statusReason;
      touch(store, row);
      store.emit({ type: 'research.object_status_changed', projectId: store.projectId, objectType: 'evidence', objectId: row.id, fromState: 'Active', toState: 'Excluded' });
      for (const claim of store.claims.filter((candidate) => linkedClaimIds(store, row.id).includes(candidate.id))) {
        claim.needsReview = true;
        // Read-only for clients; the mock plays the server that sets it (EVID-INSPECTOR-001-AC02).
        Object.assign(claim, { needsReviewReasons: [...(claim.needsReviewReasons ?? []), { cause: 'evidence_excluded', sourceType: 'evidence', sourceId: row.id, at: store.now().toISOString() }] });
        touch(store, claim);
        claimEvent(claim);
      }
      return { status: 200, body: toEvidence(structuredClone(row)) };
    }),
    restoreEvidence: (request) => handle(request, () => {
      const row = evidenceOf(request.params.projectId, request.params.evidenceId);
      if (!row || row.status !== 'Excluded') return { status: 409, body: problem(409, 'invalid_transition', 'Chỉ evidence Excluded mới khôi phục được.') };
      row.status = 'Active';
      delete row.statusReason;
      touch(store, row);
      store.emit({ type: 'research.object_status_changed', projectId: store.projectId, objectType: 'evidence', objectId: row.id, fromState: 'Excluded', toState: 'Active' });
      return { status: 200, body: toEvidence(structuredClone(row)) };
    }),

    /* ---------- Claims (path 11) ---------- */
    listClaims: (request) => handle(request, () => {
      const { query } = request;
      const version = query.artifactVersionId ? store.versions.find((row) => row.id === query.artifactVersionId) : undefined;
      const rows = inProject(request.params.projectId) ? store.claims.filter((claim) =>
        (!query.approvalStatus || claim.approvalStatus === query.approvalStatus) && (!query.supportStatus || claim.supportStatus === query.supportStatus)
        && (!query.taskId || claim.taskId === query.taskId) && (!query.needsReview || String(claim.needsReview) === query.needsReview)
        && (!query.artifactVersionId || claim.artifactVersionId === query.artifactVersionId || Boolean(version?.claimIds?.includes(claim.id)))) : [];
      return { status: 200, body: page(structuredClone(rows), query) };
    }),
    getClaim: (request) => handle(request, () => {
      const claim = claimOf(request.params.projectId, request.params.claimId);
      if (!claim) return { status: 404, body: problem(404, 'not_found') };
      return { status: 200, body: structuredClone(claim), headers: { ETag: `"${claim.rowVersion}"` } };
    }),
    updateClaimStatement: (request) => handle(request, () => {
      const claim = claimOf(request.params.projectId, request.params.claimId);
      if (!claim || claim.approvalStatus === 'Rejected') return { status: 409, body: problem(409, 'action_not_allowed_in_state', 'Claim Rejected không sửa được.') };
      if (request.request.headers.get('If-Match') !== `"${claim.rowVersion}"`) return { status: 412, body: problem(412, 'precondition_failed') };
      const fromState = claim.approvalStatus;
      claim.statement = request.body?.statement ?? claim.statement;
      if (claim.approvalStatus === 'Accepted') {
        claim.approvalStatus = 'Draft';
        claim.supportStatus = 'Not Assessed';
        delete claim.approval;
      }
      touch(store, claim);
      claimEvent(claim, fromState);
      return { status: 200, body: structuredClone(claim) };
    }),
    linkEvidenceToClaim: (request) => handle(request, () => {
      const claim = claimOf(request.params.projectId, request.params.claimId);
      const evidenceId = request.body?.evidenceId ?? '';
      const evidence = evidenceOf(request.params.projectId, evidenceId);
      if (!claim || claim.approvalStatus !== 'Draft') return { status: 409, body: problem(409, 'action_not_allowed_in_state', 'Chỉ claim Draft mới liên kết được evidence.') };
      if (!evidence || evidence.status !== 'Active') {
        return { status: 422, body: problem(422, 'reference_not_trusted', 'Evidence phải Active và thuộc reference Trusted đang được chọn.') };
      }
      if (claim.evidenceLinks?.some((link) => link.evidenceId === evidenceId)) return { status: 409, body: problem(409, 'invalid_transition', 'Evidence đã liên kết với claim này.') };
      claim.evidenceLinks = [...(claim.evidenceLinks ?? []), { claimId: claim.id, evidenceId, relation: request.body!.relation, createdBy: researcher }];
      touch(store, claim);
      claimEvent(claim);
      return { status: 201, body: structuredClone(claim) };
    }),
    unlinkEvidenceFromClaim: (request) => handle(request, () => {
      const claim = claimOf(request.params.projectId, request.params.claimId);
      if (!claim || claim.approvalStatus !== 'Draft' || !claim.evidenceLinks?.some((link) => link.evidenceId === request.params.evidenceId)) {
        return { status: 409, body: problem(409, 'action_not_allowed_in_state', 'Không có liên kết này hoặc claim đã quyết định.') };
      }
      claim.evidenceLinks = claim.evidenceLinks.filter((link) => link.evidenceId !== request.params.evidenceId);
      touch(store, claim);
      claimEvent(claim);
      return { status: 204 };
    }),
    acceptClaim: (request) => handle(request, () => {
      const claim = claimOf(request.params.projectId, request.params.claimId);
      if (!claim || claim.approvalStatus !== 'Draft') return { status: 409, body: problem(409, 'invalid_transition', 'Claim đã được quyết định ở nơi khác.') };
      if (claim.supportStatus === 'Not Assessed') return { status: 400, body: problem(400, 'validation_failed', 'Claim chưa được kiểm chứng (Not Assessed).') };
      const seen = request.body?.rowVersion;
      if (seen !== undefined && seen !== claim.rowVersion) return { status: 409, body: problem(409, 'invalid_transition', 'Claim đã đổi phiên bản sau khi bạn mở.') };
      claim.approvalStatus = 'Accepted';
      claim.approval = { approvedBy: researcher, decidedAt: store.now().toISOString(), decision: 'approved', objectType: 'claim', objectId: claim.id, objectVersion: claim.rowVersion, apr: 'APR-06' };
      touch(store, claim);
      claimEvent(claim, 'Draft');
      return { status: 200, body: structuredClone(claim) };
    }),
    rejectClaim: (request) => handle(request, () => {
      const claim = claimOf(request.params.projectId, request.params.claimId);
      if (!claim || claim.approvalStatus !== 'Draft') return { status: 409, body: problem(409, 'invalid_transition', 'Claim đã được quyết định ở nơi khác.') };
      claim.approvalStatus = 'Rejected';
      const reason = request.body?.reason;
      claim.approval = {
        approvedBy: researcher, decidedAt: store.now().toISOString(), decision: 'rejected', objectType: 'claim', objectId: claim.id, objectVersion: claim.rowVersion, apr: 'APR-06',
        ...(reason ? { reason } : {}),
      };
      touch(store, claim);
      claimEvent(claim, 'Draft');
      return { status: 200, body: structuredClone(claim) };
    }),
    verifyClaim: (request) => handle(request, () => {
      const claim = claimOf(request.params.projectId, request.params.claimId);
      if (!claim || claim.approvalStatus !== 'Draft') return { status: 409, body: problem(409, 'action_not_allowed_in_state', 'Chỉ claim Draft mới kiểm chứng được.') };
      const running = store.workflows.find((row) => row.type === 'verification' && row.subject?.id === claim.id && row.status === 'Running');
      if (running) return { status: 409, body: problem(409, 'active_workflow_exists', 'Claim đang có một lần kiểm chứng.') };
      const workflow = newWorkflow(store, 'verification', { type: 'claim', id: claim.id }, request.request.headers.get('Idempotency-Key') ?? '', claim.taskId,
        [['Đọc evidence liên kết', 'verification'], ['Đánh giá mức hỗ trợ', 'verification']]);
      store.startWorkflow(workflow, () => {
        if (store.options.verification === 'fails') return endWorkflow(store, workflow, 'Failed');
        const outcome = assess(store, claim);
        claim.supportStatus = outcome;
        claim.lastVerification = verificationResult(store, claim, outcome);
        touch(store, claim, agentActor('verification', 500));
        endWorkflow(store, workflow, 'Succeeded');
        claimEvent(claim);
      });
      return { status: 202, body: structuredClone(workflow), headers: { Location: `/api/v1/workflows/${workflow.id}` } };
    }),

    /* ---------- Artifacts (path 14) ---------- */
    listArtifacts: (request) => handle(request, () => {
      const { query } = request;
      const rows = inProject(request.params.projectId) ? store.artifacts.filter((row) =>
        (!query.type || row.type === query.type) && (!query.taskId || row.taskId === query.taskId)
        && (!query.hasAccepted || String(Boolean(row.currentAcceptedVersionId)) === query.hasAccepted)) : [];
      return { status: 200, body: page(structuredClone(rows), query) };
    }),
    getArtifact: (request) => handle(request, () => {
      const artifact = artifactOf(request.params.projectId, request.params.artifactId);
      return artifact ? { status: 200, body: structuredClone(artifact) } : { status: 404, body: problem(404, 'not_found') };
    }),
    listArtifactVersions: (request) => handle(request, () => ({
      status: 200, body: { items: artifactOf(request.params.projectId, request.params.artifactId) ? structuredClone(versionsOf(request.params.artifactId)) : [] },
    })),
    createArtifactVersion: (request) => handle(request, () => {
      const artifact = artifactOf(request.params.projectId, request.params.artifactId);
      const based = artifact ? versionsOf(artifact.id).find((row) => row.id === request.body?.basedOnVersionId) : undefined;
      if (!artifact || !based) return { status: 409, body: problem(409, 'base_revision_mismatch', 'Version gốc không thuộc artifact này.') };
      const at = store.now().toISOString();
      const content = request.body?.content ?? based.content ?? '';
      const versionNumber = (versionsOf(artifact.id)[0]?.versionNumber ?? 0) + 1;
      const version: Schemas['ArtifactVersion'] = {
        id: crypto.randomUUID(), accountId: researcher.accountId!, projectId: store.projectId, createdAt: at, createdBy: researcher, rowVersion: 1,
        artifactId: artifact.id, versionNumber, format: based.format, content, contentHash: `sha256:${versionNumber}${content.length}`, status: 'Draft',
        provenance: { createdBy: researcher, ...(artifact.taskId ? { taskId: artifact.taskId } : {}), inputs: [{ type: 'artifact_version', id: based.id, version: based.versionNumber, artifactId: artifact.id }] },
        ...(artifact.type === 'diagram' ? { validation: checkMermaid(content), ...(request.body?.diagramType ?? based.diagramType ? { diagramType: request.body?.diagramType ?? based.diagramType } : {}) } : {}),
      };
      store.versions.push(version);
      refreshLatest(artifact.id);
      versionEvent(version);
      return { status: 201, body: structuredClone(version) };
    }),
    acceptArtifactVersion: (request) => handle(request, () => {
      const artifact = artifactOf(request.params.projectId, request.params.artifactId);
      const version = artifact ? versionsOf(artifact.id).find((row) => row.id === request.params.versionId) : undefined;
      if (!artifact || !version || version.status !== 'Draft') return { status: 409, body: problem(409, 'invalid_transition', 'Chỉ version Draft mới chấp nhận được.') };
      if (artifact.type === 'synthesis') {
        const open = synthesisClaims(version).filter((claim) => claim.approvalStatus === 'Draft').length;
        if (open) return { status: 409, body: problem(409, 'action_not_allowed_in_state', `Còn ${open} claim chưa quyết định.`) };
      }
      if (artifact.type === 'diagram' && version.validation?.status !== 'valid') {
        return { status: 409, body: problem(409, 'action_not_allowed_in_state', 'Sơ đồ chưa qua kiểm tra cú pháp và render.') };
      }
      const previous = artifact.currentAcceptedVersionId ? store.versions.find((row) => row.id === artifact.currentAcceptedVersionId) : undefined;
      if (previous) {
        previous.status = 'Superseded';
        touch(store, previous);
        versionEvent(previous, 'Accepted');
      }
      version.status = 'Accepted';
      version.approval = { approvedBy: researcher, decidedAt: store.now().toISOString(), decision: 'approved', objectType: 'artifact_version', objectId: version.id, objectVersion: version.rowVersion, apr: apr(artifact.type) };
      touch(store, version);
      artifact.currentAcceptedVersionId = version.id;
      touch(store, artifact);
      refreshLatest(artifact.id);
      versionEvent(version, 'Draft');
      return { status: 200, body: structuredClone(version) };
    }),
    rejectArtifactVersion: (request) => handle(request, () => {
      const artifact = artifactOf(request.params.projectId, request.params.artifactId);
      const version = artifact ? versionsOf(artifact.id).find((row) => row.id === request.params.versionId) : undefined;
      if (!artifact || !version || version.status !== 'Draft') return { status: 409, body: problem(409, 'invalid_transition', 'Chỉ version Draft mới từ chối được.') };
      version.status = 'Rejected';
      const note = request.body?.note;
      version.review = { decision: 'rejected', by: researcher, at: store.now().toISOString(), ...(note ? { note } : {}) };
      touch(store, version);
      refreshLatest(artifact.id);
      versionEvent(version, 'Draft');
      return { status: 200, body: structuredClone(version) };
    }),

    /* ---------- Diagram Agent (path 13) ---------- */
    listDiagramTypes: (request) => handle(request, () => ({ status: 200, body: { items: structuredClone(store.diagramTypes) } })),
    requestDiagram: (request) => handle(request, () => {
      const artifact = request.body?.revisesArtifactId ? artifactOf(request.params.projectId, request.body.revisesArtifactId) : undefined;
      if (!artifact || !request.body?.description?.trim()) return { status: 400, body: problem(400, 'validation_failed', 'Cần chỉ dẫn và sơ đồ cần sửa.') };
      const running = store.workflows.find((row) => row.type === 'diagram' && row.subject?.id === artifact.id && row.status === 'Running');
      if (running) return { status: 409, body: problem(409, 'active_workflow_exists', 'Sơ đồ này đang có một yêu cầu sửa.') };
      const workflow = newWorkflow(store, 'diagram', { type: 'artifact', id: artifact.id }, request.request.headers.get('Idempotency-Key') ?? '', request.body.taskId,
        [['Đọc nguồn và chỉ dẫn', 'diagram'], ['Sửa nguồn Mermaid', 'diagram'], ['Kiểm tra cú pháp và render', 'diagram']]);
      const description = request.body.description.trim();
      const diagramType = request.body.diagramType;
      store.startWorkflow(workflow, () => {
        if (store.options.diagramRevision === 'fails') return endWorkflow(store, workflow, 'Failed');
        const latest = versionsOf(artifact.id)[0]!;
        const content = `${latest.content ?? ''}\n  %% Diagram Agent sửa theo chỉ dẫn: ${description.replace(/\n/g, ' ')}`;
        const at = store.now().toISOString();
        const version: Schemas['ArtifactVersion'] = {
          id: crypto.randomUUID(), accountId: researcher.accountId!, projectId: store.projectId, createdAt: at, createdBy: agentActor('diagram', 600), rowVersion: 1,
          artifactId: artifact.id, versionNumber: latest.versionNumber + 1, format: 'mermaid', content, contentHash: `sha256:${latest.versionNumber + 1}`,
          status: 'Draft', validation: checkMermaid(content), ...(diagramType ?? latest.diagramType ? { diagramType: diagramType ?? latest.diagramType } : {}),
          provenance: {
            createdBy: agentActor('diagram', 600), workflowId: workflow.id, ...(artifact.taskId ? { taskId: artifact.taskId } : {}), provider, model,
            inputs: [{ type: 'artifact_version', id: latest.id, version: latest.versionNumber, artifactId: artifact.id }],
          },
        };
        store.versions.push(version);
        refreshLatest(artifact.id);
        endWorkflow(store, workflow, 'Succeeded');
        versionEvent(version);
      });
      return { status: 202, body: structuredClone(workflow), headers: { Location: `/api/v1/workflows/${workflow.id}` } };
    }),
    validateDiagramSource: (request) => handle(request, () => {
      const source = request.body?.source ?? '';
      const validation = checkMermaid(source);
      return {
        status: 200,
        body: validation.status === 'valid'
          ? { valid: true, errors: [], previewSvg: renderPreview(source, 'Preview của nguồn đang sửa') }
          : { valid: false, errors: validation.errors ?? [] },
      };
    }),
    getDiagramPreview: (request) => handle(request, () => {
      const artifact = artifactOf(request.params.projectId, request.params.artifactId);
      const version = artifact ? versionsOf(artifact.id).find((row) => row.id === request.params.versionId) : undefined;
      if (!version || version.validation?.status !== 'valid') return { status: 404, body: problem(404, 'not_found') };
      return new Response(renderPreview(version.content ?? '', `Preview v${version.versionNumber}`), {
        status: 200, headers: { 'Content-Type': 'image/svg+xml', [MOCK_HEADER]: 'getDiagramPreview' },
      });
    }),

    /* ---------- Project references (path 10) ---------- */
    listProjectReferences: (request) => handle(request, () => ({
      status: 200,
      body: { items: inProject(request.params.projectId) ? structuredClone(store.references.filter((row) => !request.query.status || row.status === request.query.status)) : [] },
    })),
    removeReferenceFromProject: (request) => handle(request, () => {
      const selection = inProject(request.params.projectId) ? store.references.find((row) => row.referenceId === request.params.referenceId && row.status === 'Active') : undefined;
      if (!selection) return { status: 409, body: problem(409, 'invalid_transition', 'Reference không còn được chọn cho project.') };
      selection.status = 'Removed';
      touch(store, selection);
      store.emit({ type: 'project_reference.changed', projectId: store.projectId, objectType: 'project_reference', objectId: selection.referenceId, fromState: 'Active', toState: 'Removed' });
      return { status: 204 };
    }),
  };
}
