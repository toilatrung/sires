// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00060 S05: MobilePending and MobilePrompt at phone width, with the shell's prompt card (H2, H3, H9). jsdom has
// no layout, so “no horizontal scroll” is checked on the markup here and by hand on the preview (EC22).

import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { feature } from '.';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { LEARNING_ID, RAG_ID, promptId } from './__mocks__/fixtures-for-test';
import { phoneWidth, renderGlobal } from './__mocks__/render';
import { resetGlobalStore } from './__mocks__/store';

const mock = useMockServer({ features: [feature] });
const main = () => within(screen.getByRole('main'));
let restore: () => void = () => undefined;

beforeEach(() => {
  resetGlobalStore();
  restore = phoneWidth(390);
});
afterEach(() => restore());

describe('MobilePending, MobilePrompt (S05)', () => {
  it('390 px trả lời prompt (PID-00060-AC02)', async () => {
    const { user, router } = renderGlobal('/pending-actions');
    await waitForFrame();
    // Phone list: the prompt opens MobilePrompt, not the desktop deepLink (H3).
    await user.click(await main().findByRole('link', { name: /Chọn tiêu chí so sánh cho bảng phương pháp/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/pending-actions/prompts/${promptId(1)}`));
    expect(await main().findByText('Ứng dụng RAG trong tổng quan tài liệu y sinh')).toBeTruthy();
    expect(main().getByText('Bảng so sánh nên dùng tiêu chí nào làm cột chính?')).toBeTruthy();
    // Every choice with its consequence, none chosen in advance.
    const radios = main().getAllByRole('radio') as HTMLInputElement[];
    expect(radios.length).toBe(3);
    expect(radios.every((radio) => !radio.checked)).toBe(true);
    expect(main().getByText('So sánh theo số liệu định lượng của 5 khung.')).toBeTruthy();
    await user.click(main().getByRole('radio', { name: /Độ chính xác trích dẫn/ }));
    await user.click(main().getByRole('button', { name: 'Xác nhận' }));
    expect(await main().findByText('Đã gửi câu trả lời. Workflow tiếp tục nếu đang chờ.')).toBeTruthy();
    expect(main().queryAllByRole('radio').every((radio) => (radio as HTMLInputElement).disabled)).toBe(true);
  });

  it('375 px trả lời prompt approval (UX-RESP-001-AC01)', async () => {
    restore();
    restore = phoneWidth(375);
    const bodies: unknown[] = [];
    mock.use({
      overrides: {
        answerPrompt: ({ body, params, fixtures, generated }) => {
          bodies.push(body);
          const prompt = fixtures.InteractiveAgentPrompt?.find((row) => row.id === params.promptId);
          return { status: 200, body: { ...(prompt ?? generated(200)), status: 'Answered', response: { ...body } } };
        },
      },
    });
    const { user } = renderGlobal(`/pending-actions/prompts/${promptId(2)}`);
    await waitForFrame();
    expect(await main().findByText('Approve the extracted effect sizes for 9 studies?')).toBeTruthy();
    expect(await main().findByText('Measuring learning outcomes in blended classrooms')).toBeTruthy();
    await user.click(main().getByRole('button', { name: 'Duyệt' }));
    await waitFor(() => expect(bodies.length).toBe(1));
    expect(bodies[0]).toMatchObject({ decision: 'approved' });
  });

  it('prompt hết hiệu lực chỉ đọc (EC19)', async () => {
    renderGlobal(`/pending-actions/prompts/${promptId(7)}`);
    await waitForFrame();
    expect(await main().findByText(/Không được tính là đồng ý/)).toBeTruthy();
    expect(main().queryByRole('button', { name: 'Xác nhận' })).toBeNull();
  });

  it('trả lời bị 409 (EC20)', async () => {
    let answered = false;
    mock.use({
      overrides: {
        answerPrompt: () => {
          answered = true;
          return { status: 409 };
        },
      },
    });
    const { user } = renderGlobal(`/pending-actions/prompts/${promptId(1)}`);
    await waitForFrame();
    await user.click(await main().findByRole('radio', { name: /Độ phủ nguồn/ }));
    await user.click(main().getByRole('button', { name: 'Xác nhận' }));
    expect(await main().findByText(/đã được trả lời ở nơi khác hoặc đã bị hủy/)).toBeTruthy();
    expect(answered).toBe(true);
    expect(main().queryByRole('alert')).toBeNull();
  });

  it('edit_and_approve chỉ đọc (EC21)', async () => {
    renderGlobal(`/pending-actions/prompts/${promptId(5)}`);
    await waitForFrame();
    expect(await main().findByText('Duyệt đoạn mở đầu mục 2.3 trước khi đưa vào bản thảo?')).toBeTruthy();
    expect(main().getByText(/Trên điện thoại chỉ xem được/)).toBeTruthy();
    expect(main().getByRole('link', { name: 'Mở Project AI Chat' }).getAttribute('href')).toBe(`/projects/${RAG_ID}/chat`);
    expect(main().queryByRole('button', { name: 'Sửa và duyệt' })).toBeNull();
  });

  it('information_request trả lời bằng chữ (H9)', async () => {
    const bodies: unknown[] = [];
    mock.use({
      overrides: {
        answerPrompt: ({ body, generated }) => {
          bodies.push(body);
          return { status: 200, body: { ...generated(200), projectId: LEARNING_ID, status: 'Answered' } };
        },
      },
    });
    const { user } = renderGlobal(`/pending-actions/prompts/${promptId(6)}`);
    await waitForFrame();
    await user.type(await main().findByLabelText('Câu trả lời'), '2019–2026');
    await user.click(main().getByRole('button', { name: 'Gửi câu trả lời' }));
    await waitFor(() => expect(bodies).toEqual([expect.objectContaining({ text: '2019–2026' })]));
  });

  it('không có độ rộng cố định (EC22)', async () => {
    renderGlobal(`/pending-actions/prompts/${promptId(1)}`);
    await waitForFrame();
    await main().findByText('Bảng so sánh nên dùng tiêu chí nào làm cột chính?');
    const fixed = [...screen.getByRole('main').querySelectorAll<HTMLElement>('[style]')].filter((el) => /width:\s*\d+px/.test(el.getAttribute('style') ?? ''));
    expect(fixed).toEqual([]);
    // The phone frame of the shell is shown (bottom tab bar).
    expect(screen.getByRole('navigation', { name: /tab|Điều hướng|Tab/i })).toBeTruthy();
  });

  it('không tìm thấy (EC23)', async () => {
    renderGlobal('/pending-actions/prompts/6a000000-0000-4000-8000-000000000999');
    await waitForFrame();
    expect(await main().findByText(/Không tìm thấy/)).toBeTruthy();
  });

  it('không gửi trùng (EC24)', async () => {
    const calls: unknown[] = [];
    mock.use({
      overrides: {
        answerPrompt: ({ fixtures, params, generated, body }) => {
          calls.push(body);
          const prompt = fixtures.InteractiveAgentPrompt?.find((row) => row.id === params.promptId);
          return { status: 200, body: { ...(prompt ?? generated(200)), status: 'Answered' }, delayMs: 200 };
        },
      },
    });
    const { user } = renderGlobal(`/pending-actions/prompts/${promptId(1)}`);
    await waitForFrame();
    await user.click(await main().findByRole('radio', { name: /Chi phí kiểm chứng/ }));
    const confirm = main().getByRole('button', { name: 'Xác nhận' });
    await user.dblClick(confirm);
    await waitFor(() => expect(calls.length).toBe(1));
  });
});
