// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Upload of a binary file for the manuscript (PID-00115 S03, EC13): POST /uploads (uploadFile, research area) as
// multipart/form-data — the shell's JSON client sends JSON only — then the caller commits `add` with fileUploadId.

import { ApiError, type ApiClient } from '../../../shell';
import type { Schemas } from '../model';

/** Text files are committed with their content; others go through uploadFile (FileChange.content vs fileUploadId). */
export const isTextUpload = (name: string) => /\.(tex|bib|txt|sty|cls|bst|md|csv)$/i.test(name);

/** Bytes of a chosen file (Blob.arrayBuffer, or FileReader where a Blob lacks it). */
export function readBytes(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export async function readText(file: Blob): Promise<string> {
  return new TextDecoder().decode(await readBytes(file));
}

/**
 * multipart/form-data body with `file` and `projectId` (RFC 7578). Built from bytes so it does not depend on the
 * page's FormData implementation (in tests jsdom's FormData cannot be read by the runtime's fetch).
 */
export async function multipart(file: File, fields: Record<string, string>): Promise<{ body: Uint8Array; type: string }> {
  const boundary = `----sires-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  const quote = (value: string) => value.replace(/["\r\n]/g, (char) => encodeURIComponent(char));
  const head = [
    ...Object.entries(fields).map(([name, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${quote(name)}"\r\n\r\n${value}\r\n`),
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${quote(file.name)}"\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
  ].join('');
  const parts = [encoder.encode(head), await readBytes(file), encoder.encode(`\r\n--${boundary}--\r\n`)];
  const body = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    body.set(part, at);
    at += part.length;
  }
  return { body, type: `multipart/form-data; boundary=${boundary}` };
}

export async function uploadFile(api: ApiClient, csrfToken: () => Promise<string>, projectId: string, file: File): Promise<string> {
  const { body, type } = await multipart(file, { projectId });
  let response: Response;
  try {
    response = await fetch(new URL(api.url('/uploads'), typeof window === 'undefined' ? 'http://localhost' : window.location.origin), {
      method: 'POST',
      headers: { 'X-CSRF-Token': await csrfToken(), 'Content-Type': type, Accept: 'application/json, application/problem+json' },
      body: body.slice().buffer as ArrayBuffer,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('network');
  }
  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    const problem = /json/.test(contentType) ? ((await response.json().catch(() => undefined)) as Schemas['Problem'] | undefined) : undefined;
    if (problem?.code) throw new ApiError('problem', { status: response.status, problem });
    throw new ApiError('http', { status: response.status });
  }
  const created = (await response.json()) as { fileUploadId: string };
  return created.fileUploadId;
}
