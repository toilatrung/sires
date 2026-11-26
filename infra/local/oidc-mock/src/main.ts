// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Điểm vào của OIDC mock (PID-00160 O7): kiểm cấu hình và file trước khi mở cổng (spec 4.4; sai thì thoát mã 1 với
// một dòng lý do), máy chủ node:http với GET /health, trang tương tác, phần còn lại do oidc-provider xử lý; tắt êm
// khi nhận SIGTERM, SIGINT (EC17).

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { checkStagingSeeds, ConfigError, loadConfig, type MockConfig } from './config.js';
import { handleInteraction, page } from './interactions.js';
import { createLogger, type Logger, type LogSink } from './log.js';
import { createProvider, ROUTES } from './provider.js';
import { loadSeeds } from './seed.js';

export interface StartedMock {
  readonly server: Server;
  readonly config: MockConfig;
  /** kid của khóa ký hiện tại (đổi mỗi lần khởi động). */
  readonly kid: string;
  /** Địa chỉ thật đang nghe, ví dụ http://127.0.0.1:9400. */
  readonly address: string;
  close(): Promise<void>;
}

export interface StartOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly sink?: LogSink;
  /** Địa chỉ nghe; mặc định 0.0.0.0 (spec 4.2). */
  readonly host?: string;
}

/**
 * Hàng đợi cho POST /token: refresh cùng lúc bằng cùng một refresh token phải có đúng một lần thành công (EC09).
 * oidc-provider kiểm “đã tiêu thụ” rồi mới tiêu thụ sau vài bước bất đồng bộ, nên mock xử lý tuần tự từng yêu cầu.
 */
function serialTokenEndpoint(): (run: () => void, res: ServerResponse) => void {
  let tail: Promise<void> = Promise.resolve();
  return (run, res) => {
    tail = tail.then(() => new Promise<void>((resolve) => {
      res.once('close', resolve);
      res.once('finish', resolve);
      run();
    }));
  };
}

/** client_id trong header Authorization Basic (chỉ phần tên, không đọc secret), để ghi log. */
function basicClientId(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Basic ')) return undefined;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const name = decoded.slice(0, Math.max(decoded.indexOf(':'), 0));
  try {
    return decodeURIComponent(name) || undefined;
  } catch {
    return undefined;
  }
}

const MAX_FORM_BYTES = 16 * 1024;

/**
 * POST /session/end (RP-Initiated Logout 1.0 cho phép GET và POST): oidc-provider 9 chỉ bật POST khi cookie phiên
 * là SameSite=None, mà cookie đó cần https; mock chạy http ở máy Dev. Mock đọc form rồi chuyển cho oidc-provider như
 * GET cùng tham số, nên POST cho kết quả như GET (AC05).
 */
function postAsGet(req: IncomingMessage, res: ServerResponse, callback: (req: IncomingMessage, res: ServerResponse) => void, log: Logger): void {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size <= MAX_FORM_BYTES) chunks.push(chunk);
  });
  req.on('end', () => {
    if (size > MAX_FORM_BYTES) {
      res.statusCode = 413;
      res.end();
      return;
    }
    const type = String(req.headers['content-type'] ?? '');
    const params = type.startsWith('application/x-www-form-urlencoded') ? Buffer.concat(chunks).toString('utf8') : '';
    req.method = 'GET';
    req.url = `${ROUTES.end_session}${params ? `?${new URLSearchParams(params).toString()}` : ''}`;
    delete req.headers['content-type'];
    delete req.headers['content-length'];
    callback(req, res);
  });
  req.on('error', () => {
    log.event('server_error', { error: 'request_error' });
    res.statusCode = 400;
    res.end();
  });
}

function handler(mock: Awaited<ReturnType<typeof createProvider>>, config: MockConfig, log: Logger) {
  const callback = mock.provider.callback();
  const queueToken = serialTokenEndpoint();
  return (req: IncomingMessage, res: ServerResponse): void => {
    const pathname = new URL(req.url ?? '/', 'http://mock.invalid').pathname;
    if (req.method === 'GET' && pathname === '/health') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end('{"status":"ok"}');
      return;
    }
    if (pathname.startsWith('/interaction/')) {
      handleInteraction(mock.provider, config, mock.accounts, log, req, res, pathname).catch((error: unknown) => {
        log.event('server_error', { error: (error as Error)?.name ?? 'error' });
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(page('Lỗi', '<h1>Lỗi máy chủ OIDC mock</h1>'));
        } else res.end();
      });
      return;
    }
    if (req.method === 'POST' && pathname === ROUTES.end_session) {
      postAsGet(req, res, callback, log);
      return;
    }
    if (req.method === 'POST' && pathname === ROUTES.revocation) {
      res.once('finish', () => {
        if (res.statusCode === 200) log.event('revocation.success', { client_id: basicClientId(req) });
      });
    }
    if (req.method === 'POST' && pathname === ROUTES.token) {
      queueToken(() => callback(req, res), res);
      return;
    }
    callback(req, res);
  };
}

/**
 * Kiểm cấu hình, file client, file tài khoản và metadata client; ném ConfigError trước khi tạo máy chủ nếu sai
 * (AC08). Đúng thì nghe ở OIDC_MOCK_PORT.
 */
export async function startMock(options: StartOptions = {}): Promise<StartedMock> {
  const log = createLogger(options.sink);
  const config = loadConfig(options.env ?? process.env);
  const seeds = loadSeeds(config.clientsFile, config.accountsFile);
  checkStagingSeeds(config, seeds);
  const mock = await createProvider(config, seeds, log);

  const server = createServer(handler(mock, config, log));
  server.keepAliveTimeout = 5_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, options.host ?? '0.0.0.0', () => resolve());
  });
  const { address, port } = server.address() as AddressInfo;
  log.event('server.started', { env: config.env, issuer: config.issuer, port, kid: mock.kid });
  return {
    server,
    config,
    kid: mock.kid,
    address: `http://${address.includes(':') ? `[${address}]` : address}:${port}`,
    close: () => new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    }),
  };
}

async function main(): Promise<void> {
  let started: StartedMock;
  try {
    started = await startMock();
  } catch (error) {
    const reason = error instanceof ConfigError ? error.message : `không khởi động được (${(error as Error)?.name ?? 'error'})`;
    process.stderr.write(`oidc-mock: ${reason}\n`);
    process.exit(1);
  }
  const shutdown = (signal: string) => {
    process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event: 'server.stopping', signal })}\n`);
    const force = setTimeout(() => process.exit(0), 5_000);
    force.unref();
    void started.close().then(() => process.exit(0));
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
