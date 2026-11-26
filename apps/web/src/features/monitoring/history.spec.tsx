// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00059 S06: Activity and History, read-only audit trail with its filters (CTX-AUDIT-001; EC33–EC35).

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ACCOUNT_ID, demoFixtures, id } from '../../shell/mock';
import { useMockServer } from '../../shell/mock/node';
import { resetMonitoringMockState } from './__mocks__';
import { P, at, page, renderMonitoring, textOf } from './test-helpers';
import { feature } from '.';
import type { PublicApi } from '@sires/contracts';

type AuditEvent = PublicApi.components['schemas']['AuditEvent'];

const mock = useMockServer({ features: [feature] });
beforeEach(() => resetMonitoringMockState());

const TASK = id('task', 3);
const event = (n: number, actor: AuditEvent['actor'], minutes: number, extra: Partial<AuditEvent> = {}): AuditEvent => ({
  id: id('audit', 700 + n),
  accountId: ACCOUNT_ID,
  projectId: P,
  actor,
  action: `action.${n}`,
  objectType: 'workflow',
  objectId: id('workflow', 52),
  at: at(minutes),
  ...extra,
});
const EVENTS: AuditEvent[] = [
  event(1, { type: 'researcher', accountId: ACCOUNT_ID }, 1, { apr: 'APR-02', action: 'task.activated', objectType: 'task', objectId: TASK, summary: 'Xác nhận thực thi T-2.3.' }),
  event(2, { type: 'agent', agent: 'orchestrator' }, 2, { summary: 'Tạo workflow, lập 5 bước.' }),
  event(3, { type: 'agent', agent: 'discovery' }, 3, { summary: 'Hoàn tất bước 1.' }),
  event(4, { type: 'system' }, 4, { summary: 'workflow → Interrupted.' }),
  event(5, { type: 'researcher', accountId: ACCOUNT_ID }, 5, { action: 'reference.revoked', objectType: 'reference', objectId: id('reference', 3) }),
];

/** listProjectAuditEvents over EVENTS: actorType and objectType/objectId sent as query, newest first, pages of `size`. */
function serve(events: AuditEvent[] = EVENTS, size = 50) {
  mock.use({
    overrides: {
      listProjectAuditEvents: ({ query }) => {
        const q = query as Record<string, string | undefined>;
        const items = events
          .filter((e) => (!q.actorType || e.actor.type === q.actorType) && (!q.objectType || e.objectType === q.objectType) && (!q.objectId || e.objectId === q.objectId))
          .sort((a, b) => b.at.localeCompare(a.at));
        const start = Number(q.cursor ?? 0);
        return page(items.slice(start, start + size), start + size < items.length ? String(start + size) : null);
      },
    },
  });
}
const open = async () => {
  const view = await renderMonitoring(`/projects/${P}/history`);
  await screen.findByRole('table', { name: 'Audit trail' });
  return view;
};
const rows = () => within(screen.getByRole('table', { name: 'Audit trail' })).getAllByRole('row').slice(1);
const summaries = () => rows().map((r) => textOf(r.querySelectorAll('td')[3]));
const audits = (calls: Awaited<ReturnType<typeof renderMonitoring>>['calls']) => calls('GET', `/projects/${P}/audit-events`);

describe('Activity and History (S06)', () => {
  it('lọc actor (EC33)', async () => {
    serve();
    const { user, calls } = await open();
    expect(rows()).toHaveLength(5);
    const actor = screen.getByRole('combobox', { name: 'Actor' });
    expect(within(actor).getAllByRole('option').map((o) => o.textContent)).toEqual(['Tất cả', 'Researcher', 'Orchestrator', 'Specialist Agent', 'System']);

    await user.selectOptions(actor, 'orchestrator');
    await waitFor(() => expect(audits(calls).at(-1)!.query.get('actorType')).toBe('agent'));
    await waitFor(() => expect(summaries()).toEqual(['Tạo workflow, lập 5 bước.']));
    await user.selectOptions(actor, 'specialist');
    await waitFor(() => expect(summaries()).toEqual(['Hoàn tất bước 1.']));
    await user.selectOptions(actor, 'system');
    await waitFor(() => expect(audits(calls).at(-1)!.query.get('actorType')).toBe('system'));
    await waitFor(() => expect(summaries()).toEqual(['workflow → Interrupted.']));
    await user.selectOptions(actor, 'researcher');
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(audits(calls).at(-1)!.query.get('actorType')).toBe('researcher');
  });

  it('lọc actor báo khi còn trang (EC33)', async () => {
    serve(EVENTS, 1);
    const { user } = await open();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Actor' }), 'orchestrator');
    expect(await screen.findByText(/áp trên các mục đã tải; còn mục chưa tải/)).toBeTruthy();
  });

  it('lọc loại và Task (EC34)', async () => {
    serve();
    const { user, calls } = await open();
    const kind = screen.getByRole('combobox', { name: 'Loại sự kiện' });
    // “Thay đổi”, “Quyết định” wait for I2.
    expect(within(kind).getAllByRole('option').map((o) => o.textContent)).toEqual(['Tất cả', 'Phê duyệt', 'Sự kiện agent']);
    const before = audits(calls).length;
    await user.selectOptions(kind, 'approval');
    await waitFor(() => expect(summaries()).toEqual(['Xác nhận thực thi T-2.3.']));
    await user.selectOptions(kind, 'agent');
    await waitFor(() => expect(summaries()).toEqual(['Hoàn tất bước 1.', 'Tạo workflow, lập 5 bước.']));
    // Type filters run on the loaded items: nothing more was asked.
    expect(audits(calls)).toHaveLength(before);
    await user.selectOptions(kind, 'all');

    const task = screen.getByRole('combobox', { name: 'Task' });
    const stableKey = demoFixtures.Task!.find((t) => t.id === TASK)!.stableKey;
    await user.selectOptions(task, TASK);
    await waitFor(() => expect(audits(calls).at(-1)!.query.get('objectId')).toBe(TASK));
    expect(audits(calls).at(-1)!.query.get('objectType')).toBe('task');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(within(task).getByRole('option', { name: new RegExp(`^${stableKey} · `) })).toBeTruthy();
  });

  it('bảng chỉ đọc (EC35)', async () => {
    const html = event(6, { type: 'agent', agent: 'synthesis' }, 9, { summary: 'Tóm tắt <b>đậm</b><img src=x onerror=alert(1)>' });
    const older = event(7, { type: 'system' }, -10, { summary: 'Sự kiện cũ nhất' });
    serve([...EVENTS, html, older], 6);
    const { user, calls } = await open();
    const headers = within(screen.getByRole('table', { name: 'Audit trail' })).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Thời điểm', 'Actor', 'Loại', 'Sự kiện', 'Đối tượng']);
    // Newest first; a summary is text, never HTML.
    expect(summaries()[0]).toBe('Tóm tắt <b>đậm</b><img src=x onerror=alert(1)>');
    expect(rows()[0]!.querySelector('b, img')).toBeNull();
    // No summary: the action; approvals say their APR; objects link when the web has a route.
    const revoked = rows().find((r) => textOf(r).includes('reference.revoked'))!;
    expect(within(revoked).getByRole('link', { name: /^Reference re-/ }).getAttribute('href')).toBe(`/library/${id('reference', 3)}`);
    const approval = rows().find((r) => textOf(r).includes('Xác nhận thực thi'))!;
    expect(textOf(approval.querySelectorAll('td')[2])).toBe('Phê duyệt APR-02');
    const created = rows().find((r) => textOf(r).includes('Tạo workflow'))!;
    expect(within(created).getByRole('link', { name: /^Workflow wf-/ }).getAttribute('href')).toBe(`/projects/${P}/activity/workflows/${id('workflow', 52)}`);
    // Read-only: the only buttons are “Xem thêm”; no edit, no delete.
    const buttons = within(screen.getByRole('main')).getAllByRole('button').map((b) => b.textContent);
    expect(buttons.filter((b) => /Sửa|Xóa|Edit|Delete/.test(b ?? ''))).toEqual([]);
    expect(rows()).toHaveLength(6);
    await user.click(screen.getByRole('button', { name: 'Xem thêm' }));
    await waitFor(() => expect(rows()).toHaveLength(7));
    expect(audits(calls).at(-1)!.query.get('cursor')).toBe('6');
    expect(summaries().at(-1)).toBe('Sự kiện cũ nhất');
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).toBeNull();
  });
});
