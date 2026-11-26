// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Entry of the Deliberation tab (PID-00083) for the workflow page and the Agent List of PID-00059. The PR merged last
// adds, in monitoring/index.tsx, the messages (`deliberationMessages`) and, on the workflow page, the tab, the step
// note and the Agent List note (see DeliberationTab.tsx and StepNotes.tsx).
export { DeliberationTab, useDeliberationTab, type DeliberationTabState } from './DeliberationTab';
export { DeliberationAgentNote, DeliberationStepNote } from './StepNotes';
export { deliberationMessages } from './messages';
export { deliberationAgentStates, deliberationHref, type AgentKey, type DeliberationAgentState } from './model';
