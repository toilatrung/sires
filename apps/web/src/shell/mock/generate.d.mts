// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Types of generate.mjs for the tests.

export interface SelectOptions {
  operations?: string[] | '*';
  tags?: string[];
}

export interface ResponseModel {
  contentType: string | null;
  headers: string[];
  schema?: unknown;
  body?: unknown;
}

export interface OperationModel {
  operationId: string;
  method: string;
  path: string;
  success: number | null;
  resource?: { schema: string; kind: 'item' | 'page' | 'list'; idParam?: string; scope: string[] };
  query?: QueryParameterModel[];
  responses: Record<string, ResponseModel>;
}

/** An array query parameter and its OpenAPI serialization. */
export interface QueryParameterModel {
  name: string;
  style: string;
  explode: boolean;
}

export function arrayQueryParameters(doc: Record<string, unknown>, parameters: Record<string, unknown>[]): QueryParameterModel[];

export function buildModel(options?: SelectOptions & { spec?: string }): {
  doc: Record<string, unknown> & { components: { schemas: Record<string, unknown> } };
  selected: { operationId: string }[];
  models: OperationModel[];
};

export function generateMocks(options: SelectOptions & { spec?: string; out: string; types?: string }): Promise<{ files: string[]; operations: string[] }>;
export function generateAll(options?: { root?: string; spec?: string }): Promise<{ config: string; files: string[]; operations: string[] }[]>;
export function findConfigs(root?: string): string[];
