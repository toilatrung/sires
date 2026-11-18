// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { AgentRunRequestedMessage, MessagePayloads } from './index';

// An explicit inventory ensures every message participates in typechecking.
type MessageNames =
  | 'accountCreated' | 'accountDeletionRequested' | 'providerConnectionChanged'
  | 'providerConnectionIssueReported' | 'embeddingModelChanged' | 'projectLifecycleChanged'
  | 'projectPurgeDue' | 'messagePosted' | 'researchContextVersioned' | 'pendingActionChanged'
  | 'notificationCreated' | 'planGenerationRequested' | 'planVersionStatusChanged' | 'taskActivated'
  | 'taskActivationCancelled' | 'taskStatusChanged' | 'workflowCreated' | 'workflowStatusChanged'
  | 'agentRunStatusChanged' | 'promptStatusChanged' | 'deliberationStarted' | 'deliberationRoundClosed'
  | 'deliberationEntryAdded' | 'deliberationEntryFinalized' | 'deliberationEntryRetracted'
  | 'deliberationStatusChanged' | 'contextSnapshotOutdated' | 'referenceStatusChanged'
  | 'referenceMetadataUpdated' | 'referenceDeleted' | 'projectReferenceChanged'
  | 'referenceIndexingStatusChanged' | 'usageRecorded' | 'researchObjectStatusChanged'
  | 'manuscriptObjectStatusChanged' | 'auditRecorded' | 'dataPurged' | 'agentRunRequested'
  | 'indexRequested' | 'sandboxJobRequested' | 'sandboxJobCompleted' | 'chatDelta';

type Assert<T extends true> = T;
export type EveryMessagePresent = Assert<MessageNames extends keyof MessagePayloads ? true : false>;
export type NoMessageUnchecked = Assert<keyof MessagePayloads extends MessageNames ? true : false>;
type InvalidPayloads = {
  [K in MessageNames]: [MessagePayloads[K]] extends [never] ? K
    : unknown extends MessagePayloads[K] ? K
    : MessagePayloads[K] extends object ? never : K;
}[MessageNames];
export type EveryPayloadIsAnObject = Assert<[InvalidPayloads] extends [never] ? true : false>;

export const agentRun: AgentRunRequestedMessage = {
  agentRunId: '01900000-0000-7000-8000-000000000001',
  workflowId: '01900000-0000-7000-8000-000000000002',
  stepId: '01900000-0000-7000-8000-000000000003',
  accountId: '01900000-0000-7000-8000-000000000004',
  agent: 'orchestrator',
  attempt: 1,
};

// @ts-expect-error AC01: attempt is required by the source contract.
export const missingAttempt: AgentRunRequestedMessage = { agentRunId: '', workflowId: '', stepId: '', accountId: '', agent: 'orchestrator' };
