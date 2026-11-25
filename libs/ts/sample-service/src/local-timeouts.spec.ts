// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { TESTCONTAINERS_TIMEOUTS } from '@sires/testing';

// PC-05 P38 (QC PID-00006 G9): timeout khai tại chỗ đè lên vitest.config.ts, nên chỉ được khai khi lớn hơn hằng chung
// (PC-04 A6). describe, it, test so với testTimeout; hook so với hookTimeout. Chỉ xét số viết trực tiếp.
const SRC = join(__dirname);
const TEST_CALLS = new Set(['describe', 'it', 'test']);
const HOOKS = new Set(['beforeAll', 'afterAll', 'beforeEach', 'afterEach']);

function specFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return specFiles(path);
    return entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

function calleeName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return calleeName(expression.expression);
  if (ts.isCallExpression(expression)) return calleeName(expression.expression);
  return undefined;
}

function literalTimeouts(call: ts.CallExpression): number[] {
  return call.arguments.flatMap((argument) => {
    if (ts.isNumericLiteral(argument)) return [Number(argument.text)];
    if (!ts.isObjectLiteralExpression(argument)) return [];
    return argument.properties.flatMap((property) =>
      ts.isPropertyAssignment(property) && property.name.getText() === 'timeout' && ts.isNumericLiteral(property.initializer)
        ? [Number(property.initializer.text)] : []);
  });
}

function localTimeoutsNotAboveShared(dir: string): string[] {
  const found: string[] = [];
  for (const file of specFiles(dir)) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const name = calleeName(node.expression);
        const limit = name && TEST_CALLS.has(name) ? TESTCONTAINERS_TIMEOUTS.testTimeout
          : name && HOOKS.has(name) ? TESTCONTAINERS_TIMEOUTS.hookTimeout : undefined;
        if (limit !== undefined) {
          for (const timeout of literalTimeouts(node)) {
            if (timeout <= limit) {
              const { line } = source.getLineAndCharacterOfPosition(node.getStart());
              found.push(`${relative(dir, file)}:${line + 1} ${name} ${timeout} ≤ ${limit}`);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

describe('timeout khai tại chỗ của @sires/sample-service (PC-05 P38)', () => {
  it('không khai timeout nhỏ hơn hoặc bằng TESTCONTAINERS_TIMEOUTS', () => {
    expect(localTimeoutsNotAboveShared(SRC)).toEqual([]);
  });
});
