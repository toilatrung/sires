# web

Luồng `web` (TypeScript, React 18 + Vite). Kế hoạch: [docs/tickets 3.2](../../docs/tickets/sections/03-track-plans.html#s-3-2). Chỉ gọi `gateway` (proxy `/api`, `/auth`, `/events` khi chạy cục bộ).

## Khu vực

| Khu vực | Thư mục | Màn |
| --- | --- | --- |
| shell | `src/shell` | Khung, routing, i18n chung, token, client API, SSE |
| settings | `src/features/settings` | `/sign-in`, `/settings/profile`, `/settings/providers`, `/settings/agents`, `/settings/preferences` |
| global | `src/features/global` | `/dashboard`, `/projects`, `/pending-actions`, `/notifications` |
| library | `src/features/library` | `/discover`, `/library`, `/library/:referenceId` |
| project | `src/features/project` | `/projects/:projectId/overview`, `/projects/:projectId/chat` |
| planning | `src/features/planning` | `/tasks`, `/projects/:projectId/plan`, `/projects/:projectId/plan/versions/:versionId`, `/projects/:projectId/tasks/:taskId` |
| research | `src/features/research` | `/projects/:projectId/evidence`, `/projects/:projectId/evidence/claims/:claimId`, `/projects/:projectId/artifacts`, `/projects/:projectId/artifacts/:artifactId` |
| manuscript | `src/features/manuscript` | `/projects/:projectId/manuscript/*` |
| monitoring | `src/features/monitoring` | `/activity`, `/projects/:projectId/activity`, `/projects/:projectId/activity/workflows/:workflowId`, `/projects/:projectId/history` |

Mỗi khu vực giữ route và namespace i18n (`i18n/vi.json`, `i18n/en.json`) của mình; shell chỉ ghép qua `src/shell/features.ts` (quy tắc 1.4.9, [docs/tickets 1.5](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-5)). Thiết kế theo `docs/ui-design/design.md`; dựng bằng skill `sires-ui-executor`, rà bằng `sires-ui-review`. Màn hiện là placeholder.

## Chạy

```bash
pnpm --filter @sires/web dev
```

Mở http://localhost:5173.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
