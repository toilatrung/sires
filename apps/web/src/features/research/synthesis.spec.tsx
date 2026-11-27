// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00114 O7: claims at their sentence in a synthesis version (S07, H11), located by ArtifactVersion.claimAnchors.

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { anchorOf } from './__mocks__/data';
import { artifactPath, ids, PROJECT_ID, renderResearch, useResearchMock } from './test/render';

const UNSUPPORTED = 'RAG giảm một nửa hallucination ở mọi miền.';
const synthesis = () => document.querySelector('.research-synthesis') as HTMLElement;
const anchorsAfter = (sentence: string) => {
  const paragraph = [...synthesis().querySelectorAll('p')].find((p) => p.textContent?.includes(sentence))!;
  const text = [...paragraph.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.endsWith(sentence))!;
  return { paragraph, text, anchors: text.nextSibling as HTMLElement };
};

describe('Bản tổng hợp (S07)', () => {
  const research = useResearchMock();

  it('Unsupported tại câu', async () => {
    research.store();
    await renderResearch(artifactPath(ids.artifact.synthesis));
    await screen.findByRole('heading', { level: 2, name: 'Định nghĩa hallucination' });
    await waitFor(() => expect(synthesis().querySelectorAll('.research-anchors')).toHaveLength(3));
    const { paragraph, text, anchors } = anchorsAfter(UNSUPPORTED);
    // Right after the sentence, in the same paragraph, before the next sentence.
    expect(anchors.classList.contains('research-anchors')).toBe(true);
    expect(anchors.parentElement).toBe(paragraph);
    expect((anchors.nextSibling as Text).textContent!.startsWith(' Nhận định đó cần được kiểm chứng thêm')).toBe(true);
    expect(text.textContent!.endsWith(UNSUPPORTED)).toBe(true);
    const chip = within(anchors).getByText('Unsupported');
    expect(chip.classList.contains('sires-chip')).toBe(true);
    expect(chip.getAttribute('data-tone')).toBe('warning-flag');
    expect(within(anchors).getByRole('link').getAttribute('href')).toBe(`/projects/${PROJECT_ID}/claims/${ids.claim.unsupported}`);
    // An Accepted claim shows its approval chip next to its support chip.
    const definition = anchorsAfter('Hallucination là nội dung không trung thành với nguồn hoặc không có căn cứ.').anchors;
    expect(within(definition).getByText('Supported').getAttribute('data-tone')).toBe('confirmed-brand');
    expect(within(definition).getByText('Accepted')).toBeTruthy();
    // Table of the claims of the synthesis, under the content.
    const table = within(screen.getByRole('region', { name: 'Claim của bản tổng hợp (4)' })).getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(5);
    expect(within(table).getByRole('link', { name: UNSUPPORTED })).toBeTruthy();
  });

  it('claim chưa định vị', async () => {
    const store = research.store();
    const version = store.versions.find((row) => row.id === ids.version.synthesisV2)!;
    // An anchor outside the content counts as no place in the text (EC38).
    Object.assign(version, { claimAnchors: version.claimAnchors!.map((anchor) => (anchor.claimId === ids.claim.intrinsic
      ? { ...anchor, charStart: version.content!.length + 2, charEnd: version.content!.length + 20 } : anchor)) });
    await renderResearch(artifactPath(ids.artifact.synthesis));
    const group = await screen.findByRole('region', { name: 'Claim chưa định vị trong văn bản' });
    const items = within(group).getAllByRole('listitem');
    expect(items.map((item) => item.firstChild?.textContent)).toEqual([
      'Intrinsic và extrinsic hallucination cần thước đo khác nhau.',
      'Hallucination thường gặp hơn ở câu hỏi về thực thể ít phổ biến.',
    ]);
    expect(within(items[1]!).getByText('Partially Supported').classList.contains('sires-chip')).toBe(true);
    expect(within(items[1]!).getByText('Accepted')).toBeTruthy();
    expect(synthesis().querySelectorAll('.research-anchors')).toHaveLength(2);
  });

  it('nhiều claim cùng vị trí', async () => {
    const store = research.store();
    const version = store.versions.find((row) => row.id === ids.version.synthesisV2)!;
    // One sentence carries two claims: their chips sit side by side, in the order of claimAnchors (EC39).
    Object.assign(version, { claimAnchors: [
      anchorOf(version.content!, ids.claim.definition, 'Hallucination là nội dung không trung thành với nguồn hoặc không có căn cứ.'),
      anchorOf(version.content!, ids.claim.unsupported, UNSUPPORTED),
      anchorOf(version.content!, ids.claim.intrinsic, UNSUPPORTED),
    ] });
    await renderResearch(artifactPath(ids.artifact.synthesis));
    await screen.findByRole('heading', { level: 2, name: 'Định nghĩa hallucination' });
    await waitFor(() => expect(synthesis().querySelectorAll('.research-anchors')).toHaveLength(2));
    const { anchors } = anchorsAfter(UNSUPPORTED);
    expect([...anchors.querySelectorAll('[data-claim]')].map((node) => node.getAttribute('data-claim'))).toEqual([ids.claim.unsupported, ids.claim.intrinsic]);
    expect([...anchors.querySelectorAll('.sires-chip')].map((node) => node.textContent)).toEqual(['Unsupported', 'Partially Supported', 'Accepted']);
  });
});
