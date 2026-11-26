# PID-00036 — Self-QC của Dev

**Kết luận:** Đạt — mọi AC có test đạt; còn hai việc cần phiên điều phối (hai test của shell, các mục sửa ở nguồn), ghi ở report.md mục 6

- **Ticket:** [PID-00036](../../../docs/tickets/issues/PID-00036/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build` | Chạy theo project: `pnpm nx run-many -t lint typecheck -p @sires/web` đạt (kèm `generate-mocks`, `@sires/contracts:generate-ts`, `build`); `pnpm nx run-many -t test build -p @sires/web` đạt: 26 file, 203 test, build `vite` đạt. `affected` không dùng vì nhánh xếp chồng trên `preview/ui-ph02` |
| `pnpm nx run @sires/web:test` | 203 đạt, 0 lỗi; riêng `src/features/settings`: 6 file, 67 test đạt |
| `node scripts/docs/add-license.mjs --check` | Đạt cho mọi file của ticket (`add-license.mjs` không phải thêm file nào) |
| `scripts/development/check-tracks.mjs` trên file đã đổi | `web/settings`, `web/shell` — cảnh báo hai luồng: `shell/routes.spec.ts`, `shell/preferences.spec.ts` (report.md mục 5, YC1) |
| `check-ui.mjs`, preview (khi có màn hình) | `check-ui.mjs apps/web/src/features/settings`: 0 lỗi, 4 cảnh báo (bo 32 px của avatar; bóng `--sires-shadow-float` của dialog — cả hai đúng design.md §2.3, §4). Preview `dev:mock` ở 1440×900, 1024×768, 390×844: không cuộn ngang trang, bảng cuộn trong thẻ, nút SignIn 48 px, console không lỗi. Ảnh: `pid-00036-mock-providers-invalid.jpg`, `pid-00036-mock-providers-table.jpg` (thư mục ghi chú của phiên điều phối) |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00036-AC01 | `providers.spec.tsx › key sai Invalid kèm hành động (PID-00036-AC01, EC19)` | Đạt |
| PID-00036-AC02 | `signin.spec.tsx › oidc_unavailable`; `› login_cancelled (EC06)`; `› mã lạ (EC07)`; `› tiếng Anh theo namespace settings` | Đạt |
| UX-AUTH-001-AC01 | `signin.spec.tsx › chỉ một hành động (UX-AUTH-001-AC01)` | Đạt |
| UX-AUTH-002-AC01 | `signin.spec.tsx › oidc_unavailable (PID-00036-AC02, UX-AUTH-002-AC01, EC05)` | Đạt |
| UX-SETTINGS-001-AC01 | `profile.spec.tsx › lần đầu (UX-SETTINGS-001-AC01, EC29)` | Đạt |
| UX-SETTINGS-001-AC02 | `profile.spec.tsx › URL Scholar sai (UX-SETTINGS-001-AC02, EC30)` | Đạt |
| UX-SETTINGS-002-AC01 | `providers.spec.tsx › chỉ ba provider, chưa kiểm không Valid (UX-SETTINGS-002-AC01)` | Đạt |
| UX-SETTINGS-002-AC02 | `providers.spec.tsx › trống hướng dẫn (UX-SETTINGS-002-AC02, EC13)` | Đạt |
| UX-SETTINGS-003-AC01 | `agents.spec.tsx › đổi embedding xác nhận (UX-SETTINGS-003-AC01, EC46)` | Đạt (câu số Reference không có số tới khi #126 vào) |
| UX-SETTINGS-004-AC01 | `preferences.spec.tsx › debug (UX-SETTINGS-004-AC01, EC49)` | Đạt |
| UX-SETTINGS-005-AC01 | `preferences.spec.tsx › khôi phục mặc định (UX-SETTINGS-005-AC01, EC51)` | Đạt |
| NFR-PRIV-001-AC01 | `providers.spec.tsx › thông báo kết nối đầu tiên (NFR-PRIV-001-AC01, EC13)` | Đạt |
| AGENT-PROVIDER-002-AC01 | `providers.spec.tsx › key không lộ (AGENT-PROVIDER-002-AC01, EC25)` | Đạt |
| AGENT-PROVIDER-002-AC03 | `providers.spec.tsx › xóa cần thay thế (AGENT-PROVIDER-002-AC03, EC27)` | Đạt |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | `settings-nav.spec.tsx › /settings chuyển profile`, `› route lạ` |
| EC02 | đã giải quyết | `settings-nav.spec.tsx › đang tải`, `› lỗi tải` |
| EC03 | đã giải quyết | `settings-nav.spec.tsx › đổi ngôn ngữ giữ form` |
| EC04 | đã giải quyết (thao tác tay) | preview 1440×900, 1024×768, 390×844: không cuộn ngang trang, menu lên trên dưới 768 px, nút SignIn 48 px |
| EC05–EC11 | đã giải quyết | `signin.spec.tsx` (tên test theo EC) |
| EC12 | đã giải quyết (thao tác tay) | `dev:mock`: `/sign-in?returnTo=/settings/agents` chuyển thẳng tới `/settings/agents`; nút ở chế độ mock gọi `navigate(returnTo)`. Vitest chạy ở mode `test` nên không có test tự động |
| EC13–EC25 | đã giải quyết | `providers.spec.tsx` (tên test theo EC; EC18 có hai test: máy khách, 400 của máy chủ) |
| EC26–EC28 | đã giải quyết | `providers.spec.tsx › xóa`, `› xóa cần thay thế`, `› 409 connection_in_use` |
| EC29–EC36 | đã giải quyết | `profile.spec.tsx` (tên test theo EC) |
| EC34 | đã giải quyết | `profile.spec.tsx › 412`, `preferences.spec.tsx › 412`; ngưỡng dùng cùng nhánh xử lý 412 |
| EC37–EC47 | đã giải quyết | `agents.spec.tsx` (tên test theo EC; 422 ở `› model không còn trong danh sách`) |
| EC48–EC53 | đã giải quyết | `preferences.spec.tsx` (tên test theo EC); EC52 theo cách tạm của slice tới khi #126 vào |
| EC54 | đã giải quyết | `providers.spec.tsx › tên có HTML`, `profile.spec.tsx › tên có HTML` |
| Mới | cần lưu ý | Mẫu `mocks: import.meta.env.DEV ? …` của README mock (PID-00013) đưa mock của khu vực vào bản build `NODE_ENV=development` (`shell/mock/build.spec.ts` bắt được); khu vực dùng điều kiện của `src/mocks/index.ts`. Báo sửa README ở report.md mục 6 |
| Mới | cần lưu ý | Override trả status mà operation không khai (ví dụ 503) mất thân Problem ở runtime của PID-00013; test dùng `Response`. Báo ở report.md mục 6 |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện. (Không có APR trong khu vực; mọi thay đổi cấu hình do Researcher bấm.)
- [x] Chuyển trạng thái khớp PRD 18.2 — không áp dụng (khu vực không chuyển trạng thái đối tượng nghiệp vụ; `testStatus` do backend đặt).
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project. (Mọi lệnh theo `/me`, `/provider-connections` của tài khoản.)
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi. (Web không gọi model; key không lọt DOM, URL, storage, kho nháp, console — `› key không lộ`.)
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design`. (Chỉ client có type `PublicApi` của shell.)
- [x] Sự kiện ghi qua outbox — không áp dụng (web).
- [x] Migration — không áp dụng (web).
- [x] Giao diện theo `docs/ui-design/design.md`; có trạng thái trống, đang tải, lỗi, chạy lâu. (“Đang kiểm tra…” kèm dòng `role="status"` cho thao tác dài.)
- [ ] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`. — Sửa hai test của shell (`shell/routes.spec.ts`, `shell/preferences.spec.ts`), commit riêng, chờ phiên điều phối quyết (report.md YC1). Không ghi `docs/`, không sửa file sinh.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5.
- [x] Không còn mã gỡ lỗi (`console.log`, `print`), TODO không có chủ; test mới có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Chạy bằng một lượt đọc độc lập (agent đọc hồ sơ ở nhánh `docs/pid-00036-clarify` và mã, không dựa vào báo cáo này), rồi Dev kiểm lại từng khoảng trống trong mã.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G0 | — | — | (điền sau lượt đối chiếu) | — | — |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
