# PID-00012 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 6 LOW (Lần 2, 27/11/2026). Ở `3b63522`: 112/112 test, lint, typecheck, build đạt; 12 đột biến cho thấy test không yếu đi sau Lần 3 của Dev; ba LOW độ phủ test mới (G4–G6). Merge sau #120.

- **Ticket:** [PID-00012](../../../docs/tickets/issues/PID-00012/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy. Báo cáo do phiên QC (qc-prs) viết, phiên điều phối chuyển; Dev chép nguyên văn vào đây.

## Lần 1 — 27/11/2026 · spec-converge-skill

Người chạy: phiên QC do PO `toilatrung` giao, không mang kết luận của Dev. Mã nguồn: PR #138, nhánh `web/shell-pid-00012`, đầu nhánh `5d7d4a3` (`5d7d4a3975de2b6ede7b68803b754a7c1a94f670`), xếp chồng trên #120 (`702d051` là tổ tiên). Kiểm trong worktree tách riêng. Nhánh không đi sau `main`. Phần riêng của PR so với #120: 76 file, toàn bộ trong `apps/web/`, `agent/execution/PID-00012/`, `pnpm-lock.yaml`.

Đã đối chiếu: trang ticket (mục 1–8, H1–H11 và C1–C8 ở `report.md` mục 6), `specs/acceptance.html` (14 AC), `specs/scope.html`, spec mục 3 (O1–O3), mục 6, mục 7, 14 slice S01–S14; nguồn đã sửa ở #120 (design.md §3, §4, §6; `TopBar` biến thể `menu: vi`, `menu: en`, `mode: project`; `streamEvents` với `replay.unavailable`; `logout` dạng form, 303); `report.md`, `implement.md`, `self-qc.md` (Lần 1–2).

### Khoảng trống

| Mã | Nguồn | Loại | Mức | Bằng chứng | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | Màn tham chiếu `ProjectRail` | partial (đã ghi) | LOW | `rail/ProjectRail.tsx`: dòng Plan là “Plan v3 · Approved”, bỏ “· Phase 2/3” của màn tham chiếu (self-qc G11, report C1) | PO xem C1. Nếu giữ phase thì cần nguồn dữ liệu phase từ `getPlan` |
| G2 | Quy tắc 1.4.1 | quy trình | LOW | `check-tracks.mjs --base origin/main`: `contracts-spec, docs, repo, web/shell`, vì nhánh gồm cả #120 | Hết khi #120 vào `main` trước; khi đó diff chỉ còn `web/shell` và `repo` |
| G3 | Màn giữ chỗ của `/sign-in` | unrequested (nhỏ) | LOW | `/sign-in` (giữ chỗ tới PID-00036) hiện tiêu đề “Settings”, tên khu vực chủ, không phải “Đăng nhập”. Banner chỉ có VI \| EN, đúng hồ sơ | Không cần sửa ở PID này. PID-00036 thay bằng SignIn |

Không có CRITICAL, HIGH, MEDIUM.

### AC

| AC | Trạng thái | Mức kiểm | Test (file › tên) | Kết quả |
| --- | --- | --- | --- | --- |
| PID-00012-AC01 | Đạt | jsdom + trình duyệt | `language-switch.spec.tsx › đổi ngôn ngữ giữ trạng thái` | Đạt. Trên trình duyệt: bấm EN ở `/projects/p1/overview`, trang không tải lại (biến đánh dấu trên `window` còn), chuỗi đổi ngay, gửi `PATCH /me/preferences` kèm CSRF |
| PID-00012-AC02 | Đạt | jsdom | `sse.spec.ts › gửi Last-Event-ID khi nối lại` | Đạt. SSE dùng `fetch` nên gửi được header `Last-Event-ID`; `chat.delta` không đổi id |
| PID-00012-AC03 | Đạt | jsdom | `preferences.spec.ts › lưu ngôn ngữ` | Đạt |
| PID-00012-AC04 | Đạt | jsdom | `sse.spec.ts › tải lại khi server báo` | Đạt (`replay.unavailable`) |
| PID-00012-AC05 | Đạt | jsdom | `drafts.spec.tsx › khôi phục sau đăng nhập lại` | Đạt. Nháp lưu theo tài khoản và route ở `localStorage`; đăng xuất chủ động thì xóa (`services.ts` `signOut` → `drafts.clearAccount`) |
| PID-00012-AC06 | Đạt | jsdom + trình duyệt | `logout.spec.tsx › đăng xuất từ menu avatar` | Đạt. Trên trình duyệt: menu avatar → “Sign out” → form `POST /api/v1/auth/logout`, 303 về `/sign-in` |
| UX-LAYOUT-001-AC01 | Đạt | jsdom + trình duyệt | `topbar.spec.tsx › thanh điều hướng mọi màn` | Đạt |
| UX-LAYOUT-003-AC01 | Đạt | jsdom | `topbar.spec.tsx › chuyển về Global` | Đạt |
| UX-I18N-002-AC01 | Đạt | jsdom | `language-switch.spec.tsx › đổi ngôn ngữ giữ trạng thái` | Đạt |
| UX-I18N-004-AC01 | Đạt | node | `format.spec.ts › vi theo múi giờ trình duyệt` | Đạt |
| UX-STATE-003-AC01 | Đạt | jsdom | `states.spec.tsx › trạng thái lỗi` | Đạt. Trên trình duyệt: route lạ hiện “Page not found” trong khung, có lối về Dashboard |
| UX-AUTH-001-AC01 | Đạt | jsdom | `session.spec.ts › chưa đăng nhập` | Đạt |
| UX-A11Y-002-AC01 | Đạt | jsdom + trình duyệt | `prompt-card.spec.tsx › bàn phím` | Đạt. Trên trình duyệt: bộ chuyển ngữ cảnh mở, chọn bằng ↓ và Enter; menu avatar đóng bằng Escape, focus về nút avatar |
| INT-OIDC-003-AC02 | Đạt | jsdom | `activity.spec.ts › request chạy nền không tính`; `› điều hướng gọi getSession` | Đạt |

Mức kiểm: ô Xây, với stub (quy tắc 1.4.4), chưa có gateway thật và chưa có mock PID-00013. Đối chiếu tên test: cả 15 cặp (AC, tên test) trong bảng AC → test đều có đúng một test cùng tên trong đúng file, và file chứa mã AC.

### Kiểm mã (chọn lọc theo nguyên tắc)

- **Client API** (`api/client.ts`):
  - `X-CSRF-Token` ở mọi lệnh ghi; thiếu nguồn CSRF thì ném lỗi, không gửi;
  - `Idempotency-Key`, `If-Match` bắt buộc ở mức type theo hợp đồng;
  - `credentials: 'same-origin'`; lỗi problem+json không giữ body thô.
- **Phiên** (`session/session.ts`):
  - 401 lúc mở → `/sign-in?returnTo=` (chỉ nhận đường dẫn nội bộ bắt đầu bằng `/`, không nhận `//host`);
  - 401 khi đang dùng → lưu nháp, đóng SSE, `?reason=session-expired`.
- **SSE** (`sse.ts`): một kết nối qua `fetch`; nối lại có backoff; 401 thì không thử lại; `replay.unavailable` → tín hiệu “reload”.
- **Đăng xuất** (`services.ts`): xóa nháp của tài khoản, đóng SSE, lấy CSRF mới ngay trước khi gửi, rồi gửi form điều hướng toàn trang (`POST`, trường `csrfToken`), đúng hợp đồng #120. Lỗi mạng hay 5xx khi lấy CSRF thì giữ phiên và hiện lỗi có “Thử lại” (C8).
- **Lưu trữ:** sau khi đăng nhập, `localStorage` trống. Chỉ kho nháp dùng `localStorage`; không lưu token.
- **Giới hạn của spec mục 7:**
  - không chạm `apps/web/src/features/*`, `docs/`, `pnpm-workspace.yaml`;
  - `styles/motion.css` chép đúng nguyên văn `docs/ui-design/assets/motion.css` (bỏ chú thích thì giống hệt);
  - gói mới chỉ web dùng (`jsdom`, `@testing-library/*`) khai phiên bản cố định trong `apps/web/package.json`, như tiền lệ `apps/library`, `e2e`.

### Chạy trên trình duyệt

Gateway giả tạm trong scratchpad của QC (không commit), dùng chính dữ liệu `apps/web/src/shell/test/fixtures.ts` và các route của `test/stub.ts`. `pnpm --filter @sires/web dev` chạy ở cổng 5193 với `SIRES_GATEWAY_URL` trỏ vào gateway giả. Màn tham chiếu mở cạnh bằng `docs/ui-design/tools/serve.mjs` của chính nhánh này.

| Kiểm | Kết quả |
| --- | --- |
| TopBar Global ở 1440×900, so với `pages/TopBar--menu-vi.html` | Khớp: logo, “Ngữ cảnh Global”, 6 tab, Trợ lý, Pending Actions 8, chuông 3, VI/EN (`aria-pressed` đúng), Settings, avatar “NT”. Cả hai đều xếp nhóm phải xuống dòng hai ở 1440 (shell 105px, tham chiếu 109px), nên không phải lệch |
| Menu avatar, so với tham chiếu | Khớp: họ tên, email, “Hồ sơ” (`/settings/profile`), “Đăng xuất”, vai trò `menuitem`; Escape đóng và trả focus |
| Bộ chuyển ngữ cảnh | `role="listbox"`, `aria-selected` đúng; ↓, Enter chuyển sang `/projects/p1/overview` |
| TopBar Project, so với `TopBar--mode-project.html` | Khớp: “Project RAG trong tổng quan tài liệu”, “‹ Global / Overview”, không có tab Global và nút Trợ lý |
| ProjectRail, so với `ProjectRail.html` và nguồn `.dc.html` | Khớp 8 khu vực; số theo khu vực hiện khi lớn hơn 0 (`hasCount` của nguồn); Active task ở đáy (`margin-top: auto` của nguồn), có “Bỏ active task”. Khác: thiếu “Phase 2/3” (G1) |
| Đổi EN | Đổi ngay, không tải lại, avatar giữ tên (`updatePreferences` trả `Account` theo hợp đồng) |
| Route lạ | “Page not found” trong khung |
| 1024×768 | Rail xếp lên trên, `scrollWidth` 1024 (không cuộn ngang) |
| 375×812 | Header thu gọn, thanh tab dưới (Dashboard, Pending · 8, Agent, Projects), `scrollWidth` 375. Nhãn ngữ cảnh dùng JetBrains Mono như màn tham chiếu `MobilePending` |
| Đăng xuất | Form `POST /api/v1/auth/logout` → 303 → `/sign-in`; `/sign-in` chỉ có banner VI \| EN (không TopBar, không rail) |

Không kiểm được: tín hiệu `replay.unavailable` thật và nối lại SSE trên trình duyệt (gateway giả không phát sự kiện; phần này dựa vào `sse.spec.ts`), mock của PID-00013 (#131 chưa merge).

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt |
| `pnpm nx run-many -t lint typecheck test build -p @sires/web --skip-nx-cache` (Nx daemon tắt) | Đạt cả bốn; test 16 file, 112/112. Lần chạy đầu dừng ở `@sires/contracts:generate-ts` với `EPERM rename …/generated` (thư mục bị khóa trên Windows); `nx reset`, tắt daemon rồi chạy lại thì đạt |
| `node agent/skills/qc/sires-ui-review/scripts/check-ui.mjs apps/web/src` | 0 lỗi, 9 cảnh báo, đều hợp lệ: bóng `--sires-shadow-float` chỉ ở `.sires-menu` và hộp lỗi của avatar (lớp nổi, design.md §2.3); bo 20px ở avatar, 11px ở huy hiệu số (giống nguồn `TopBar.dc.html`) |
| `check-pid.mjs PID-00012` / `--result` | ĐỦ để thực thi (1 cảnh báo: report đang `Xong — chờ QC`) / KẾT QUẢ ĐỦ (0 cảnh báo) |
| `add-license --check`; `update-index --check` | 0 thiếu; khớp |
| `check-tracks.mjs --base origin/main` | Xem G2 |
| `gh api repos/toilatrung/sires/pulls/138/commits` | Mọi commit `verified: true`; không có dòng ghi công AI |
| `gh pr checks 138` | 25/25 đạt trên `5d7d4a3` |

### Lệch với Self-QC

Không có lệch về kết quả: 112 test, lint, typecheck, build, `check-ui` (0 lỗi, 9 cảnh báo hợp lệ) khớp `self-qc.md` Lần 2. Các khoảng trống Dev đã sửa (G1–G10 của self-QC) được QC thấy trong mã: G1 (đăng xuất lỗi giữ phiên, C8), G3 (thẻ prompt đủ bốn `PromptType`), G4 (bỏ khóa idempotency sau 4xx), G5 (`replay.unavailable` dùng `Event.id`), G8 (không đánh dấu nhầm Global). G11 của Dev là G1 ở đây.

### Việc còn lại

1. PO merge #120, rồi #138 (diff thu lại còn phần web). Sau khi #120 vào `main`, gộp `main` vào nhánh và chờ CI.
2. G1: PO xem C1 (giữ hay bỏ “Phase”).
3. Sau khi #131 (mock PID-00013) vào: chạy lại shell với mock để kiểm số liệu và SSE thật.

## Lần 2 — 27/11/2026 · spec-converge-skill (rà phần đổi)

Người chạy: phiên QC do PO `toilatrung` giao. Mã nguồn: PR #138, đầu nhánh `3b63522` (`3b63522e5969e4b30e0baedc3abbfda80bfc72a5`), 3 commit sau `5d7d4a3`: `ad25dea`, `99ac698` (mã, test), `3b63522` (`report.md`, `self-qc.md` Lần 3). Nhánh không đi sau `main`; `pnpm-lock.yaml` không đổi. Chỉ rà phần đổi (17 file), theo `report.md` Lần 3, L3-1–L3-5.

### Phần đổi

| Mục | Mã | Đánh giá |
| --- | --- | --- |
| L3-1 | `test/render.tsx`: `renderShell` nhận `areas` (mặc định khu vực thật, cho test của khu vực); `renderShellFrame` gắn `neutralFeatures` (`test/features.tsx`: mọi path của khu vực trỏ `Placeholder`, không Trợ lý, không gọi API). 10 file test của shell chuyển sang `renderShellFrame` | Đúng mục đích. Trong 10 file chỉ đổi lời gọi hàm dựng; không assertion nào bị xóa hay nới |
| L3-2 | `App` nhận `assistant` qua prop; `createRoutes` lấy `assistant` từ `features` truyền vào. `App` không còn tự import `features`, bớt một phụ thuộc vòng | Hành vi của ứng dụng không đổi (`main.tsx` vẫn dùng `createRoutes()` với mọi khu vực). Chưa test nào kiểm nội dung được truyền qua (G5) |
| L3-3 | `FetchStub.calls(path, method, query)`; `navigation.spec` đếm theo query (`notifications?status=Unread&limit=1`, `projects?status=Active`, `pending-actions?limit=1`) | Mạnh hơn: bắt thêm lỗi thiếu `limit` (M4), lỗi query sai khi tải lại (M1). Chỉ yếu đi ở một ca khó xảy ra: lời gọi thừa với query *khác* sau khi nối lại |
| L3-4 | `shellStub` trả 200 rỗng cho `/dashboard`, `/provider-connections`, `/workflows`, `/conversations` | Chỉ ảnh hưởng test dùng khu vực thật; không đổi kết quả test của shell |
| L3-5 | Không sửa test `/sign-in` (vì `renderShellFrame`) | Đúng: `routes.spec.ts` vẫn đạt |

### Khoảng trống mới

| Mã | Nguồn | Loại | Mức | Bằng chứng | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G4 | INT-OIDC-003-AC02 (“redirect không tính là hoạt động”, chú thích `activity.ts:8`) | partial (test) | LOW | Đột biến M8 (bỏ `if (state.historyAction === 'REPLACE') return;`) không làm đỏ `activity.spec.ts`, ở cả `5d7d4a3` lẫn `3b63522` | Thêm ca: điều hướng `replace` (ví dụ `/` → `/dashboard`) không gọi `GET /auth/session` |
| G5 | L3-2 | partial (test) | LOW | Đột biến M6 (`content={undefined}` ở `App`) không làm đỏ `topbar.spec`, `language-switch.spec`, `routes.spec`: các test chỉ kiểm có panel Trợ lý. `report.md` L3-2 ghi “kiểm bằng `topbar.spec.tsx › trợ lý`” là quá lời. Chưa khu vực nào khai `assistant` | Thêm test `createRoutes([feature có assistant])`: mở Trợ lý thì thấy nội dung của feature |
| G6 | `ProjectRail` (nguồn `hasCount`: chỉ hiện khi lớn hơn 0); `navigation.refreshCounts` | partial (test) | LOW | Đột biến M11 (rail hiện cả số 0) và M3b (`refreshCounts()` bỏ `loadUnread`) không làm đỏ test nào, ở cả hai đầu | Thêm ca rail với `areaCounts` bằng 0; thêm ca `refreshCounts` cập nhật số chưa đọc |

### Thử đột biến

Mỗi đột biến sửa tạm một file mã của shell, chạy các file test liên quan (`vitest run`), rồi trả lại bằng `git checkout` (sau mỗi lượt, `git status` sạch). Chạy trên cả `3b63522` (mới) và `5d7d4a3` (cũ).

| Mã | Đột biến | `3b63522` | `5d7d4a3` |
| --- | --- | --- | --- |
| M1 | `loadUnread` bỏ `status: 'Unread'` | Đỏ 3 (UX-LAYOUT-001-AC01, AC04 tải lại, nối lại bình thường) | Đỏ 1 |
| M2 | Nối lại bình thường cũng tải lại | Đỏ 2 | Đỏ 2 |
| M3 | `reload()` bỏ notifications | Đỏ 1 (PID-00012-AC04) | Đỏ 1 |
| M3b | `refreshCounts()` bỏ `loadUnread` | Xanh (G6) | Xanh |
| M4 | Số Pending Actions không có `limit` | Đỏ 1 | **Xanh** (đầu mới bắt thêm) |
| M5 | Bộ chuyển lấy cả project không Active | Đỏ 1 (EC34) | Đỏ 1 |
| M6 | `App` bỏ nội dung Trợ lý | Xanh (G5) | (mã cũ khác, không áp được) |
| M7 | Đăng xuất không xóa nháp | Đỏ 4 (PID-00012-AC06, S14, UX-STATE-003) | Đỏ 4 |
| M8 | Redirect `REPLACE` tính là hoạt động | Xanh (G4) | Xanh |
| M9 | `signInPath` bỏ `returnTo` | Đỏ 3 (UX-AUTH-001-AC01, EC08) | Đỏ 3 |
| M10 | PATCH ngôn ngữ không gửi `If-Match` | Đỏ 2 (PID-00012-AC03, EC26) | Đỏ 2 |
| M11 | Rail hiện cả số 0 | Xanh (G6) | Xanh |

Kết luận: test của shell không yếu đi sau Lần 3. M1 và M4 mạnh hơn; các đột biến còn lại cho kết quả giống hệt. Ba đột biến lọt (M3b, M8, M11) cũng lọt ở đầu cũ: đó là khoảng trống độ phủ có từ trước, ghi thành G4, G6.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run-many -t lint typecheck test build -p @sires/web --skip-nx-cache` (Nx daemon tắt) | Đạt; 16 file, 112/112 |
| `check-ui.mjs apps/web/src` | 0 lỗi, 9 cảnh báo (như Lần 1) |
| `check-pid.mjs PID-00012 --result`; `add-license --check`; `update-index --check` | KẾT QUẢ ĐỦ (0 cảnh báo); 0 thiếu; khớp |
| `gh api …/pulls/138/commits`; `gh pr checks 138` | 13/13 `verified: true`; không có dòng ghi công AI; 25/25 đạt trên `3b63522` |
| Quét key, host cổng trung gian trong `git log -p 5d7d4a3..3b63522` | 0 |

### Lệch với Self-QC

- `report.md` L3-2 ghi “kiểm bằng `topbar.spec.tsx › trợ lý`”. Test đó chỉ kiểm có panel, không kiểm nội dung được truyền qua `createRoutes` (M6 lọt), xem G5.
- Phần còn lại khớp: 112/112, `check-ui` 0 lỗi.

Thứ tự merge không đổi: #120 trước, rồi #138.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
