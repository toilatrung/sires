// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00082 S07: Tasks of every Active project, read only, on the planning mock (RAG project from the planning
// store, the “learning” project from the shared demo data).

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { demoFixtures, projectIds } from '../../shell/mock';
import { PROJECT_ID, renderPlanning, T, textOf, usePlanningMock } from './testing';

describe('Tasks của mọi project (PID-00082 S07)', () => {
  const mock = usePlanningMock();

  it('chỉ đọc mọi project (EC35)', async () => {
    const projects = (demoFixtures.ResearchProject ?? []).filter((p) => p.id === projectIds.rag || p.id === projectIds.learning).map((p) => ({ ...p, status: 'Active' as const }));
    let queried: string | null = null;
    mock.use({
      overrides: {
        listProjects: ({ request }) => {
          queried = new URL(request.url).searchParams.get('status');
          return { status: 200, body: { items: projects, nextCursor: null } };
        },
      },
    });
    const writes: string[] = [];
    mock.server.events.on('request:start', ({ request }) => {
      if (request.method !== 'GET') writes.push(request.url);
    });
    const { user, unmountAll } = renderPlanning('/tasks');
    expect(await screen.findByRole('heading', { level: 1, name: 'Tasks & Plan' })).toBeTruthy();
    expect(screen.getByText(/Tổng hợp chỉ đọc từ mọi project/)).toBeTruthy();
    const blocked = await screen.findByRole('region', { name: /^Blocked/ });
    expect(textOf(blocked.querySelector('h2'))).toBe('Blocked 2 Task');
    const t25 = within(blocked).getByRole('link', { name: /^T-2\.5 / });
    expect(t25.getAttribute('href')).toBe(`/projects/${PROJECT_ID}/plan?task=${T['2.5']}`);
    expect(textOf(t25)).toContain('Dependency T-2.3 chưa Completed');
    expect(textOf(t25)).toContain('Available for agent');
    expect(queried).toBe('Active');
    // Both projects are there; a row of the other project opens in its own project.
    const learning = projects.find((p) => p.id === projectIds.learning)!;
    await waitFor(() => expect(screen.getAllByText(learning.name).length).toBeGreaterThan(0));
    expect((screen.getByRole('combobox', { name: 'Project' }) as HTMLSelectElement).options[0]!.textContent).toBe('Tất cả · 2');
    // Filter one project, then a label.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Project' }), learning.id);
    await waitFor(() => expect(screen.queryByRole('link', { name: /^T-2\.5 / })).toBeNull());
    expect(screen.getAllByRole('link').filter((a) => a.classList.contains('planning-global-row')).every((a) => a.getAttribute('href')!.startsWith(`/projects/${learning.id}/`))).toBe(true);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Project' }), '');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Execution label' }), 'Manual editor requirement');
    await waitFor(() =>
      expect(screen.getAllByRole('link').filter((a) => a.classList.contains('planning-global-row')).map((a) => a.querySelector('.sires-id')?.textContent).sort()).toEqual(['T-2.4', 'T-2.7']),
    );
    // Read only: no command on the page, nothing written.
    const main = screen.getByRole('main');
    expect(within(main).queryAllByRole('button')).toEqual([]);
    expect(writes).toEqual([]);
    mock.server.events.removeAllListeners();
    unmountAll();
  });
});
