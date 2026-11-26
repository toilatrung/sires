// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Types of openapi.mjs for the tests.

export const workspaceRoot: string;
export const defaultSpec: string;
export function loadSpec(file?: string): {
  info: { title: string };
  paths: Record<string, unknown>;
  components: { schemas: Record<string, { enum?: unknown[] } & Record<string, unknown>> };
} & Record<string, unknown>;
export function basePath(doc: unknown): string;
