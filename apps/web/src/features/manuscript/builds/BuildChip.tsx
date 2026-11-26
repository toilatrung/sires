// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Build chip of the toolbar (PID-00115 S08, H15): the shell's chip for the latest build, with the words of
// Manuscript.html — “Build OK · 09:41”, “Đang build · 00:12” (ticking), “Queued · 00:04”, “Build lỗi · 08:52”.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatElapsed, formatTime, StatusChip } from '../../../shell';
import type { Build } from '../model';
import { useBuilds } from '../state';

/** Seconds since `from`, ticking every second while `active`. */
export function useElapsed(from: string | undefined, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, from]);
  return from ? Math.max(0, (now - new Date(from).getTime()) / 1000) : 0;
}

export const isBuilding = (build: Build | undefined) => build?.status === 'Queued' || build?.status === 'Running';

/** When a build finished (or the best time it has), for “· 08:52”. */
export const buildTime = (build: Build) => build.endedAt ?? build.startedAt ?? build.queuedAt;

export function BuildChip() {
  const { t } = useTranslation('manuscript');
  const { latest } = useBuilds();
  const running = isBuilding(latest);
  const elapsed = useElapsed(latest?.status === 'Running' ? latest.startedAt ?? latest.queuedAt : latest?.queuedAt, running);
  if (!latest) return <span className="sires-status-text">{t('build.chip.none')}</span>;
  const text =
    latest.status === 'Succeeded'
      ? t('build.chip.ok', { time: formatTime(buildTime(latest)) })
      : latest.status === 'Failed'
        ? t('build.chip.failed', { time: formatTime(buildTime(latest)) })
        : latest.status === 'Running'
          ? t('build.chip.running', { elapsed: formatElapsed(elapsed) })
          : t('build.chip.queued', { elapsed: formatElapsed(elapsed) });
  return (
    <span className="ms-build-chip" title={latest.revisionNumber !== undefined ? t('build.chip.revision', { n: latest.revisionNumber }) : undefined}>
      <StatusChip status={latest.status} entity="build">
        <span className="sires-num">{text}</span>
      </StatusChip>
    </span>
  );
}
