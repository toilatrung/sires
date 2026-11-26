// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import { composerFeature } from './test/features';
import { renderShell, waitForFrame } from './test/render';

const banner = () => screen.getByRole('banner');

describe('đổi ngôn ngữ', () => {
  it('đổi ngôn ngữ giữ trạng thái (PID-00012-AC01, UX-I18N-002-AC01, EC03)', async () => {
    const { user, router } = renderShell({ path: '/dashboard', features: [composerFeature] });
    await waitForFrame();
    const input = await screen.findByLabelText('Câu hỏi');
    await user.type(input, 'câu hỏi đang gõ');
    await user.click(within(banner()).getByRole('button', { name: 'Trợ lý' }));
    expect(screen.getByRole('complementary', { name: 'Trợ lý' })).toBeTruthy();
    expect(within(banner()).getByRole('button', { name: /Chuyển ngữ cảnh/ }).textContent).toContain('Ngữ cảnh');
    expect(screen.getByRole('status').textContent).toBe('Đang tải Trusted Library…');

    await user.click(within(banner()).getByRole('button', { name: 'EN' }));

    // Every shell label switches at once…
    expect(i18next.language).toBe('en');
    expect(within(banner()).getByRole('button', { name: /Switch context/ }).textContent).toContain('Context');
    expect(within(banner()).getByRole('button', { name: 'Assistant' })).toBeTruthy();
    expect(within(banner()).getByRole('group', { name: 'Interface language' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Assistant' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Loading Trusted Library…');
    // …area names and fixed terms stay in English (EC05)…
    const tabs = within(screen.getByRole('navigation', { name: 'Global areas' }));
    expect(tabs.getByRole('link', { name: 'Dashboard' })).toBeTruthy();
    expect(tabs.getByRole('link', { name: 'Trusted Library' })).toBeTruthy();
    expect(within(banner()).getByRole('link', { name: /Pending Actions/ })).toBeTruthy();
    // …and the typed text, the route and the open panel are untouched (no remount).
    expect(screen.getByLabelText('Câu hỏi')).toBe(input);
    expect((input as HTMLTextAreaElement).value).toBe('câu hỏi đang gõ');
    expect(router.state.location.pathname).toBe('/dashboard');
    expect(within(banner()).getByRole('button', { name: 'EN' }).getAttribute('aria-pressed')).toBe('true');

    await user.click(within(banner()).getByRole('button', { name: 'VI' }));
    expect(i18next.language).toBe('vi');
    expect(within(banner()).getByRole('button', { name: 'Trợ lý' })).toBeTruthy();
    expect((screen.getByLabelText('Câu hỏi') as HTMLTextAreaElement).value).toBe('câu hỏi đang gõ');
  });

  it('nhãn ProjectRail đổi theo ngôn ngữ, tên khu vực giữ tiếng Anh (PID-00012-AC01, S03)', async () => {
    const { user } = renderShell({ path: '/projects/p1/chat', features: [composerFeature] });
    await waitForFrame();
    await user.type(await screen.findByLabelText('Câu hỏi'), 'câu hỏi');
    const rail = await screen.findByRole('complementary', { name: 'Khu vực Project' });
    await waitFor(() => expect(within(rail).getByRole('button', { name: 'Bỏ active task' })).toBeTruthy());
    expect(within(rail).getByText('Active task')).toBeTruthy();

    await user.click(within(banner()).getByRole('button', { name: 'EN' }));

    const railEn = screen.getByRole('complementary', { name: 'Project areas' });
    expect(within(railEn).getByRole('button', { name: 'Clear active task' })).toBeTruthy();
    expect(within(railEn).getByRole('link', { name: /Project AI Chat/ })).toBeTruthy();
    expect(within(railEn).getByRole('link', { name: /Plan and Tasks/ })).toBeTruthy();
    expect(within(railEn).getByText('2').getAttribute('aria-label')).toBe('2 waiting for you');
    expect(within(banner()).getByRole('navigation', { name: 'Location' }).textContent).toContain('Global/Project AI Chat');
    expect((screen.getByLabelText('Câu hỏi') as HTMLTextAreaElement).value).toBe('câu hỏi');
  });
});
