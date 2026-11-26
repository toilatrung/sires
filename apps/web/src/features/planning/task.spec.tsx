// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00082 S04: Task panel of the Plan screen (readiness with actions, Execute with confirmation, manual flow,
// checklist, workflow history, needs review, allowedActions, Archived project) on the planning mock.

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { artifact, emptyPage, PROJECT_ID, planningState, renderPlanning, T, textOf, usePlanningMock, V4, workflow } from './testing';

const open = async (taskId: string, extra = '') => {
  const view = renderPlanning(`/projects/${PROJECT_ID}/plan?task=${taskId}${extra}`);
  const panel = await screen.findByRole('complementary', { name: 'Chi tiết Task' });
  await within(panel).findByRole('heading', { level: 2 });
  return { ...view, panel };
};
const task = (key: keyof typeof T) => planningState().tasks.find((t) => t.id === T[key])!;
const readyAgentTask = () => {
  const t = task('2.6');
  t.status = 'Ready';
  t.lastReadiness = { ...t.lastReadiness!, passed: true, checks: t.lastReadiness!.checks.map((c) => ({ ...c, passed: true, detail: c.code === 'RC-08' ? 'Diagram Agent có kết nối hợp lệ' : c.detail })) };
  (t as { allowedActions?: string[] }).allowedActions = ['activate', 'cancel', 'recheck_readiness'];
  return t;
};

describe('Panel Task (PID-00082 S04)', () => {
  const mock = usePlanningMock();
  const quietOthers = () =>
    mock.use({ overrides: { listWorkflows: () => emptyPage, listArtifacts: () => emptyPage } });

  it('lý do chặn kèm hành động (PID-00082-AC01, UX-TASK-004-AC01, EC14)', async () => {
    quietOthers();
    const { panel, unmountAll } = await open(T['2.5']);
    const readiness = await within(panel).findByRole('heading', { name: /^Readiness check · Không đạt · \d{2}:\d{2}$/ });
    const list = readiness.parentElement!;
    const rc4 = within(list).getByText(/Dependency T-2\.3 chưa Completed/).closest('li')!;
    expect(within(rc4).getByRole('link', { name: 'Mở T-2.3' }).getAttribute('href')).toContain(`task=${T['2.3']}`);
    const rc7 = within(list).getByText(/Thiếu đầu vào: tiêu chí so sánh chưa được xác nhận/).closest('li')!;
    expect(within(rc7).getByRole('link', { name: 'Trả lời câu hỏi' }).getAttribute('href')).toBe(`/projects/${PROJECT_ID}/chat`);
    expect(within(list).getByText('Đạt: agent có kết nối hợp lệ · 12 Trusted Reference Indexed')).toBeTruthy();
    unmountAll();

    const second = await open(T['2.6']);
    const rc8 = (await within(second.panel).findByText(/Diagram Agent chưa có kết nối hợp lệ/)).closest('li')!;
    expect(within(rc8).getByRole('link', { name: 'Mở Settings → Agent Models' }).getAttribute('href')).toBe('/settings/agents');
    second.unmountAll();
  });

  it('Blocked không thực thi (UX-TASK-005-AC01, EC15)', async () => {
    quietOthers();
    const { panel, unmountAll } = await open(T['2.5']);
    const execute = within(panel).getByRole('button', { name: 'Thực thi' }) as HTMLButtonElement;
    expect(execute.disabled).toBe(true);
    expect(within(panel).getByText('Task đang Blocked: chưa thực thi được. Thực thi chỉ khi Ready và readiness Đạt.')).toBeTruthy();
    unmountAll();

    // Ready with readiness passed: Execute asks first, nothing is sent before the answer.
    let activated = 0;
    mock.server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/activate')) activated += 1;
    });
    const ready = await open(readyAgentTask().id);
    await ready.user.click(within(ready.panel).getByRole('button', { name: 'Thực thi' }));
    expect(screen.getByRole('dialog', { name: 'Thực thi T-2.6?' })).toBeTruthy();
    expect(activated).toBe(0);
    mock.server.events.removeAllListeners();
    ready.unmountAll();
  });

  it('lịch sử hai lần chạy (UX-TASK-003-AC01, EC21)', async () => {
    const first = workflow(1, T['2.2'], 'Failed', '2026-11-20T08:00:00Z', '2026-11-20T08:20:00Z');
    const second = workflow(2, T['2.2'], 'Running', '2026-11-21T09:00:00Z');
    mock.use({
      overrides: {
        listWorkflows: ({ query }) => ({ status: 200, body: { items: query.taskId === T['2.2'] ? [second, first] : [], nextCursor: null } }),
        listArtifacts: () => ({
          status: 200,
          body: { items: [artifact(1, T['2.2'], 'Danh sách nghiên cứu lần 1', '2026-11-20T08:10:00Z', { versionNumber: 1, status: 'Rejected' })], nextCursor: null },
        }),
      },
    });
    const { panel, unmountAll } = await open(T['2.2']);
    const history = within(panel).getByRole('heading', { name: 'Lịch sử workflow' }).parentElement!;
    await waitFor(() => expect(history.querySelectorAll('.planning-history__row').length).toBe(2));
    const rows = history.querySelectorAll('.planning-history__row');
    expect(textOf(rows[0])).toContain('Failed');
    expect(within(rows[0] as HTMLElement).getByRole('link', { name: 'Danh sách nghiên cứu lần 1' })).toBeTruthy();
    expect(textOf(rows[1])).toContain('Running');
    expect(textOf(rows[1])).toContain('Không tạo artifact');
    expect(within(rows[1] as HTMLElement).getByRole('link', { name: second.id.slice(0, 8) }).getAttribute('href')).toBe(`/projects/${PROJECT_ID}/activity/workflows/${second.id}`);
    unmountAll();

    // Never run: the sentence says so.
    mock.use({ overrides: { listWorkflows: () => emptyPage } });
    const again = await open(T['3.1']);
    expect(await within(again.panel).findByText(/Chưa chạy lần nào/)).toBeTruthy();
    again.unmountAll();
  });

  it('Task manual (UX-LABEL-002-AC01, EC18)', async () => {
    quietOthers();
    const { panel, unmountAll } = await open(T['2.4']);
    expect(within(panel).queryByRole('button', { name: 'Thực thi' })).toBeNull();
    expect(within(panel).getByText('Manual editor requirement')).toBeTruthy();
    const block = within(panel).getByRole('heading', { name: 'Bạn cần thực hiện' }).parentElement!;
    expect(textOf(block)).toContain('Phỏng vấn TS. Trần Quốc Bảo');
    expect(textOf(block)).toContain('Đầu ra bắt buộc: manual_submission Biên bản phỏng vấn');
    expect(within(block).getByRole('button', { name: 'Bắt đầu thực hiện' })).toBeTruthy();
    unmountAll();
  });

  it('định nghĩa theo version (EC13)', async () => {
    quietOthers();
    const { panel, unmountAll } = await open(T['2.5'], `&version=${V4}`);
    expect(textOf(panel.querySelector('.planning-panel__meta'))).toBe('T-2.5 · định nghĩa theo v4');
    // v4 adds T-2.2 as a prerequisite: RC-04 offers both.
    expect(await within(panel).findByRole('link', { name: 'Mở T-2.2' })).toBeTruthy();
    expect(within(panel).getByRole('link', { name: 'Mở T-2.3' })).toBeTruthy();
    unmountAll();

    // A Task the version does not have: the panel says so and shows the current definition.
    const v2 = planningState().versions.find((v) => v.versionNumber === 2)!;
    v2.tasks = v2.tasks!.filter((d) => d.taskId !== T['2.7']);
    const other = await open(T['2.7'], `&version=${v2.id}`);
    await waitFor(() => expect(textOf(other.panel.querySelector('.planning-panel__meta'))).toBe('T-2.7 · không có trong v2, hiện định nghĩa hiện hành'));
    other.unmountAll();

    // A Task the version adds (no Task yet): “mới trong v4”.
    const added = planningState().versions.find((v) => v.id === V4)!.tasks!.find((d) => d.stableKey === 'T-3.2')!;
    const fresh = renderPlanning(`/projects/${PROJECT_ID}/plan?version=${V4}&task=${added.taskId}`);
    const aside = await screen.findByRole('complementary', { name: 'Chi tiết Task' });
    expect(await within(aside).findByText(/mới trong v4, Task được tạo khi v4 được duyệt/)).toBeTruthy();
    fresh.unmountAll();
  });

  it('thực thi cần xác nhận (EC16)', async () => {
    quietOthers();
    const t = readyAgentTask();
    let keys: (string | null)[] = [];
    mock.server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/activate')) keys.push(request.headers.get('idempotency-key'));
    });
    const { panel, user, unmountAll } = await open(t.id);
    expect(within(panel).getByText('Thực thi chỉ khi Ready và readiness Đạt; luôn hỏi xác nhận. Mỗi lần một Task.')).toBeTruthy();
    await user.click(within(panel).getByRole('button', { name: 'Thực thi' }));
    let dialog = screen.getByRole('dialog', { name: 'Thực thi T-2.6?' });
    expect(textOf(dialog)).toContain('Diagram Agent sẽ bắt đầu một workflow');
    await user.click(within(dialog).getByRole('button', { name: 'Không thực thi' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(keys).toEqual([]);

    // 409 (another Task started first): the panel says so and reads the Task again.
    mock.use({ overrides: { activateTask: () => ({ status: 409, body: { type: 'x', title: 'x', status: 409, code: 'invalid_transition', detail: 'Đang có Task khác chạy.' } }) } });
    await user.click(within(panel).getByRole('button', { name: 'Thực thi' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Thực thi' }));
    expect(await within(panel).findByText('Chưa thực thi được Task')).toBeTruthy();
    mock.server.resetHandlers();
    quietOthers();
    keys = [];

    await user.click(within(panel).getByRole('button', { name: 'Thực thi' }));
    dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Thực thi' }));
    await waitFor(() => expect(t.status).toBe('In Progress'));
    expect(keys.length).toBe(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(await within(panel).findByText('In Progress')).toBeTruthy();
    mock.server.events.removeAllListeners();
    unmountAll();
  });

  it('chạy lại readiness (EC17)', async () => {
    quietOthers();
    const { panel, user, unmountAll } = await open(T['2.5']);
    expect(within(panel).getByText(/Dependency T-2\.3 chưa Completed/)).toBeTruthy();
    task('2.3').status = 'Completed';
    await user.click(within(panel).getByRole('button', { name: 'Chạy lại readiness' }));
    await waitFor(() => expect(within(panel).queryByText(/Dependency T-2\.3 chưa Completed/)).toBeNull());
    expect(within(panel).getByText(/^Đạt: Task tiên quyết đã Completed/)).toBeTruthy();
    // RC-07 still fails, so Execute stays off.
    expect((within(panel).getByRole('button', { name: 'Thực thi' }) as HTMLButtonElement).disabled).toBe(true);
    unmountAll();
  });

  it('gửi kết quả manual (EC19, EC37)', async () => {
    quietOthers();
    const t = task('2.4');
    const first = await open(t.id);
    await first.user.click(within(first.panel).getByRole('button', { name: 'Bắt đầu thực hiện' }));
    await first.user.click(within(screen.getByRole('dialog', { name: 'Bắt đầu thực hiện T-2.4?' })).getByRole('button', { name: 'Bắt đầu thực hiện' }));
    await waitFor(() => expect(t.status).toBe('In Progress'));
    const content = await within(first.panel).findByRole('textbox', { name: 'Nội dung' });
    await first.user.type(content, 'Năm câu hỏi và trả lời của TS. Bảo.');
    first.unmountAll();

    // The text is kept as a draft when the screen is left and opened again.
    const second = await open(t.id);
    const restored = (await within(second.panel).findByRole('textbox', { name: 'Nội dung' })) as HTMLTextAreaElement;
    expect(restored.value).toBe('Năm câu hỏi và trả lời của TS. Bảo.');
    await second.user.type(within(second.panel).getByRole('textbox', { name: 'Tiêu đề' }), 'Biên bản phỏng vấn TS. Bảo');
    await second.user.click(within(second.panel).getByRole('button', { name: 'Gửi kết quả' }));
    await waitFor(() => expect(t.status).toBe('In Review'));
    expect(await within(second.panel).findByText('In Review')).toBeTruthy();
    second.unmountAll();
  });

  it('checklist (EC20)', async () => {
    quietOthers();
    let ifMatch: string | null = null;
    mock.server.events.on('request:start', ({ request }) => {
      if (request.method === 'PATCH' && request.url.endsWith('/checklist')) ifMatch = request.headers.get('if-match');
    });
    const { panel, user, unmountAll } = await open(T['2.5']);
    const item = within(panel).getByRole('checkbox', { name: 'Chốt danh sách phương pháp' }) as HTMLInputElement;
    await user.click(item);
    await waitFor(() => expect(task('2.5').checklistState).toEqual([{ id: 'c1', checked: true }, { id: 'c2', checked: false }]));
    expect(ifMatch).toBe('"1"');
    await waitFor(() => expect((within(panel).getByRole('checkbox', { name: 'Chốt danh sách phương pháp' }) as HTMLInputElement).checked).toBe(true));
    // Changed elsewhere: 412, the panel reads the Task again and says so.
    task('2.5').rowVersion += 5;
    await user.click(within(panel).getByRole('checkbox', { name: 'Kiểm evidence của từng ô' }));
    expect(await within(panel).findByText(/Task đã đổi ở nơi khác; đã đọc lại bản mới nhất/)).toBeTruthy();
    expect(within(panel).getByRole('heading', { name: 'Checklist và acceptance criteria' })).toBeTruthy();
    expect(within(panel).getByText('Ma trận có ít nhất 3 phương pháp, mỗi ô có evidence')).toBeTruthy();
    mock.server.events.removeAllListeners();
    unmountAll();
  });

  it('needs review (EC22)', async () => {
    quietOthers();
    const t = task('3.1');
    t.needsReview = true;
    t.needsReviewReasons = [{ cause: 'Dependency T-2.5 đổi trong v4' }];
    (t as { allowedActions?: string[] }).allowedActions = ['confirm_valid', 'cancel'];
    const { panel, user, unmountAll } = await open(t.id);
    expect(within(panel).getByText('needs review')).toBeTruthy();
    expect(within(panel).getByText('Dependency T-2.5 đổi trong v4')).toBeTruthy();
    await user.click(within(panel).getByRole('button', { name: 'Xác nhận vẫn hợp lệ' }));
    await waitFor(() => expect(t.needsReview).toBe(false));
    await waitFor(() => expect(within(panel).queryByText('needs review')).toBeNull());
    unmountAll();
  });

  it('nút theo allowedActions (EC23)', async () => {
    quietOthers();
    const running = await open(T['2.2']);
    expect(within(running.panel).getByRole('button', { name: 'Hủy Task' })).toBeTruthy();
    expect(within(running.panel).queryByRole('button', { name: 'Mở lại Task' })).toBeNull();
    expect(within(running.panel).queryByRole('button', { name: 'Rút khỏi hàng đợi' })).toBeNull();
    // Cancel asks first and needs a reason.
    await running.user.click(within(running.panel).getByRole('button', { name: 'Hủy Task' }));
    const dialog = screen.getByRole('dialog', { name: 'Hủy T-2.2?' });
    expect((within(dialog).getByRole('button', { name: 'Nhập lý do' }) as HTMLButtonElement).disabled).toBe(true);
    await running.user.type(within(dialog).getByRole('textbox', { name: 'Lý do' }), 'Đổi phạm vi');
    await running.user.click(within(dialog).getByRole('button', { name: 'Hủy Task' }));
    await waitFor(() => expect(task('2.2').status).toBe('Cancelled'));
    running.unmountAll();

    const done = await open(T['1.1']);
    expect(within(done.panel).getByRole('button', { name: 'Mở lại Task' })).toBeTruthy();
    expect(within(done.panel).queryByRole('button', { name: 'Hủy Task' })).toBeNull();
    done.unmountAll();
  });

  it('project archived (EC40)', async () => {
    quietOthers();
    mock.use({
      overrides: {
        getProject: ({ generated }) => {
          const body = generated(200) as Record<string, unknown>;
          return { status: 200, body: { ...body, id: PROJECT_ID, status: 'Archived' } as never };
        },
      },
    });
    const t = readyAgentTask();
    const { panel, unmountAll } = await open(t.id);
    expect(await within(panel).findByText('Project đã Archived: chỉ xem, không thay đổi được.')).toBeTruthy();
    expect((within(panel).getByRole('button', { name: 'Thực thi' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(panel).getByRole('button', { name: 'Hủy Task' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(panel).getByRole('button', { name: 'Chạy lại readiness' }) as HTMLButtonElement).disabled).toBe(true);
    unmountAll();
  });
});
