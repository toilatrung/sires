// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import 'reflect-metadata';
import { Body, Controller, Module, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createZodDto } from 'nestjs-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createServiceApp } from '../bootstrap';
import { isFieldErrorCode } from './catalog';
import { zodIssuesToFieldErrors } from './validation';

const CreateProjectSchema = z.strictObject({
  title: z.string().min(3).max(20),
  researchQuestion: z.string(),
  ownerId: z.uuid(),
  visibility: z.enum(['private', 'shared']),
  tags: z.array(z.string().max(5)).max(2).optional(),
  settings: z.object({ maxReferences: z.int().min(1) }).optional(),
});

class CreateProjectDto extends createZodDto(CreateProjectSchema) {}

@Controller('projects')
class ProjectController {
  @Post()
  // Vitest compiles with esbuild, which emits no `design:paramtypes`; tsc (the service build) does. Declare it here so
  // the global pipe sees the DTO type exactly as in a built service.
  @Reflect.metadata('design:paramtypes', [CreateProjectDto])
  create(@Body() body: CreateProjectDto): { title: string } {
    return { title: body.title };
  }
}

@Module({ controllers: [ProjectController] })
class ProjectModule {}

let app: NestFastifyApplication;
let url: string;

beforeAll(async () => {
  app = await createServiceApp(ProjectModule, { name: 'validation-test', port: 0 }, {
    logDestination: { write: () => undefined },
  });
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

async function post(body: unknown) {
  const res = await fetch(`${url}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, body: (await res.json()) as { code?: string; status?: number; errors?: Array<{ field?: string; code: string }> } };
}

const valid = {
  title: 'Luận văn',
  researchQuestion: 'RAG có giảm hallucination?',
  ownerId: '0193a5c2-7b1e-7c3a-9d2f-4e5b6a7c8d9e',
  visibility: 'private',
};

describe('ZodProblemValidationPipe', () => {
  it('lỗi schema Zod (PID-00001-AC07)', async () => {
    const ok = await post(valid);
    expect(ok.res.status).toBe(201);
    expect(ok.body).toEqual({ title: 'Luận văn' });

    const { res, body } = await post({ ...valid, researchQuestion: undefined });
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toMatch(/^application\/problem\+json/);
    expect(body).toMatchObject({ status: 400, code: 'validation_failed' });
    expect(body.errors?.map(({ field, code }) => ({ field, code }))).toEqual([{ field: 'researchQuestion', code: 'required' }]);
  });

  it('nhiều trường sai (EC03)', async () => {
    const { res, body } = await post({
      title: 'ab',
      researchQuestion: 42,
      ownerId: 'không-phải-uuid',
      visibility: 'public',
      tags: ['quá-dài'],
      settings: { maxReferences: 0 },
      extra: true,
    });
    expect(res.status).toBe(400);
    // Every failing field, not only the first; codes from FieldErrorCode, never Zod's own.
    expect(body.errors?.map(({ field, code }) => ({ field, code }))).toEqual(
      expect.arrayContaining([
        { field: 'title', code: 'too_small' },
        { field: 'researchQuestion', code: 'invalid_type' },
        { field: 'ownerId', code: 'invalid_format' },
        { field: 'visibility', code: 'invalid_value' },
        { field: 'tags.0', code: 'too_big' },
        { field: 'settings.maxReferences', code: 'too_small' },
        { field: 'extra', code: 'unrecognized_field' },
      ]),
    );
    expect(body.errors).toHaveLength(7);
    for (const error of body.errors ?? []) expect(isFieldErrorCode(error.code)).toBe(true);
  });

  it('ánh xạ mã Zod sang FieldErrorCode', () => {
    const input = { a: undefined, b: 'x' };
    expect(
      zodIssuesToFieldErrors(
        [
          { code: 'invalid_type', path: ['a'] },
          { code: 'invalid_type', path: ['b'] },
          { code: 'invalid_type', path: [] },
          { code: 'not_multiple_of', path: ['n'] },
          { code: 'invalid_union', path: ['u'] },
          { code: 'custom', path: ['c'] },
          { code: 'unrecognized_keys', path: ['nested'], keys: ['x', 'y'] },
        ],
        input,
      ).map(({ field, code }) => ({ field, code })),
    ).toEqual([
      { field: 'a', code: 'required' },
      { field: 'b', code: 'invalid_type' },
      { field: undefined, code: 'invalid_type' },
      { field: 'n', code: 'invalid_value' },
      { field: 'u', code: 'invalid_value' },
      { field: 'c', code: 'invalid_value' },
      { field: 'nested.x', code: 'unrecognized_field' },
      { field: 'nested.y', code: 'unrecognized_field' },
    ]);
  });
});
