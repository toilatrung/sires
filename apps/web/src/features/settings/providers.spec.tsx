// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00036 S03, S04: Provider Connections on the PID-00013 mock (PID-00036-AC01, UX-SETTINGS-002-AC01, AC02,
// NFR-PRIV-001-AC01, AGENT-PROVIDER-002-AC01, AC03; EC13–EC28, EC54).

import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_ID } from '../../shell/mock';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { OPENAI_CONNECTION_ID, resetSettingsMockState } from './__mocks__';
import { initState, listConnections } from './__mocks__/store';
import { problem, renderSettings } from './test-helpers';
import { feature } from '.';

const mock = useMockServer({ features: [feature] });

beforeEach(() => resetSettingsMockState());
afterEach(() => vi.restoreAllMocks());

const emptyList = () => mock.use({ overrides: { listProviderConnections: () => ({ status: 200, body: { items: [], nextCursor: null } }) } });
const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const form = () => within(screen.getByRole('region', { name: /Kết nối mới|Sửa kết nối/ }));

async function openProviders() {
  const view = renderSettings('/settings/providers');
  await waitForFrame();
  await screen.findByRole('table');
  return view;
}

async function fillNew(user: ReturnType<typeof renderSettings>['user'], values: { name: string; provider?: string; key: string }) {
  await user.type(field(/^Tên kết nối/), values.name);
  if (values.provider) await user.selectOptions(screen.getByLabelText(/^Provider/), values.provider);
  await user.type(field(/^API key/), values.key);
}

describe('Provider Connections (S03)', () => {
  it('key sai Invalid kèm hành động (PID-00036-AC01, EC19)', async () => {
    const { user } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Sửa kết nối Gemini cá nhân' }));
    await user.type(field(/^API key/), 'sk-test-WRONG-0001');
    await user.click(form().getByRole('button', { name: 'Kiểm tra kết nối' }));
    const result = await screen.findByRole('alert');
    expect(within(result).getByText('Invalid')).toBeTruthy();
    expect(result.textContent).toContain('auth_failed');
    expect(result.textContent).toContain('API key bị từ chối.');
    expect((form().getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(result).getByRole('button', { name: 'Sửa API key' }));
    expect(document.activeElement).toBe(field(/^API key/));
    expect(field(/^API key/).value).toBe('');
    expect(field(/^API key/).placeholder).toBe('••••••••0001');
    expect(document.body.innerHTML).not.toContain('sk-test-WRONG-0001');
    expect(JSON.stringify({ ...localStorage })).not.toContain('sk-test-WRONG-0001');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('sk-test-WRONG-0001');
  });

  it('chỉ ba provider, chưa kiểm không Valid (UX-SETTINGS-002-AC01)', async () => {
    const { user } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Thêm kết nối' }));
    const options = within(screen.getByLabelText(/^Provider/)).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Anthropic Claude', 'OpenAI', 'Google Gemini']);
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(['anthropic', 'openai', 'google']);
    expect(within(form().getByRole('heading')).getByText('Untested')).toBeTruthy();
    expect((form().getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(true);

    await fillNew(user, { name: 'Claude nhóm', key: 'sk-test-wrong-key-1' });
    await user.click(form().getByRole('button', { name: 'Kiểm tra kết nối' }));
    await screen.findByRole('alert');
    expect(within(form().getByRole('heading')).getByText('Invalid')).toBeTruthy();
    expect((form().getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(true);

    await user.type(field(/^API key/), 'sk-test-good-key-1');
    await user.click(form().getByRole('button', { name: 'Kiểm tra kết nối' }));
    expect((await form().findByText(/^Hợp lệ · 4 model/)).textContent).toBeTruthy();
    expect(within(form().getByRole('heading')).getByText('Valid')).toBeTruthy();
    expect((form().getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('trống hướng dẫn (UX-SETTINGS-002-AC02, EC13)', async () => {
    emptyList();
    renderSettings('/settings/providers');
    await waitForFrame();
    expect(await screen.findByText('Thêm API key của bạn để agent hoạt động')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thêm kết nối' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('thông báo kết nối đầu tiên (NFR-PRIV-001-AC01, EC13)', async () => {
    emptyList();
    const { user, unmountAll } = renderSettings('/settings/providers');
    await waitForFrame();
    const note = await screen.findByRole('note');
    expect(note.textContent).toContain('Nội dung gửi cho agent sẽ được gửi tới provider');
    expect(note.textContent).toContain('Orchestrator');
    expect(note.textContent).toContain('Lĩnh vực nghiên cứu');
    const test = form().getByRole('button', { name: 'Kiểm tra kết nối' }) as HTMLButtonElement;
    expect(test.disabled).toBe(true);
    await user.click(within(note).getByRole('checkbox', { name: 'Tôi đã đọc' }));
    expect(test.disabled).toBe(false);
    unmountAll();

    mock.server.resetHandlers();
    resetSettingsMockState();
    const again = await openProviders();
    await again.user.click(screen.getByRole('button', { name: 'Thêm kết nối' }));
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('key không lộ (AGENT-PROVIDER-002-AC01, EC25)', async () => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    const KEY = 'sk-test-KNOWN-4f2a';
    const first = await openProviders();
    await first.user.click(screen.getByRole('button', { name: 'Thêm kết nối' }));
    await fillNew(first.user, { name: 'Claude dự phòng', key: KEY });
    await first.user.click(form().getByRole('button', { name: 'Kiểm tra kết nối' }));
    await form().findByText(/^Hợp lệ/);
    await first.user.click(form().getByRole('button', { name: 'Lưu' }));
    const created = first.calls('POST', '/provider-connections');
    expect(created).toHaveLength(1);
    expect(created[0].body).toContain(KEY);
    const others = first.sent.filter((r) => r !== created[0]);
    expect(others.some((r) => `${r.url} ${r.body ?? ''} ${JSON.stringify(r.headers)}`.includes(KEY))).toBe(false);
    first.unmountAll();

    const second = await openProviders();
    const row = screen.getByRole('row', { name: /Claude dự phòng/ });
    expect(within(row).getByText('••••••••4f2a')).toBeTruthy();
    expect(within(row).queryByRole('button', { name: /hiện|show/i })).toBeNull();
    expect(document.body.innerHTML).not.toContain(KEY);
    const { pathname, search, hash } = second.router.state.location;
    expect(`${pathname}${search}${hash}`).not.toContain(KEY);
    expect(JSON.stringify({ ...localStorage })).not.toContain(KEY);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(KEY);
    expect(second.sent.some((r) => `${r.url} ${r.body ?? ''}`.includes(KEY))).toBe(false);
    for (const spy of logs) expect(spy.mock.calls.flat().map(String).join(' ')).not.toContain(KEY);
  });

  it('base URL theo provider (EC14)', async () => {
    const { user } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Thêm kết nối' }));
    expect(field(/^Base URL/).value).toBe('https://api.anthropic.com');
    await user.selectOptions(screen.getByLabelText(/^Provider/), 'openai');
    expect(field(/^Base URL/).value).toBe('https://api.openai.com/v1');
    await user.clear(field(/^Base URL/));
    await user.type(field(/^Base URL/), 'https://gateway.example/v1');
    await user.selectOptions(screen.getByLabelText(/^Provider/), 'google');
    expect(field(/^Base URL/).value).toBe('https://gateway.example/v1');
  });

  it('base URL sai (EC15)', async () => {
    const { user, calls } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Thêm kết nối' }));
    await fillNew(user, { name: 'Sai URL', key: 'sk-test-1234567' });
    await user.clear(field(/^Base URL/));
    await user.type(field(/^Base URL/), 'http://api.example');
    await user.click(form().getByRole('button', { name: 'Kiểm tra kết nối' }));
    expect(screen.getByText('Base URL phải là đường dẫn https:// hợp lệ.')).toBeTruthy();
    expect(calls('POST', '/provider-connections')).toHaveLength(0);
  });

  it('proxy Valid (EC16)', async () => {
    await openProviders();
    const row = screen.getByRole('row', { name: /Proxy OpenAI tương thích/ });
    expect(within(row).getByText('https://llm-proxy.example/v1')).toBeTruthy();
    expect(within(row).getByText('Valid')).toBeTruthy();
  });

  it('tên trùng (EC17)', async () => {
    const { user } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Thêm kết nối' }));
    await fillNew(user, { name: 'Claude cá nhân', key: 'sk-test-12345678' });
    await user.click(form().getByRole('button', { name: 'Kiểm tra kết nối' }));
    expect(await screen.findByText('Đã có kết nối trùng tên. Chọn tên khác.')).toBeTruthy();
    expect(field(/^Tên kết nối/).getAttribute('aria-invalid')).toBe('true');
  });

  it('lỗi trường (EC18)', async () => {
    mock.use({
      overrides: {
        createProviderConnection: () =>
          new Response(JSON.stringify({ type: 'x', title: 'x', status: 400, code: 'validation_failed', errors: [{ field: 'apiKey', code: 'too_small' }] }), {
            status: 400,
            headers: { 'Content-Type': 'application/problem+json' },
          }),
      },
    });
    const { user } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Thêm kết nối' }));
    await fillNew(user, { name: 'Lỗi trường', key: 'sk-test-12345678' });
    await user.click(form().getByRole('button', { name: 'Kiểm tra kết nối' }));
    expect(await screen.findByText('API key tối thiểu 8 ký tự.')).toBeTruthy();
  });

  it('lỗi tạm thời (EC20)', async () => {
    const { user } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Thêm kết nối' }));
    await fillNew(user, { name: 'Bận', key: 'sk-test-timeout-1' });
    await user.click(form().getByRole('button', { name: 'Kiểm tra kết nối' }));
    const result = await screen.findByRole('alert');
    expect(result.textContent).toContain('timeout');
    expect(within(result).getByRole('button', { name: 'Kiểm tra lại' })).toBeTruthy();
  });

  it('đang kiểm tra (EC21)', async () => {
    const { user } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Thêm kết nối' }));
    await fillNew(user, { name: 'Đang chạy', key: 'sk-test-12345678' });
    await user.click(form().getByRole('button', { name: 'Kiểm tra kết nối' }));
    const running = form().getByRole('button', { name: 'Đang kiểm tra…' }) as HTMLButtonElement;
    expect(running.disabled).toBe(true);
    expect(form().getByRole('status').textContent).toBe('Đang gửi yêu cầu thử tới provider…');
    await form().findByText(/^Hợp lệ/);
  });

  it('lệnh kiểm tra lỗi (EC21)', async () => {
    mock.use({ overrides: { testProviderConnection: () => problem(503, 'service_unavailable') } });
    const { user } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Kiểm tra lại kết nối Claude cá nhân' }));
    expect(await screen.findByText('SIRes tạm thời không phục vụ được.')).toBeTruthy();
    expect(screen.getByText('Kết quả kiểm tra cũ được giữ nguyên.')).toBeTruthy();
  });

  it('đóng form khi Invalid (EC22)', async () => {
    const { user } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Thêm kết nối' }));
    await fillNew(user, { name: 'Gemini thử', provider: 'google', key: 'sk-test-wrong-9999' });
    await user.click(form().getByRole('button', { name: 'Kiểm tra kết nối' }));
    await screen.findByRole('alert');
    await user.click(form().getByRole('button', { name: 'Đóng' }));
    const row = screen.getByRole('row', { name: /Gemini thử/ });
    expect(within(row).getByText('Invalid')).toBeTruthy();
  });

  it('sửa về Untested (EC23)', async () => {
    const { user, calls } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Sửa kết nối Claude cá nhân' }));
    await user.clear(field(/^Tên kết nối/));
    await user.type(field(/^Tên kết nối/), 'Claude chính');
    await user.click(form().getByRole('button', { name: 'Kiểm tra kết nối' }));
    await form().findByText(/^Hợp lệ/);
    const patch = calls('PATCH', /^\/provider-connections\//);
    expect(patch).toHaveLength(1);
    expect(JSON.parse(patch[0].body ?? '{}')).toEqual({ name: 'Claude chính' });
    expect(patch[0].headers['If-Match']).toBe('"1"');
  });

  it('không có model (EC24)', async () => {
    mock.use({
      overrides: {
        testProviderConnection: ({ params }) => {
          initState({ accountId: ACCOUNT_ID });
          const row = listConnections().find((c) => c.id === params.connectionId);
          return { status: 200, body: { ...row!, testStatus: 'Valid', availableModels: [] } };
        },
      },
    });
    const { user } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Thêm kết nối' }));
    await fillNew(user, { name: 'Không model', key: 'sk-test-12345678' });
    await user.click(form().getByRole('button', { name: 'Kiểm tra kết nối' }));
    expect(await form().findByText(/Không lấy được danh sách model/)).toBeTruthy();
    await user.click(form().getByRole('button', { name: 'Lưu' }));
    const row = screen.getByRole('row', { name: /Không model/ });
    expect(within(row).getByText('Không lấy được danh sách model')).toBeTruthy();
  });

  it('lỗi trường trên máy khách (EC18)', async () => {
    const { user, calls } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Thêm kết nối' }));
    await user.type(field(/^API key/), 'sk-1');
    await user.click(form().getByRole('button', { name: 'Kiểm tra kết nối' }));
    expect(screen.getByText('Nhập tên kết nối.')).toBeTruthy();
    expect(screen.getByText('API key tối thiểu 8 ký tự.')).toBeTruthy();
    expect(calls('POST', '/provider-connections')).toHaveLength(0);
  });

  it('tên có HTML (EC54)', async () => {
    const { user } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Thêm kết nối' }));
    await fillNew(user, { name: '<img src=x onerror=alert(1)>', key: 'sk-test-12345678' });
    await user.click(form().getByRole('button', { name: 'Kiểm tra kết nối' }));
    await form().findByText(/^Hợp lệ/);
    expect(screen.getByRole('row', { name: /<img src=x onerror=alert\(1\)>/ })).toBeTruthy();
    expect(screen.getByRole('table').querySelector('img')).toBeNull();
  });
});

describe('xóa Provider Connection (S04)', () => {
  it('xóa (EC26)', async () => {
    const { user } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Xóa kết nối Proxy OpenAI tương thích' }));
    const dialog = screen.getByRole('dialog', { name: 'Xóa kết nối Proxy OpenAI tương thích?' });
    expect(dialog.textContent).toContain('Không agent nào dùng kết nối này');
    await user.click(within(dialog).getByRole('button', { name: 'Giữ kết nối' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Xóa kết nối Proxy OpenAI tương thích' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xóa kết nối' }));
    await waitFor(() => expect(screen.queryByRole('row', { name: /Proxy OpenAI tương thích/ })).toBeNull());
  });

  it('xóa cần thay thế (AGENT-PROVIDER-002-AC03, EC27)', async () => {
    let query: URLSearchParams | undefined;
    mock.use({
      overrides: {
        listProviderConnections: () => {
          initState({ accountId: ACCOUNT_ID });
          const items = listConnections().map((c) => (c.name === 'Claude cá nhân' ? { ...c, assignedAgents: ['writing' as const] } : c));
          return { status: 200, body: { items, nextCursor: null } };
        },
        deleteProviderConnection: ({ request }) => {
          query = new URL(request.url).searchParams;
          return { status: 204 };
        },
      },
    });
    const { user } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Xóa kết nối Claude cá nhân' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText(/Writing Agent/)).toBeTruthy();
    const confirm = dialog.getByRole('button', { name: 'Xóa kết nối' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect((dialog.getByRole('radio', { name: /^Gemini cá nhân/ }) as HTMLInputElement).disabled).toBe(true);
    await user.click(dialog.getByRole('radio', { name: /^OpenAI cá nhân/ }));
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    await waitFor(() => expect(query?.get('replacementConnectionId')).toBe(OPENAI_CONNECTION_ID));
  });

  it('409 connection_in_use (EC28)', async () => {
    let lists = 0;
    mock.use({
      overrides: {
        listProviderConnections: () => {
          lists += 1;
          initState({ accountId: ACCOUNT_ID });
          return { status: 200, body: { items: listConnections(), nextCursor: null } };
        },
        deleteProviderConnection: () => problem(409, 'connection_in_use'),
      },
    });
    const { user } = await openProviders();
    await user.click(screen.getByRole('button', { name: 'Xóa kết nối Proxy OpenAI tương thích' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xóa kết nối' }));
    expect(await within(screen.getByRole('dialog')).findByText(/Kết nối vừa được agent dùng/)).toBeTruthy();
    expect(within(screen.getByRole('dialog')).getByText('Kết nối chưa bị xóa.')).toBeTruthy();
    await waitFor(() => expect(lists).toBe(2));
  });
});
