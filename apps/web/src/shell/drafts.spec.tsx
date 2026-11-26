// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DraftStore } from './drafts/store';
import * as fx from './test/fixtures';
import { composerFeature } from './test/features';
import { renderShellFrame, waitForFrame } from './test/render';
import { json, problem, shellStub } from './test/stub';

const field = () => screen.getByLabelText('Câu hỏi') as HTMLTextAreaElement;
const draftKey = (accountId = fx.ACCOUNT_ID) => DraftStore.key(accountId, '/projects/p1/chat', 'chat.composer');

async function openChat(stub = shellStub()) {
  const view = renderShellFrame({ path: '/projects/p1/chat', stub, features: [composerFeature] });
  await waitForFrame();
  await screen.findByLabelText('Câu hỏi');
  return view;
}

describe('kho nháp (H7)', () => {
  it('khôi phục sau đăng nhập lại cùng tài khoản (PID-00012-AC05, EC08)', async () => {
    const stub = shellStub();
    const first = await openChat(stub);
    await first.user.type(field(), 'câu hỏi đang gõ');

    // A request answers 401: session expired → SignIn session-expired with the way back.
    stub.on('GET', '/api/v1/dashboard', () => problem(401, 'unauthenticated'));
    await first.services.api.get('/dashboard').catch(() => undefined);
    await waitFor(() => expect(first.router.state.location.pathname).toBe('/sign-in'));
    expect(new URLSearchParams(first.router.state.location.search).get('returnTo')).toBe('/projects/p1/chat');
    first.unmountAll();

    // Signed in again (full page load after the OIDC round trip), back on /projects/p1/chat.
    await openChat(shellStub());
    expect(field().value).toBe('câu hỏi đang gõ');
  });

  it('tài khoản khác không khôi phục (EC29)', async () => {
    const first = await openChat();
    await first.user.type(field(), 'nháp của tài khoản A');
    first.unmountAll();

    const other = shellStub();
    other.on('GET', '/api/v1/auth/session', () => json({ ...fx.session, accountId: fx.OTHER_ACCOUNT_ID }));
    await openChat(other);
    expect(field().value).toBe('');
    // A's draft is still there for A.
    expect(localStorage.getItem(draftKey())).not.toBeNull();
  });

  it('xóa khi gửi xong, khi đăng xuất (EC30)', async () => {
    const first = await openChat();
    await first.user.type(field(), 'gửi đi');
    expect(localStorage.getItem(draftKey())).not.toBeNull();
    await first.user.click(screen.getByRole('button', { name: 'Gửi' }));
    expect(field().value).toBe('');
    expect(localStorage.getItem(draftKey())).toBeNull();

    // Sign-out removes every draft of the account (direct call of the account-wide clear).
    await first.user.type(field(), 'còn dở');
    localStorage.setItem(DraftStore.key(fx.ACCOUNT_ID, '/projects/p2/plan', 'plan.editor'), JSON.stringify({ value: 'khác' }));
    localStorage.setItem(DraftStore.key(fx.OTHER_ACCOUNT_ID, '/projects/p1/chat', 'chat.composer'), JSON.stringify({ value: 'B' }));
    first.services.drafts.clearAccount(fx.ACCOUNT_ID);
    expect(localStorage.getItem(draftKey())).toBeNull();
    expect(localStorage.getItem(DraftStore.key(fx.ACCOUNT_ID, '/projects/p2/plan', 'plan.editor'))).toBeNull();
    expect(localStorage.getItem(draftKey(fx.OTHER_ACCOUNT_ID))).not.toBeNull();
  });

  it('xóa khi đăng xuất qua menu avatar (PID-00012-AC05 phần đăng xuất, S14)', async () => {
    const view = await openChat();
    await view.user.type(field(), 'chưa gửi');
    expect(localStorage.getItem(draftKey())).not.toBeNull();
    await view.user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Tài khoản: Nguyễn Thanh' }));
    await view.user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
    await waitFor(() => expect(view.browser.forms).toHaveLength(1));
    expect(localStorage.getItem(draftKey())).toBeNull();
  });

  it('nháp lưu theo route: cùng ô ở project khác là nháp khác', async () => {
    const view = await openChat();
    await view.user.type(field(), 'p1');
    await view.router.navigate('/projects/p2/chat');
    await waitFor(() => expect(field().value).toBe(''));
    await view.user.type(field(), 'p2');
    await view.router.navigate('/projects/p1/chat');
    await waitFor(() => expect(field().value).toBe('p1'));
  });
});
