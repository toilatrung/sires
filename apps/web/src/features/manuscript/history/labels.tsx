// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Labels of a revision in the history (PID-00115 S07, H14): “r18 · Nguyễn Thanh · 09:41” and its source
// (“Sửa trực tiếp · method.tex”, “Proposal đã chấp nhận · T-2.1”, “Khởi tạo Default”). Task keys come from the
// planning area (getTask) and are cached for the screen.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatShortDate, formatTime, useApi } from '../../../shell';
import { baseName, type Revision } from '../model';

/** Today → “09:41”; another day → “30/10 17:02” (times are not mono, design.md §8). */
export function revisionTime(at: string): string {
  const date = new Date(at);
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return sameDay ? formatTime(at) : `${formatShortDate(at)} ${formatTime(at)}`;
}

/** Source of a revision as one line; `taskKey` is the stable key of its Task when known. */
export function useSourceLabel(): (revision: Revision, taskKey?: string) => string {
  const { t } = useTranslation('manuscript');
  return useCallback((revision: Revision, taskKey?: string) => {
    if (revision.source === 'init') return [t('history.source.init'), revision.message].filter(Boolean).join(' ');
    if (revision.source === 'change_proposal') return [t('history.source.change_proposal'), taskKey].filter(Boolean).join(' · ');
    const names = [...new Set(revision.changes.map((change) => baseName(change.newPath ?? change.path)))];
    return [t('history.source.direct_edit'), names.join(', ')].filter(Boolean).join(' · ');
  }, [t]);
}

/** Stable keys of Tasks by id (getTask of the planning area), fetched once per id; unknown ids stay absent. */
export function useTaskKeys(projectId: string, taskIds: readonly (string | undefined)[]): Map<string, string> {
  const api = useApi();
  const [keys, setKeys] = useState<Map<string, string>>(new Map());
  const asked = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const wanted = [...new Set(taskIds.filter((value): value is string => Boolean(value)))].join(',');

  useEffect(() => {
    for (const taskId of wanted ? wanted.split(',') : []) {
      if (asked.current.has(taskId)) continue;
      asked.current.add(taskId);
      api.get('/projects/{projectId}/tasks/{taskId}', { path: { projectId, taskId } })
        .then(({ data }) => {
          if (mounted.current && data.stableKey) setKeys((current) => new Map(current).set(taskId, data.stableKey));
        })
        .catch(() => {
          // Without the key the label reads “Proposal đã chấp nhận”; the Task link still works from the detail.
          asked.current.delete(taskId);
        });
    }
  }, [api, projectId, wanted]);

  return keys;
}
