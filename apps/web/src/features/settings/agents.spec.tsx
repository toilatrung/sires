// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00036 S06: Agent Models and the embedding model on the PID-00013 mock (UX-SETTINGS-003-AC01; EC24, EC37–EC46).

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ACCOUNT_ID } from '../../shell/mock';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { CLAUDE_CONNECTION_ID, GEMINI_CONNECTION_ID, OPENAI_CONNECTION_ID, PROXY_CONNECTION_ID, resetSettingsMockState } from './__mocks__';
import { current, initState, listAssignments, listConnections, type Connection } from './__mocks__/store';
import { problem, renderSettings } from './test-helpers';
import { feature } from '.';

const mock = useMockServer({ features: [feature] });

beforeEach(() => resetSettingsMockState());

/** The store as the reference screens seed it, changed by `edit` before the screen opens. */
function seedWith(edit: (connections: Connection[]) => Connection[]) {
  initState({ accountId: ACCOUNT_ID });
  const s = current();
  s.connections = edit(s.connections);
}

async function openAgents() {
  const view = renderSettings('/settings/agents');
  await waitForFrame();
  await screen.findByRole('heading', { level: 2, name: 'Agent Models' });
  await screen.findByRole('table');
  return view;
}

const editor = () => within(screen.getByRole('region', { name: /Đang sửa/ }));

describe('Agent Models (S06)', () => {
  it('đổi embedding xác nhận (UX-SETTINGS-003-AC01, EC46)', async () => {
    seedWith((cs) => cs.filter((c) => c.id === CLAUDE_CONNECTION_ID || c.id === OPENAI_CONNECTION_ID));
    const { user, calls } = await openAgents();
    const row = within(screen.getByRole('region', { name: /Embedding model/ }));
    const [connection, model] = row.getAllByRole('combobox') as HTMLSelectElement[];
    expect([...connection.options].map((o) => o.textContent)).toEqual(['OpenAI cá nhân']);
    expect([...model.options].map((o) => o.value).filter(Boolean)).toEqual(['text-embedding-3-small', 'text-embedding-3-large']);
    expect(model.value).toBe('text-embedding-3-small');

    await user.selectOptions(model, 'text-embedding-3-large');
    await user.click(row.getByRole('button', { name: 'Đổi embedding model' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Đổi embedding model?' }));
    expect(dialog.getByText('Chuyển từ text-embedding-3-small sang text-embedding-3-large.')).toBeTruthy();
    expect(dialog.getByText('Mọi Reference đã index phải index lại toàn bộ.')).toBeTruthy();
    expect(dialog.getByText('Việc index tiêu thụ usage trên kết nối “OpenAI cá nhân”.')).toBeTruthy();
    await user.click(dialog.getByRole('button', { name: 'Giữ model hiện tại' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls('PUT', '/me/embedding-settings')).toHaveLength(0);

    await user.click(row.getByRole('button', { name: 'Đổi embedding model' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đổi và index lại' }));
    await waitFor(() => expect(calls('PUT', '/me/embedding-settings')).toHaveLength(1));
    expect(JSON.parse(calls('PUT', '/me/embedding-settings')[0].body ?? '{}')).toEqual({ providerConnectionId: OPENAI_CONNECTION_ID, model: 'text-embedding-3-large' });
  });

  it('chưa có kết nối Valid (EC37)', async () => {
    seedWith((cs) => cs.filter((c) => c.id === GEMINI_CONNECTION_ID));
    const { user } = await openAgents();
    expect(screen.getByText('Chưa có kết nối hợp lệ')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Quản lý Provider Connections' }).length).toBeGreaterThan(0);
    const edit = screen.getByRole('button', { name: 'Sửa model của Writing Agent' }) as HTMLButtonElement;
    expect(edit.disabled).toBe(true);
    await user.click(edit);
    expect(screen.queryByRole('region', { name: /Đang sửa/ })).toBeNull();
  });

  it('chỉ kết nối Valid (EC38)', async () => {
    const { user } = await openAgents();
    await user.click(screen.getByRole('button', { name: 'Sửa model của Writing Agent' }));
    expect((editor().getByRole('radio', { name: /^Gemini cá nhân/ }) as HTMLInputElement).disabled).toBe(true);
    expect((editor().getByRole('radio', { name: /^Claude cá nhân/ }) as HTMLInputElement).disabled).toBe(false);
    expect(editor().getByRole('link', { name: 'Thêm connection mới' })).toBeTruthy();
  });

  it('lọc model (EC39)', async () => {
    const { user, calls } = await openAgents();
    await user.click(screen.getByRole('button', { name: 'Sửa model của Writing Agent' }));
    await user.click(editor().getByRole('radio', { name: /^OpenAI cá nhân/ }));
    const models = editor()
      .getAllByRole('radio')
      .filter((r) => (r as HTMLInputElement).name === 'assignment-model')
      .map((r) => (r as HTMLInputElement).value);
    expect(models).toEqual(['gpt-5', 'gpt-5-mini', 'gpt-5-nano']);
    await user.click(editor().getByRole('radio', { name: /^gpt-5-mini/ }));
    await user.click(editor().getByRole('button', { name: 'Lưu cho agent này' }));
    await waitFor(() => expect(calls('PUT', '/agent-model-assignments/writing')).toHaveLength(1));
    expect(JSON.parse(calls('PUT', '/agent-model-assignments/writing')[0].body ?? '{}')).toEqual({ providerConnectionId: OPENAI_CONNECTION_ID, model: 'gpt-5-mini' });
  });

  it('nhập tay (EC24, EC40)', async () => {
    seedWith((cs) => cs.map((c) => (c.id === PROXY_CONNECTION_ID ? { ...c, availableModels: [] } : c)));
    const { user, calls } = await openAgents();
    await user.click(screen.getByRole('button', { name: 'Sửa model của Writing Agent' }));
    await user.click(editor().getByRole('radio', { name: /^Proxy OpenAI tương thích/ }));
    const manual = editor().getByLabelText(/^Tên model/) as HTMLInputElement;
    expect(editor().getByText('Provider không trả về danh sách; nhập đúng tên model.')).toBeTruthy();
    await user.type(manual, 'gpt-5-proxy');
    await user.click(editor().getByRole('button', { name: 'Lưu cho agent này' }));
    await waitFor(() => expect(calls('PUT', '/agent-model-assignments/writing')).toHaveLength(1));
    expect(JSON.parse(calls('PUT', '/agent-model-assignments/writing')[0].body ?? '{}')).toEqual({ providerConnectionId: PROXY_CONNECTION_ID, model: 'gpt-5-proxy' });
  });

  it('cảnh báo năng lực (EC41)', async () => {
    mock.use({
      overrides: {
        listAgentModelAssignments: () => {
          initState({ accountId: ACCOUNT_ID });
          const items = listAssignments().map((a) => (a.agent === 'diagram' ? { ...a, capabilityWarnings: [{ capability: 'vision' as const }] } : a));
          return { status: 200, body: { items, nextCursor: null } };
        },
      },
    });
    await openAgents();
    const row = screen.getByRole('row', { name: /Diagram Agent/ });
    expect(within(row).getByText('Model chưa khai báo khả năng vision mà agent cần.')).toBeTruthy();
  });

  it('cùng model A B (EC42)', async () => {
    await openAgents();
    expect(screen.getByRole('note').textContent).toContain('Hai instance Analysis Agent A và B đang dùng cùng một model');
  });

  it('dùng mặc định (EC43)', async () => {
    const { user, calls } = await openAgents();
    await user.click(screen.getByRole('button', { name: 'Sửa model của Verification Agent' }));
    await user.click(editor().getByRole('button', { name: 'Dùng mặc định' }));
    await waitFor(() => expect(calls('DELETE', '/agent-model-assignments/verification')).toHaveLength(1));
    const row = await screen.findByRole('row', { name: /Verification Agent/ });
    await waitFor(() => expect(within(row).getByText('theo mặc định')).toBeTruthy());
  });

  it('chưa cấu hình (EC44)', async () => {
    mock.use({ overrides: { listAgentModelAssignments: () => ({ status: 200, body: { items: [], nextCursor: null } }) } });
    await openAgents();
    const row = screen.getByRole('row', { name: /Writing Agent/ });
    expect(within(row).getByText('Chưa cấu hình')).toBeTruthy();
  });

  it('embedding lần đầu (EC45)', async () => {
    mock.use({ overrides: { getEmbeddingSettings: () => problem(404, 'not_found') } });
    const { user, calls } = await openAgents();
    const row = within(screen.getByRole('region', { name: /Embedding model/ }));
    expect(row.getByText('Chưa chọn model embedding; Reference chưa index được.')).toBeTruthy();
    const [, model] = row.getAllByRole('combobox') as HTMLSelectElement[];
    await user.selectOptions(model, 'text-embedding-3-small');
    await user.click(row.getByRole('button', { name: 'Lưu embedding model' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(calls('PUT', '/me/embedding-settings')).toHaveLength(1));
  });

  it('model không còn trong danh sách (422)', async () => {
    mock.use({ overrides: { setAgentModelAssignment: () => problem(422, 'model_not_available') } });
    const { user } = await openAgents();
    await user.click(screen.getByRole('button', { name: 'Sửa model của Writing Agent' }));
    await user.click(editor().getByRole('radio', { name: /^Claude cá nhân/ }));
    await user.click(editor().getByRole('radio', { name: /^claude-haiku-5-5/ }));
    await user.click(editor().getByRole('button', { name: 'Lưu cho agent này' }));
    expect(await editor().findByText(/Làm mới danh sách hoặc chọn model khác/)).toBeTruthy();
  });

  it('làm mới danh sách model (EC47)', async () => {
    const { user, calls } = await openAgents();
    await user.click(screen.getByRole('button', { name: 'Sửa model của Writing Agent' }));
    await user.click(editor().getByRole('radio', { name: /^Claude cá nhân/ }));
    expect(editor().getByText(/^Danh sách lấy từ connection lúc/)).toBeTruthy();
    await user.click(editor().getByRole('button', { name: 'Làm mới' }));
    await waitFor(() => expect(calls('POST', `/provider-connections/${CLAUDE_CONNECTION_ID}/test`)).toHaveLength(1));
    expect(await editor().findByRole('radio', { name: /^claude-opus-5-5/ })).toBeTruthy();
  });

  it('mọi kết nối đều có trong bước 1', async () => {
    const { user } = await openAgents();
    await user.click(screen.getByRole('button', { name: 'Sửa model của Writing Agent' }));
    initState({ accountId: ACCOUNT_ID });
    const names = listConnections().map((c) => c.name);
    for (const name of names) expect(editor().getByRole('radio', { name: new RegExp(`^${name}`) })).toBeTruthy();
  });
});
