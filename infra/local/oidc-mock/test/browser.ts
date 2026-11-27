// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Trình duyệt mô phỏng cho test của OIDC mock (PID-00160 acceptance): fetch với redirect: 'manual', hũ cookie theo
// tên, đọc và gửi form. Dừng khi chuyển hướng ra ngoài mock (về client), không gọi tới client.

import { createServer } from 'node:net';

export type Visit =
  | { readonly kind: 'page'; readonly status: number; readonly url: URL; readonly body: string }
  | { readonly kind: 'redirect'; readonly url: URL };

/** Mọi giá trị nhạy cảm đã thấy (token, code, cookie): test log kiểm không giá trị nào lọt vào log (AC10). */
export const secretsSeen = new Set<string>();

export function remember(...values: (string | undefined)[]): void {
  for (const v of values) if (v && v.length >= 8) secretsSeen.add(v);
}

export class Browser {
  private readonly jar = new Map<string, string>();

  constructor(private readonly origin: string) {}

  private cookieHeader(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private store(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some((a) => /^\s*max-age=0/i.test(a))
        || attrs.some((a) => /^\s*expires=/i.test(a) && Date.parse(a.split('=').slice(1).join('=')) <= Date.now());
      if (!value || expired) this.jar.delete(name);
      else {
        this.jar.set(name, value);
        remember(value);
      }
    }
  }

  /** Một yêu cầu, rồi theo chuyển hướng trong mock; trả trang cuối hoặc URL ra ngoài mock. */
  async request(url: URL | string, init: { method?: string; form?: Record<string, string> } = {}): Promise<Visit> {
    let current = new URL(url);
    let method = init.method ?? (init.form ? 'POST' : 'GET');
    let body: string | undefined = init.form ? new URLSearchParams(init.form).toString() : undefined;
    for (let hop = 0; hop < 15; hop += 1) {
      if (current.origin !== this.origin) return { kind: 'redirect', url: current };
      const headers: Record<string, string> = { cookie: this.cookieHeader() };
      if (body !== undefined) headers['content-type'] = 'application/x-www-form-urlencoded';
      const res = await fetch(current, { method, headers, body, redirect: 'manual' });
      this.store(res);
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        await res.arrayBuffer();
        current = new URL(location, current);
        method = 'GET';
        body = undefined;
        continue;
      }
      return { kind: 'page', status: res.status, url: current, body: await res.text() };
    }
    throw new Error('quá nhiều chuyển hướng');
  }
}

/** Form đầu tiên trong trang (hoặc form có id): action tuyệt đối và các input có name, value. */
export function parseForm(visit: Visit, id?: string): { action: URL; fields: Record<string, string> } {
  if (visit.kind !== 'page') throw new Error(`cần một trang, nhận chuyển hướng tới ${visit.url.href}`);
  const forms = [...visit.body.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)];
  const form = id ? forms.find((m) => m[1].includes(`id="${id}"`)) : forms[0];
  if (!form) throw new Error('trang không có form');
  const action = form[1].match(/action="([^"]*)"/)?.[1] ?? visit.url.href;
  const fields: Record<string, string> = {};
  for (const input of form[2].matchAll(/<input\b([^>]*)>/g)) {
    const name = input[1].match(/name="([^"]+)"/)?.[1];
    if (name) fields[name] = input[1].match(/value="([^"]*)"/)?.[1] ?? '';
  }
  return { action: new URL(action.replace(/&amp;/g, '&'), visit.url), fields };
}

/** Cổng TCP còn trống trên 127.0.0.1. */
export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

/** Cổng có đang nghe trên 127.0.0.1 không. */
export async function listening(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1_000) });
    return true;
  } catch {
    return false;
  }
}
