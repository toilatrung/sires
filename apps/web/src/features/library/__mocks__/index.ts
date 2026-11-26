// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mock of the library area (PID-00098 S01, H4): the 23 operations of path 10 over one store (store.ts). Operations of
// other areas (getWorkflow, cancelWorkflow, prompts, listProjects, getMe) are not claimed here; tests override them.

import { ACCOUNT_ID, defineMocks, type Schemas } from '../../../shell/mock';
import { operations } from './generated';
import { libraryStore as store } from './store';

type Reference = Schemas['Reference'];
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const researcher = { type: 'researcher', accountId: ACCOUNT_ID } as const;
const now = () => new Date().toISOString();
const etag = (ref: Reference) => ({ ETag: `"${ref.rowVersion}"` });
const page = <T>(rows: T[], limit?: string, cursor?: string) => {
  const size = Math.max(1, Number(limit ?? 50) || 50);
  const start = Math.max(0, Number(cursor ?? 0) || 0);
  return { items: rows.slice(start, start + size), nextCursor: start + size < rows.length ? String(start + size) : null };
};
const problem = (status: number, code: Schemas['ErrorCode'], detail?: string, extra: Record<string, unknown> = {}) => ({
  type: `https://sires.etroy.local/problems/${code}`, title: code, status, code, ...(detail ? { detail } : {}), ...extra,
});
const record = (operationId: string, request: Request, body?: unknown) => {
  store.calls.push({ operationId, body, headers: Object.fromEntries(request.headers) });
};

/**
 * Name and byte size of the `file` part of a multipart/form-data request. Read from the raw bytes rather than
 * request.formData(): in Vitest's jsdom environment Node's multipart parser builds File objects of the wrong realm and
 * throws; the browser gives the same result either way.
 */
async function readUpload(request: Request): Promise<{ name: string; size: number } | undefined> {
  const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(request.headers.get('Content-Type') ?? '');
  if (!boundary) return undefined;
  const encoder = new TextEncoder();
  const bytes = new Uint8Array(await request.arrayBuffer());
  const find = (needle: Uint8Array, from: number) => {
    outer: for (let i = from; i <= bytes.length - needle.length; i += 1) {
      for (let j = 0; j < needle.length; j += 1) if (bytes[i + j] !== needle[j]) continue outer;
      return i;
    }
    return -1;
  };
  const delimiter = encoder.encode(`--${boundary[1] ?? boundary[2]}`);
  const blank = encoder.encode('\r\n\r\n');
  for (let at = find(delimiter, 0); at >= 0;) {
    const headEnd = find(blank, at);
    if (headEnd < 0) return undefined;
    const head = new TextDecoder().decode(bytes.subarray(at + delimiter.length, headEnd));
    const next = find(encoder.encode(`\r\n--${boundary[1] ?? boundary[2]}`), headEnd);
    const name = /filename="([^"]*)"/i.exec(head)?.[1];
    if (/name="file"/i.test(head) && name !== undefined) return { name, size: (next < 0 ? bytes.length : next) - (headEnd + blank.length) };
    at = next < 0 ? -1 : next + 2;
  }
  return undefined;
}

function bibtexEntries(source: string) {
  return [...source.matchAll(/@(\w+)\s*\{\s*([^,\s]*)\s*,([\s\S]*?)\n\}/g)].map((match) => {
    const field = (name: string) => new RegExp(`${name}\\s*=\\s*[{"]([^}"]*)[}"]`, 'i').exec(match[3])?.[1]?.trim();
    return { key: match[2], title: field('title'), author: field('author'), year: field('year'), doi: field('doi'), venue: field('journal') ?? field('booktitle') };
  });
}

function newReference(metadata: Schemas['ReferenceMetadata'], key: string, origin: 'discovered' | 'manual', duplicateOf?: string): Reference {
  const id = store.nextReferenceId();
  return {
    id, accountId: ACCOUNT_ID, createdAt: now(), createdBy: researcher, rowVersion: 1, metadata, metadataVersion: 1,
    bibtexKey: key, origin, approvalStatus: 'Pending Approval', indexingStatus: 'Not Indexed',
    ...(duplicateOf ? { duplicateWarnings: [{ referenceId: duplicateOf, matchedOn: 'doi' as const }] } : {}),
    usedInProjectCount: 0,
  };
}

const duplicateByDoi = (doi?: string) => doi ? store.references().find((ref) => ref.metadata.identifiers.doi?.toLowerCase() === doi.toLowerCase()) : undefined;

export default defineMocks({
  operations,
  overrides: {
    listDiscoverySources: () => ({ status: 200, body: { items: store.sources } }),

    startDiscoverySearch: ({ body, request, emit }) => {
      record('startDiscoverySearch', request, body);
      if (store.scenario.search?.kind === 'unavailable') return { status: 503 };
      const workflow = store.startWorkflow('discovery', request.headers.get('Idempotency-Key') ?? '');
      const source = body?.source ?? 'openalex';
      store.later(() => store.completeSearch(workflow.id, body?.query ?? '', source, emit));
      return { status: 202, body: workflow, headers: { Location: `/api/v1/workflows/${workflow.id}` } };
    },

    startAuthorSearch: ({ body, request, emit }) => {
      record('startAuthorSearch', request, body);
      if (store.scenario.search?.kind === 'unavailable') return { status: 503 };
      const workflow = store.startWorkflow('discovery', request.headers.get('Idempotency-Key') ?? '');
      const byProfile = /^https?:\/\//.test(body?.author ?? '');
      store.rememberSearch(workflow.id, body?.author ?? '', body?.source ?? 'openalex');
      if (store.scenario.authorPrompt && !byProfile) {
        store.later(() => store.finishWorkflow(workflow.id, 'Waiting for User', emit));
      } else {
        store.later(() => store.completeSearch(workflow.id, body?.author ?? '', body?.source ?? 'openalex', emit));
      }
      return { status: 202, body: workflow };
    },

    listDiscoveredResults: ({ query }) => {
      const rows = store.results().filter((row) => (!query.workflowId || row.searchWorkflowId === query.workflowId) && (!query.status || row.status === query.status));
      return { status: 200, body: page(structuredClone(rows), query.limit, query.cursor) };
    },

    setDiscoveredResultStatus: ({ params, body, request }) => {
      record('setDiscoveredResultStatus', request, body);
      const row = store.result(params.discoveredResultId);
      if (!row || row.status === 'Imported' || row.duplicateOfReferenceId) return { status: 409, body: problem(409, 'invalid_transition', undefined, { currentState: row?.status ?? 'unknown' }) };
      row.status = body?.status ?? row.status;
      row.rowVersion += 1;
      return { status: 200, body: structuredClone(row) };
    },

    importDiscoveredResults: ({ body, request, emit }) => {
      record('importDiscoveredResults', request, body);
      const ids = body?.discoveredResultIds ?? [];
      if (!ids.length || ids.length > 50) return { status: 400, body: problem(400, 'validation_failed', 'Mỗi lô 1–50 mục') };
      const workflow = store.startWorkflow('reference_processing', request.headers.get('Idempotency-Key') ?? '');
      store.later(() => {
        if (store.scenario.importInterrupted) {
          store.finishWorkflow(workflow.id, 'Interrupted', emit, { code: 'interrupted', message: 'Lô bị gián đoạn khi đang xử lý.' });
          return;
        }
        let failed = 0;
        for (const id of ids) {
          const row = store.result(id);
          if (!row || row.duplicateOfReferenceId) continue;
          if (store.scenario.importFailures?.includes(id)) { failed += 1; continue; }
          const ref = newReference(structuredClone(row.metadata), `${(row.metadata.authors[0]?.name ?? 'ref').split(' ').pop()?.toLowerCase()}${row.metadata.year ?? ''}`, 'discovered');
          ref.discoveredResultId = row.id;
          store.putReference(ref);
          row.status = 'Imported';
          row.importedReferenceId = ref.id;
        }
        store.finishWorkflow(workflow.id, failed === ids.length ? 'Failed' : 'Succeeded', emit,
          failed ? { code: 'invalid_response', message: `Không chuẩn hóa được metadata của ${failed} mục.` } : undefined);
      });
      return { status: 202, body: workflow };
    },

    listReferences: ({ request }) => {
      const url = new URL(request.url);
      const approval = url.searchParams.getAll('approvalStatus');
      const indexing = url.searchParams.get('indexingStatus');
      const q = url.searchParams.get('q')?.toLowerCase().trim();
      const year = url.searchParams.get('year');
      const rows = store.references().filter((ref) => !ref.mergedIntoId
        && (!approval.length || approval.includes(ref.approvalStatus))
        && (!indexing || ref.indexingStatus === indexing)
        && (!year || String(ref.metadata.year) === year)
        && (!q || [ref.metadata.title, ref.bibtexKey, ref.metadata.identifiers.doi, ...ref.metadata.authors.map((a) => a.name)]
          .some((text) => text?.toLowerCase().includes(q))));
      return { status: 200, body: page(structuredClone(rows), url.searchParams.get('limit') ?? undefined, url.searchParams.get('cursor') ?? undefined) };
    },

    createReferenceManually: ({ body, request }) => {
      record('createReferenceManually', request, body);
      if (body && 'doi' in body) {
        const doi = body.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:/i, '');
        if (store.scenario.unresolvableDois?.includes(doi)) return { status: 422, body: problem(422, 'schema_invalid', `Không phân giải được DOI ${doi}.`) };
        const duplicate = duplicateByDoi(doi);
        const ref = newReference({ title: `Tài liệu DOI ${doi}`, authors: [{ name: 'Tác giả theo DOI' }], identifiers: { doi }, source: 'crossref', retrievedAt: now() }, `doi${doi.replace(/\W/g, '').slice(-8)}`, 'manual', duplicate?.id);
        store.putReference(ref);
        return { status: 201, body: { items: [structuredClone(ref)] } };
      }
      const entries = bibtexEntries(body && 'bibtex' in body ? body.bibtex : '');
      const items: Reference[] = [];
      const errors: Schemas['Problem'][] = [];
      for (const entry of entries) {
        if (!entry.title || !entry.author) {
          errors.push(problem(400, 'validation_failed', `Entry ${entry.key || '(không có key)'}: thiếu title hoặc author.`) as Schemas['Problem']);
          continue;
        }
        const duplicate = duplicateByDoi(entry.doi);
        const ref = newReference({
          title: entry.title, authors: entry.author.split(/\s+and\s+/).map((name) => ({ name })),
          ...(entry.year ? { year: Number(entry.year) } : {}), ...(entry.venue ? { venue: entry.venue } : {}),
          identifiers: entry.doi ? { doi: entry.doi } : {}, source: 'bibtex', retrievedAt: now(),
        }, entry.key, 'manual', duplicate?.id);
        store.putReference(ref);
        items.push(structuredClone(ref));
      }
      if (!items.length && !errors.length) return { status: 400, body: problem(400, 'validation_failed', 'Không có entry BibTeX nào.') };
      return { status: 201, body: { items, ...(errors.length ? { errors } : {}) } };
    },

    importReferenceFromPdf: async ({ request, emit }) => {
      const file = await readUpload(request);
      record('importReferenceFromPdf', request, { name: file?.name });
      if (!file) return { status: 400, body: problem(400, 'validation_failed', 'Thiếu file.') };
      if (file.size > MAX_PDF_BYTES) return { status: 413 };
      if (/scan/i.test(file.name)) return { status: 422, body: problem(422, 'pdf_without_text_layer', 'PDF chỉ có ảnh quét, không có lớp văn bản.') };
      const workflow = store.startWorkflow('reference_processing', request.headers.get('Idempotency-Key') ?? '');
      store.later(() => {
        store.putReference(newReference({ title: file.name.replace(/\.pdf$/i, ''), authors: [{ name: 'Tác giả trong PDF' }], identifiers: {}, source: 'pdf', retrievedAt: now() }, file.name.replace(/\W/g, '').slice(0, 20), 'manual'));
        store.finishWorkflow(workflow.id, 'Succeeded', emit);
      });
      return { status: 202, body: workflow };
    },

    decideReferences: ({ body, request, emit }) => {
      record('decideReferences', request, body);
      const results = (body?.decisions ?? []).map((decision) => {
        const ref = store.reference(decision.referenceId);
        if (!ref || ref.approvalStatus !== 'Pending Approval') {
          return { referenceId: decision.referenceId, outcome: 'skipped' as const, problem: problem(409, 'invalid_transition', undefined, { currentState: ref?.approvalStatus }) as Schemas['Problem'] };
        }
        if (decision.metadataVersion !== undefined && decision.metadataVersion !== ref.metadataVersion) {
          return { referenceId: ref.id, outcome: 'skipped' as const, problem: problem(412, 'precondition_failed', 'Metadata đã đổi sau khi bạn xem.') as Schemas['Problem'] };
        }
        if (decision.decision === 'approve' && ref.duplicateWarnings?.length && !decision.reason) {
          return { referenceId: ref.id, outcome: 'skipped' as const, problem: problem(409, 'action_not_allowed_in_state', 'Mục nghi trùng: chọn Gộp, Giữ riêng và duyệt hoặc Từ chối.') as Schemas['Problem'] };
        }
        const from = ref.approvalStatus;
        if (decision.editedMetadata) {
          ref.metadata = decision.editedMetadata;
          ref.metadataVersion += 1;
        }
        ref.approvalStatus = decision.decision === 'approve' ? 'Trusted' : 'Rejected';
        ref.rowVersion += 1;
        ref.approval = { approvedBy: researcher, decidedAt: now(), decision: decision.decision === 'approve' ? (decision.editedMetadata ? 'edited_and_approved' : 'approved') : 'rejected', objectType: 'reference', objectId: ref.id, objectVersion: ref.metadataVersion, apr: 'APR-04', ...(decision.reason ? { reason: decision.reason } : {}) };
        emit({ type: 'reference.status_changed', objectType: 'reference', objectId: ref.id, fromState: from, toState: ref.approvalStatus });
        return { referenceId: ref.id, outcome: decision.decision === 'approve' ? 'trusted' as const : 'rejected' as const };
      });
      return { status: 200, body: { results } };
    },

    getReference: ({ params }) => {
      const ref = store.reference(params.referenceId);
      return ref ? { status: 200, body: structuredClone(ref), headers: etag(ref) } : { status: 404 };
    },

    updateReferenceMetadata: ({ params, body, request }) => {
      record('updateReferenceMetadata', request, body);
      const ref = store.reference(params.referenceId);
      if (!ref) return { status: 409, body: problem(409, 'invalid_transition') };
      if (ref.approvalStatus === 'Revoked' || ref.approvalStatus === 'Rejected') return { status: 409, body: problem(409, 'action_not_allowed_in_state', undefined, { currentState: ref.approvalStatus }) };
      if (request.headers.get('If-Match') !== `"${ref.rowVersion}"`) return { status: 412 };
      if (body?.metadata) {
        ref.metadata = body.metadata;
        ref.metadataVersion += 1;
      }
      ref.rowVersion += 1;
      return { status: 200, body: structuredClone(ref), headers: etag(ref) };
    },

    deleteReference: ({ params, request }) => {
      record('deleteReference', request);
      if (store.usage(params.referenceId).length) return { status: 409, body: problem(409, 'action_not_allowed_in_state', 'Reference đang được dùng ở project.') };
      store.deleteReference(params.referenceId);
      return { status: 204 };
    },

    revokeReference: ({ params, body, request, emit }) => {
      record('revokeReference', request, body);
      const ref = store.reference(params.referenceId);
      if (!ref || ref.approvalStatus !== 'Trusted') return { status: 409, body: problem(409, 'invalid_transition', undefined, { currentState: ref?.approvalStatus }) };
      if (!body?.reason?.trim()) return { status: 400, body: problem(400, 'validation_failed', 'Lý do bắt buộc.') };
      ref.approvalStatus = 'Revoked';
      ref.rowVersion += 1;
      ref.revocation = { approvedBy: researcher, decidedAt: now(), decision: 'rejected', objectType: 'reference', objectId: ref.id, objectVersion: ref.metadataVersion, apr: 'APR-04', reason: body.reason };
      emit({ type: 'reference.status_changed', objectType: 'reference', objectId: ref.id, fromState: 'Trusted', toState: 'Revoked' });
      return { status: 200, body: { reference: structuredClone(ref) } };
    },

    reinstateReference: ({ params, request, emit }) => {
      record('reinstateReference', request);
      const ref = store.reference(params.referenceId);
      if (!ref || (ref.approvalStatus !== 'Revoked' && ref.approvalStatus !== 'Rejected')) return { status: 409, body: problem(409, 'invalid_transition', undefined, { currentState: ref?.approvalStatus }) };
      const from = ref.approvalStatus;
      ref.approvalStatus = 'Trusted';
      ref.rowVersion += 1;
      delete ref.revocation;
      emit({ type: 'reference.status_changed', objectType: 'reference', objectId: ref.id, fromState: from, toState: 'Trusted' });
      return { status: 200, body: structuredClone(ref) };
    },

    mergeReference: ({ params, body, request }) => {
      record('mergeReference', request, body);
      const ref = store.reference(params.referenceId);
      const into = body?.intoReferenceId ? store.reference(body.intoReferenceId) : undefined;
      if (!ref || !into || ref.id === into.id) return { status: 409, body: problem(409, 'invalid_transition') };
      ref.mergedIntoId = into.id;
      ref.rowVersion += 1;
      return { status: 200, body: structuredClone(ref) };
    },

    getReferenceUsage: ({ params }) => ({ status: 200, body: { referenceId: params.referenceId, projects: store.usage(params.referenceId) } }),

    getReferenceDocument: ({ params }) => (store.reference(params.referenceId)?.document ? { status: 200 } : { status: 404 }),

    uploadReferenceDocument: async ({ params, request, emit }) => {
      const file = await readUpload(request);
      record('uploadReferenceDocument', request, { name: file?.name });
      const ref = store.reference(params.referenceId);
      if (!ref || ref.approvalStatus !== 'Trusted') return { status: 409, body: problem(409, 'action_not_allowed_in_state') };
      if (!file) return { status: 422, body: problem(422, 'schema_invalid', 'Thiếu file.') };
      if (file.size > MAX_PDF_BYTES) return { status: 413 };
      if (/scan/i.test(file.name)) return { status: 422, body: problem(422, 'pdf_without_text_layer', 'PDF chỉ có ảnh quét, không có lớp văn bản.') };
      const from = ref.indexingStatus;
      ref.document = { id: store.nextReferenceId(), fileName: file.name, sizeBytes: file.size, pageCount: 14 };
      ref.indexingStatus = 'Queued';
      delete ref.indexingError;
      ref.rowVersion += 1;
      emit({ type: 'reference.indexing_status_changed', objectType: 'reference', objectId: ref.id, fromState: from, toState: 'Queued' });
      store.later(() => {
        ref.indexingStatus = 'Indexed';
        ref.document = { ...ref.document, indexedAt: now(), chunkCount: 87, embeddingModel: 'text-embedding-3-small' };
        ref.rowVersion += 1;
        emit({ type: 'reference.indexing_status_changed', objectType: 'reference', objectId: ref.id, fromState: 'Queued', toState: 'Indexed' });
      });
      return { status: 200, body: structuredClone(ref), headers: etag(ref) };
    },

    retryReferenceIndexing: ({ params, request, emit }) => {
      record('retryReferenceIndexing', request);
      const ref = store.reference(params.referenceId);
      if (!ref || ref.indexingStatus !== 'Failed') return { status: 409, body: problem(409, 'invalid_transition', undefined, { currentState: ref?.indexingStatus }) };
      ref.indexingStatus = 'Queued';
      delete ref.indexingError;
      ref.rowVersion += 1;
      emit({ type: 'reference.indexing_status_changed', objectType: 'reference', objectId: ref.id, fromState: 'Failed', toState: 'Queued' });
      const workflow = store.startWorkflow('indexing', request.headers.get('Idempotency-Key') ?? `retry-${ref.id}`);
      return { status: 202, body: workflow };
    },

    listProjectReferences: ({ params }) => ({ status: 200, body: { items: structuredClone(store.selections(params.projectId)), nextCursor: null } }),

    selectReferencesForProject: ({ params, body, request, emit }) => {
      record('selectReferencesForProject', request, body);
      const ids = body?.referenceIds ?? [];
      const notTrusted = ids.find((id) => store.reference(id)?.approvalStatus !== 'Trusted');
      if (notTrusted) return { status: 422, body: problem(422, 'reference_not_trusted', 'Chỉ Trusted Reference được chọn vào project.') };
      const items = ids.map((id) => {
        const row: Schemas['ProjectReferenceSelection'] = {
          id: store.nextReferenceId(), accountId: ACCOUNT_ID, projectId: params.projectId, createdAt: now(), createdBy: researcher,
          rowVersion: 1, referenceId: id, status: 'Active', selectedBy: researcher, ...(body?.reason ? { reason: body.reason } : {}),
        };
        store.addSelection(row);
        store.addUsage(id, { projectId: params.projectId, name: store.projectName(params.projectId), evidenceCount: 0, citationCount: 0 });
        emit({ type: 'project_reference.changed', projectId: params.projectId, objectType: 'reference', objectId: id, toState: 'Active' });
        return row;
      });
      return { status: 200, body: { items } };
    },

    removeReferenceFromProject: ({ params, request }) => {
      record('removeReferenceFromProject', request);
      return store.removeSelection(params.projectId, params.referenceId) ? { status: 204 } : { status: 409, body: problem(409, 'invalid_transition') };
    },
  },
});
