# PID-00013 — QC chéo PR #131 (spec-converge-skill, chế độ QC độc lập)

**Kết luận:** ĐẠT — không có CRITICAL, HIGH, MEDIUM; 4 khoảng trống LOW, không chặn merge.

- **PR:** [#131](https://github.com/toilatrung/sires/pull/131), nhánh `web/mock-pid-00013-v3`, head **`0b06a0a9e391e216ad2c5f62d9485f1651fd0b70`**, base `main`.
- **Người QC:** phiên infra do PO `toilatrung` giao (QC chéo theo yêu cầu của phiên điều phối), 27/11/2026. Không mang kết luận của Dev: tự đọc mã, tự chạy lệnh.
- **Hồ sơ đối chiếu:** `docs/tickets/issues/PID-00013/` tại head (bản của #120 sửa 1 dòng `index.html`): AC01, P1–P4, N1–N7, EC01–EC13, O1–O2, B1–B6.
- **Phạm vi mã QC:** mã của PID-00013, gồm `apps/web/src/shell/mock/**` cùng phần nối bên ngoài: `apps/web/src/mocks/index.ts`, `src/shell/feature.ts`, `vite.config.ts`, `package.json`, `README.md`, `pnpm-lock.yaml`. Mã shell (#138) và tài liệu (#120) được merge vào nhánh này nhưng không QC ở đây.

## Lệnh đã chạy (worktree tách tại `0b06a0a`)

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (postinstall sinh mock) |
| `NX_DAEMON=false pnpm nx run-many -t lint typecheck test build -p @sires/web --skip-nx-cache` | Đạt; test 20 file, **138/138** |
| Tìm `msw`, `mockServiceWorker`, `startMockWorker`, `x-sires-mock` trong `apps/web/dist` sau build | Không có (EC07) |
| `node agent/skills/qc/sires-ui-review/scripts/check-ui.mjs apps/web/src` | 0 lỗi, 9 cảnh báo (đều ở `shell/styles/tokens.css` của #138, không thuộc PID-00013) |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu |
| `check-tracks.mjs` so với `origin/main` | `contracts-spec, docs, repo, web/shell`: cảnh báo 2 luồng, do #120 (docs) được merge vào nhánh; commit của PID-00013 chỉ chạm `web/shell` và `repo` (lockfile) |
| `check-pid.mjs PID-00013 --result` | KẾT QUẢ ĐỦ (0 cảnh báo) |
| `pnpm --dir apps/web run dev:mock --port 5183` (preview) | `mocks: 165 operations`; trình duyệt: `[SIRes mock] 167 handlers`. Đã kiểm: `getSession` (có `csrfToken`), `getMe`, `pending-actions` (`openCount` 4), `notifications` (`unreadCount` 3), `projects` (4 project, tên Việt và Anh). Shell hiện Pending Actions 4, chuông 3, avatar có tên. Console không có lỗi |
| `/events` trong dev:mock | Trả 200 `text/event-stream`; `siresMock.events.emit({ type: 'notification.created', … })` từ console → EventSource nhận bản ghi có `id` (`2`) và `Event` đủ `type, objectType, objectId, id, at` |
| CI của #131 ở `0b06a0a` | 25/25 check xanh (gồm `contracts`, `build`) |

## AC

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00013-AC01 | `mock.spec.ts › đổi schema thì typecheck báo lệch` | **ĐẠT**. Đọc test: sinh type (`openapi-typescript`), mock và override từ bản OpenAPI mẫu thì typecheck sạch. Đổi `Note.title` thành `heading`, sinh lại thì mock có `heading`, không còn `title`. Typecheck chỉ báo lỗi ở đúng dòng `note.title` của override, thông điệp nêu `'title'` |

## Phạm vi, Đầu ra, Edge case

| Mục | Kết quả | Bằng chứng |
| --- | --- | --- |
| P1 bộ sinh từ OpenAPI công khai, có type, lỗi đã khai | ĐẠT | `generator/openapi.mjs` đọc `docs/api-design/dist/openapi.bundled.yaml`, cùng file `libs/ts/contracts/scripts/generate.mjs:182` dùng (EC13); `generate.mjs` |
| P2 bật mock (mặc định tắt), ghép khu vực, build không có mock, phiên mẫu | ĐẠT | `src/mocks/index.ts`: chỉ khi `DEV` và (`--mode mock` hoặc `VITE_SIRES_MOCK=1`); `build.spec.ts` (NODE_ENV production, development); dist không có mock |
| P3 `/events` có id, nối lại theo `Last-Event-ID` | ĐẠT | `events.spec.ts › nối lại`, `› chat.delta không có id`, client SSE của shell trên mock; thử tay ở dev |
| P4 kiểm lệch, README cho khu vực | ĐẠT | AC01; `shell/mock/README.md` (bật, override có type, `__mocks__`, `/events`, trùng operation) |
| O1 `apps/web/src/shell/mock/`, O2 `mock.spec.ts` | ĐẠT | Đúng đường dẫn; điểm nối `src/mocks/index.ts` ngoài O1 (G3) |
| EC01–EC05, EC08–EC10, EC12 | ĐẠT | `mock.spec.ts` có test đúng tên theo `scope.html`; chạy đạt |
| EC06 dev không cờ thì không bật mock | ĐẠT (đọc mã) | Điều kiện trong `src/mocks/index.ts`; không chạy `pnpm dev` thường |
| EC07 build không có mock | ĐẠT | `build.spec.ts` và tìm trong dist |
| EC11 nối lại, `chat.delta` | ĐẠT | `events.spec.ts` |
| EC13 cùng bundle với contracts | ĐẠT | `mock.spec.ts › bộ sinh đọc đúng file bundle của @sires/contracts` |

## Khoảng trống

| G | Loại | Mức | Mô tả | Đề xuất |
| --- | --- | --- | --- | --- |
| G1 | partial (thứ tự merge) | LOW | Nhánh đã merge #120 (docs, base `main`, chưa merge) và #138 (shell, chưa merge). Diff của #131 so với `main` vì thế gồm cả `docs/api-design`, `docs/ui-design/pages` (67 file sinh), hồ sơ ticket và mã shell. Merge #131 trước thì các thay đổi đó vào `main` mà chưa qua review của chính PR đó | Merge theo thứ tự #120 → #138 → #131. Report đã ghi “xếp chồng trên #120”, nên thêm #138 |
| G2 | unrequested (đã có biên bản) | LOW | Mock `/events` gửi `replay.unavailable` (bỏ N7). Báo cáo ghi YC3 có ủy quyền (PC-05 P2), nhưng `index.html` của hồ sơ (bản #120) vẫn ghi “Mock của PID này vẫn không giả lập tín hiệu (N7)… chưa PID nào nhận việc” | PO sửa hồ sơ PID-00013 (N7 và mục “Giả lập tín hiệu SSE”) cho khớp YC3 |
| G3 | partial (Đầu ra) | LOW | `apps/web/src/mocks/index.ts` (16 dòng) nằm ngoài O1. File này là điểm nối mà `main.tsx` của shell (#138) quy định; logic mock vẫn ở `shell/mock` | Chấp nhận; hồ sơ có thể ghi thêm đường dẫn điểm nối |
| G4 | unrequested (đã có biên bản) | LOW | YC1 mở rộng dữ liệu demo theo khu vực (`fixtures/*`) | Đã có biên bản YC1 với ủy quyền; không làm thay mock riêng của khu vực (N1). Ghi nhận |

Không có lỗi về nguyên tắc: không gọi model, không lộ secret, không import service khác. PID-00013 không sửa file trong `docs/`; thay đổi `docs/` trong diff đến từ #120. `postinstall` tự bỏ qua khi không có bundle (`generate.mjs:243`), nên image dựng không có `docs/` (ví dụ `oidc-mock` của #130) không bị ảnh hưởng.

**Bước tiếp theo:** PO merge theo thứ tự ở G1; PO sửa hồ sơ theo G2 (và tùy chọn G3).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
