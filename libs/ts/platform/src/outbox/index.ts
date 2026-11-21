// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

export {
  actorRefSchema,
  aggregateSchema,
  EVENT_PRODUCERS,
  eventEnvelopeSchema,
  eventRoutingKey,
  MESSAGE_TYPE_PATTERN,
  topicMatches,
  type ActorRef,
  type EventAggregate,
  type EventEnvelope,
  type ServiceName,
} from './envelope';
export {
  buildEnvelope,
  COMMAND_QUEUES,
  currentTraceparent,
  EVENTS_EXCHANGE,
  insertOutboxRow,
  writeCommand,
  writeEvent,
  type CommandQueue,
  type OutboxCommandInput,
  type OutboxEventInput,
  type OutboxRow,
  type SqlExecutor,
} from './outbox';
export { OUTBOX_RELAY_LEASE, OutboxRelay, type OutboxRelayOptions, type RelayRunResult } from './relay';
