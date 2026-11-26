// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Trang của OIDC mock (PID-00160 spec 4.5, O6): đăng nhập bằng email và mật khẩu thử, xác nhận đăng xuất tự gửi
// (có nút khi tắt JS, EC11), đã đăng xuất (EC12), lỗi. HTML tự chứa, không tải tài nguyên ngoài, không theo design
// system của SIRes; dải trên cùng nói rõ đây không phải eTroy. Không có màn đồng ý: grant tạo ở provider.ts.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type Provider from 'oidc-provider';
import type { MockConfig } from './config.js';
import type { Logger } from './log.js';
import type { AccountStore } from './seed.js';

const MAX_BODY_BYTES = 16 * 1024;

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Khung trang chung: tiêu đề “SIRes OIDC mock”, dải nhận biết, CSS nội tuyến. */
export function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>SIRes OIDC mock — ${escapeHtml(title)}</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f6f4ef;color:#1f1f1f}
.banner{background:#7a2e0e;color:#fff;padding:8px 16px;font-size:14px;text-align:center}
main{max-width:420px;margin:32px auto;padding:24px;background:#fff;border:1px solid #ddd6c8;border-radius:8px}
h1{font-size:20px;margin:0 0 16px}label{display:block;margin:12px 0 4px;font-size:14px}
input{box-sizing:border-box;width:100%;padding:8px;font-size:16px;border:1px solid #b9b2a3;border-radius:4px}
button{margin-top:16px;padding:10px 16px;font-size:16px;border:0;border-radius:4px;background:#1f4e79;color:#fff;cursor:pointer}
.error{color:#a4161a;margin:8px 0}.hint{font-size:13px;color:#555}code{font-size:13px}
</style>
</head>
<body>
<div class="banner">Máy chủ OIDC thử của SIRes — không phải eTroy</div>
<main>
${body}
</main>
</body>
</html>`;
}

function send(res: ServerResponse, status: number, html: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function loginPage(config: MockConfig, accounts: AccountStore, uid: string, clientId: string, error?: string): string {
  const hint = config.env === 'local'
    ? `<p class="hint">Tài khoản thử (mật khẩu trong <code>config/accounts.local.json</code>): ${accounts.emails().map((e) => `<code>${escapeHtml(e)}</code>`).join(', ')}</p>`
    : '';
  return page('Đăng nhập', `<h1>Đăng nhập vào ${escapeHtml(clientId)}</h1>
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/interaction/${escapeHtml(uid)}/login" autocomplete="off">
<label for="email">Email</label>
<input id="email" name="email" type="email" required autofocus>
<label for="password">Mật khẩu</label>
<input id="password" name="password" type="password" required>
<button type="submit">Đăng nhập</button>
</form>
${hint}`);
}

/** Thông báo chung khi sai: không nói email có tồn tại hay không (EC06). */
export const LOGIN_FAILED = 'Email hoặc mật khẩu không đúng';

/**
 * GET /interaction/:uid hiện form đăng nhập; POST /interaction/:uid/login kiểm email, mật khẩu rồi kết thúc tương
 * tác. Prompt khác `login` (đồng ý) kết thúc ngay với grant đủ scope, claim đã yêu cầu (không có màn đồng ý, H4).
 */
export async function handleInteraction(
  provider: Provider,
  config: MockConfig,
  accounts: AccountStore,
  log: Logger,
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  const match = pathname.match(/^\/interaction\/([^/]+)(\/login)?$/);
  if (!match) return send(res, 404, page('Không tìm thấy', '<h1>Không tìm thấy</h1>'));
  let details;
  try {
    details = await provider.interactionDetails(req, res);
  } catch {
    return send(res, 400, page('Phiên đăng nhập hết hạn', '<h1>Phiên đăng nhập hết hạn hoặc không hợp lệ</h1><p>Quay lại ứng dụng và đăng nhập lại.</p>'));
  }
  const { uid, prompt, params } = details;
  const clientId = String(params.client_id ?? '');
  if (match[1] !== uid) return send(res, 400, page('Lỗi', '<h1>Tương tác không khớp</h1>'));

  if (prompt.name !== 'login') {
    // Không có màn đồng ý: tạo hay bổ sung grant cho đúng scope, claim mà client yêu cầu.
    const accountId = details.session?.accountId;
    if (!accountId) return send(res, 400, page('Lỗi', '<h1>Chưa đăng nhập</h1>'));
    const grant = details.grantId
      ? await provider.Grant.find(details.grantId)
      : new provider.Grant({ accountId, clientId });
    if (!grant) return send(res, 400, page('Lỗi', '<h1>Không tìm thấy grant</h1>'));
    const missing = prompt.details as { missingOIDCScope?: string[]; missingOIDCClaims?: string[] };
    if (missing.missingOIDCScope) grant.addOIDCScope(missing.missingOIDCScope.join(' '));
    if (missing.missingOIDCClaims) grant.addOIDCClaims(missing.missingOIDCClaims);
    const grantId = await grant.save();
    await provider.interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true });
    return;
  }

  if (req.method === 'GET' && !match[2]) return send(res, 200, loginPage(config, accounts, uid, clientId));
  if (req.method !== 'POST' || !match[2]) return send(res, 405, page('Lỗi', '<h1>Phương thức không hỗ trợ</h1>'));

  let form: URLSearchParams;
  try {
    form = await readForm(req);
  } catch {
    return send(res, 413, page('Lỗi', '<h1>Yêu cầu quá lớn</h1>'));
  }
  const account = accounts.authenticate(form.get('email') ?? '', form.get('password') ?? '');
  if (!account) {
    log.event('interaction.login_failed', { client_id: clientId });
    return send(res, 200, loginPage(config, accounts, uid, clientId, LOGIN_FAILED));
  }
  log.event('interaction.ended', { client_id: clientId, sub: account.sub });
  await provider.interactionFinished(req, res, { login: { accountId: account.sub } }, { mergeWithLastSubmission: false });
}

/** Trang xác nhận đăng xuất: form của oidc-provider kèm `logout=yes`, tự gửi bằng script, có nút khi tắt JS (EC11). */
export function logoutPage(form: string): string {
  const withLogout = form.replace('</form>', '<input type="hidden" name="logout" value="yes"/></form>');
  return page('Đăng xuất', `<h1>Đăng xuất khỏi OIDC mock</h1>
${withLogout}
<p>Đang đăng xuất… Nếu trang không tự chuyển, bấm nút dưới.</p>
<button type="submit" form="op.logoutForm">Đăng xuất</button>
<script>document.getElementById('op.logoutForm').submit();</script>`);
}

/** Trang sau khi đăng xuất mà không có post_logout_redirect_uri (EC12). */
export function loggedOutPage(): string {
  return page('Đã đăng xuất', '<h1>Đã đăng xuất khỏi OIDC mock</h1><p>Có thể đóng trang này.</p>');
}

/** Trang lỗi: mã lỗi và mô tả của oidc-provider, đã escape; không chuyển hướng tới URI chưa đăng ký. */
export function errorPage(out: Record<string, unknown>): string {
  const rows = Object.entries(out).map(([k, v]) => `<p><strong>${escapeHtml(k)}</strong>: ${escapeHtml(v)}</p>`).join('\n');
  return page('Lỗi', `<h1>Yêu cầu OIDC không hợp lệ</h1>\n${rows}`);
}
