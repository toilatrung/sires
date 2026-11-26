// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00115 S09: the phone screen reviews Change Proposals only (H21, UX-RESP-001). Names follow specs/scope.html.

import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { feature } from '.';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { proposalId, RAG } from './__mocks__/fixtures';
import { otherAreas, projectPath, renderManuscript, viewport } from './__mocks__/render';
import { resetManuscriptStore, testStore } from './__mocks__/store';

const mock = useMockServer({ features: [feature] });
let restore: () => void = () => undefined;

beforeEach(() => {
  resetManuscriptStore();
  mock.use({ overrides: otherAreas() });
  restore = viewport(390);
});
afterEach(() => restore());

const cards = () => screen.queryAllByRole('region', { name: /^Change Proposal · / });

describe('Màn điện thoại (S09)', () => {
  it('390 px duyệt proposal (EC53)', async () => {
    const { user } = renderManuscript(projectPath());
    await waitForFrame();
    expect(await screen.findByRole('heading', { level: 1, name: 'Bản thảo' })).toBeTruthy();
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(screen.getByText('Change Proposal chờ bạn: 3')).toBeTruthy();
    // Proposed first, then Outdated; no editor, no file tree.
    expect(cards().map((card) => card.getAttribute('aria-label'))).toEqual(['Change Proposal · Proposed', 'Change Proposal · Proposed', 'Change Proposal · Outdated']);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
    // Every file of a proposal is open (diff wrapped), with one decision for the whole proposal.
    const first = cards().find((card) => card.textContent?.includes('Citation: 2/2 phân giải'))!;
    expect(within(first).getByRole('group', { name: 'Thay đổi ở sections/intro.tex' }).textContent).toContain('Retrieval restricted to vetted sources');
    expect(within(first).getByRole('group', { name: 'Thay đổi ở sections/method.tex' }).textContent).toContain('Scores are averaged over three annotators');
    expect(within(first).queryByRole('button', { name: 'Xem diff' })).toBeNull();
    expect(within(cards().at(-1)!).getByRole('button', { name: 'Yêu cầu tạo lại' })).toBeTruthy();
    await user.click(within(first).getByRole('button', { name: 'Chấp nhận cả proposal' }));
    expect(await within(first).findByText('Đã chấp nhận cả proposal: revision 19.')).toBeTruthy();
    // The other Proposed one touched method.tex too: it is now Outdated.
    await waitFor(() => expect(screen.getByText('Change Proposal chờ bạn: 2')).toBeTruthy());
    expect(testStore().projects.get(RAG)!.proposals.find((row) => row.id === proposalId(1))!.status).toBe('Accepted');
  });

  it('trống (EC54)', async () => {
    for (const proposal of testStore().projects.get(RAG)!.proposals) if (proposal.status !== 'Accepted') proposal.status = 'Rejected';
    renderManuscript(projectPath());
    await waitForFrame();
    expect(await screen.findByText('Không có proposal chờ bạn')).toBeTruthy();
    expect(screen.getByText(/Soạn và sửa bản thảo dùng máy tính hoặc tablet/)).toBeTruthy();
    expect(cards()).toHaveLength(0);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
