# PID-00012 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00012](../../../docs/tickets/issues/PID-00012/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026 (Lần 3)

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (pnpm 10.34.9, Node 24.21.0) |
| `pnpm nx run @sires/web:test` (`vitest run`) | 16 file, 107 test đạt, 0 lỗi; chạy ba lượt song song cùng lúc (máy tải nặng) đều 107/107 |
| `pnpm --filter @sires/web typecheck`, `lint` | Đạt, 0 lỗi; các `@ts-expect-error` trong `api.spec.ts` đều đúng chỗ (tsc báo lỗi nếu thừa) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Chạy với `--parallel=2` trên Windows (mọi project bị tính affected vì `pnpm-lock.yaml` đổi): mọi task TypeScript đạt — `@sires/web` lint, typecheck, test, build; các thư viện TS; các service NestJS (test Testcontainers đạt). 13 task Python lỗi, cùng một nguyên nhân môi trường: Windows Application Control chặn file thực thi do uv cài (`os error 4551`: ruff, pytest, mypy, openapi-python-client) — `@sires/contracts:generate-python`, `@sires/contracts:test`, lint/typecheck/test của `sires-common`, `agent-core`, `knowledge`, `eval`; không liên quan thay đổi (chỉ `apps/web` và lockfile của devDependency web). CI chạy phần Python trên Linux |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu thông báo giấy phép |
| `check-tracks.mjs --stdin` trên file đã đổi | `web/shell` (mã); `repo` cho `pnpm-lock.yaml` (thêm devDependency của web) và `agent/execution/PID-00012/` như các PID trước; không có `docs/`, không có `apps/web/src/features/*`, không `pnpm-workspace.yaml` |
| `node agent/skills/qc/sires-ui-review/scripts/check-ui.mjs apps/web/src` | 0 lỗi, 9 cảnh báo, đều hợp lệ: 7 về bóng `--sires-shadow-float` (chỉ dùng cho lớp nổi `.sires-menu`, hộp lỗi đăng xuất `.sires-avatar__error` và chính token), bo 11px của huy hiệu số Pending Actions và 20px của avatar (design.md §2.3: huy hiệu số đếm và avatar tròn hoàn toàn) |
| Preview `web` (cổng 5173, `pnpm --filter @sires/web dev`) | Chạy; `/` → `/dashboard`, title `SIRes`; chưa có gateway nên vùng làm việc báo “Could not check your session · http_error”, console không lỗi |
| Preview với gateway giả cục bộ (dữ liệu như `test/fixtures.ts`) | 1440×900 Global, Project, bộ chuyển ngữ cảnh, menu avatar, English, route lạ; 1024×768 rail xếp lên trên; 390×844 khung điện thoại, menu; `scrollWidth = 390` (không cuộn ngang); console không lỗi. TopBar so với `docs/ui-design/pages/TopBar.html` cùng khổ: hai nhóm 980 px và 504 px, xuống dòng như nhau. Ảnh ở `screenshots/` |
| `check-pid.mjs PID-00012` | 1 `LỖI` ở cổng sẵn sàng (“Chưa sẵn sàng — chờ sửa nguồn”) vì PR sửa nguồn PC-05 chưa merge; ghi nhận, không chặn (phiên điều phối) |
| `check-pid.mjs PID-00012 --result` | KẾT QUẢ ĐỦ, 0 cảnh báo (chạy lại sau khi cập nhật report.md) |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00012-AC01 | `apps/web/src/shell/language-switch.spec.tsx › đổi ngôn ngữ giữ trạng thái`; `› nhãn ProjectRail đổi theo ngôn ngữ, tên khu vực giữ tiếng Anh` | Đạt |
| PID-00012-AC02 | `apps/web/src/shell/sse.spec.ts › gửi Last-Event-ID khi nối lại` (e-42 rồi chat.delta, nối lại gửi `Last-Event-ID: e-42`) | Đạt |
| PID-00012-AC03 | `apps/web/src/shell/preferences.spec.ts › lưu ngôn ngữ` (If-Match `"v7"`, X-CSRF-Token, body `{"uiLanguage":"en"}`, English trước khi server trả lời), `› 412 đọc lại GET /me rồi gửi lại`, `› lỗi giữ ngôn ngữ trong phiên` | Đạt |
| PID-00012-AC04 | `apps/web/src/shell/sse.spec.ts › tải lại khi server báo không còn phát lại được`; `navigation.spec.tsx › tải lại khi cần tải lại`, `› nối lại bình thường: không tải lại` | Đạt (tín hiệu `replay.unavailable` theo PC-05 P2) |
| PID-00012-AC05 | `apps/web/src/shell/drafts.spec.tsx › khôi phục sau đăng nhập lại cùng tài khoản`; `› xóa khi gửi xong, khi đăng xuất`; `› xóa khi đăng xuất qua menu avatar` | Đạt |
| PID-00012-AC06 | `apps/web/src/shell/logout.spec.tsx › đăng xuất từ menu avatar` (menu có họ tên, email; nháp xóa, SSE `closed`, form `POST /api/v1/auth/logout` trường `csrfToken` lấy mới ngay trước khi gửi); `› đăng xuất: lỗi mạng khi lấy CSRF`; `› menu bằng bàn phím`; `› hồ sơ mở /settings/profile` | Đạt (dạng PC-05 P3; trình duyệt theo 303 kiểm bằng giả lập `submitForm`) |
| UX-LAYOUT-001-AC01 | `apps/web/src/shell/topbar.spec.tsx › thanh điều hướng mọi màn` (5 route Global, Project, Manuscript: chỉ báo ngữ cảnh, “Pending Actions 8”, VI/EN); `navigation.spec.tsx › số Pending Actions từ API` | Đạt |
| UX-LAYOUT-003-AC01 | `apps/web/src/shell/topbar.spec.tsx › chuyển về Global` | Đạt |
| UX-I18N-002-AC01 | `apps/web/src/shell/language-switch.spec.tsx › đổi ngôn ngữ giữ trạng thái` | Đạt |
| UX-I18N-004-AC01 | `apps/web/src/shell/format.spec.ts › vi theo múi giờ trình duyệt` (`17/11/2026 09:52`) | Đạt |
| UX-STATE-003-AC01 | `apps/web/src/shell/states.spec.tsx › trạng thái lỗi` | Đạt |
| UX-AUTH-001-AC01 | `apps/web/src/shell/session.spec.ts › chưa đăng nhập` (`/sign-in?returnTo=%2Fdashboard`) | Đạt |
| UX-A11Y-002-AC01 | `apps/web/src/shell/prompt-card.spec.tsx › bàn phím` (Tab, mũi tên, Tab, Enter, Space; callback nhận `['c2']`) | Đạt (phần component) |
| INT-OIDC-003-AC02 | `apps/web/src/shell/activity.spec.ts › request chạy nền không tính`; `› điều hướng gọi getSession đúng một lần cho mỗi lần điều hướng`; `› không gọi theo chu kỳ`; `› lệnh ghi của người dùng là lệnh ghi bình thường` | Đạt (phần shell) |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | `detectInitialLanguage`; `i18n.spec.ts › ngôn ngữ ban đầu (UX-I18N-001, EC01)` |
| EC02 | đã giải quyết | `session.onAccount` áp `uiLanguage`; `session.spec.ts › ngôn ngữ theo Preferences` |
| EC03 | đã giải quyết | đổi bằng `i18next.changeLanguage`, không remount; `language-switch.spec.tsx` (cùng phần tử ô nhập, route, khung Trợ lý) |
| EC04 | đã giải quyết | `i18n.spec.ts` so khóa phẳng của mọi namespace |
| EC05 | đã giải quyết | `topbar.spec.tsx › nhãn giữ tiếng Anh`, `rail.spec.tsx › nhãn giữ tiếng Anh` |
| EC06 | đã giải quyết | route `*` → `NotFound` trong khung; `routes.spec.ts › route lạ` |
| EC07 | đã giải quyết | `session.spec.ts › chưa đăng nhập`; `safeReturnTo` chỉ nhận `/…` (`› đường dẫn quay lại chỉ nhận đường dẫn tương đối`) |
| EC08 | đã giải quyết | `session.spec.ts › phiên hết hạn` (flush nháp, đóng SSE, một lần); `drafts.spec.tsx › khôi phục sau đăng nhập lại` |
| EC09 | đã giải quyết | `api.spec.ts › csrf` |
| EC10 | đã giải quyết | `IdempotencyKeys`; `api.spec.ts › idempotency` |
| EC11 | đã giải quyết | `api.spec.ts › lỗi không phải problem`; `states.spec.tsx › lỗi mạng và mã HTTP` |
| EC12 | đã giải quyết | `states.spec.tsx › mã chưa dịch` |
| EC13 | đã giải quyết | `sse.spec.ts › chat.delta` |
| EC14 | đã giải quyết | `sse.spec.ts › báo đã nối lại`, `› tải lại khi server báo` |
| EC15 | đã giải quyết | `sse.spec.ts › 401` (không thử lại, gọi luồng phiên hết hạn) |
| EC16 | đã giải quyết | `rail.spec.tsx › manuscript ẩn rail` |
| EC17 | đã giải quyết | `routes.spec.ts › sign-in không khung` |
| EC18 | đã giải quyết | thao tác tay trên preview 1440×900, 1024×768, 390×844; không cuộn ngang ở 390 (`scrollWidth = 390`); ảnh `screenshots/06-…`, `07-…`, `08-…` |
| EC19 | đã giải quyết | `styles/motion.css` chép nguyên văn từ `docs/ui-design/assets/` (reduced motion: chấm, skeleton, thanh lặp đứng yên; không dịch chuyển); không spinner; `check-ui.mjs` 0 lỗi. Chưa bật reduced motion bằng tay: trình duyệt trong app không giả lập được `prefers-reduced-motion` |
| EC20 | đã giải quyết | `states.spec.tsx › bảng nhãn`, `› bảng nhãn bổ sung` (bảng design.md §3 đã sửa ở nhánh nguồn PC-05 khớp từng dòng) |
| EC21 | đã giải quyết | `format.spec.ts › múi giờ` |
| EC22 | đã giải quyết | `topbar.spec.tsx › trợ lý` |
| EC23 | đã giải quyết | `navigation.spec.tsx › project 404` |
| EC24 | đã giải quyết | `navigation.spec.tsx › cập nhật số qua SSE` |
| EC25 | đã giải quyết | `format.spec.ts › en cùng mẫu ngày, số theo ngôn ngữ` |
| EC26 | đã giải quyết | `preferences.spec.ts › 412 đọc lại GET /me rồi gửi lại`, `› lần gửi lại vẫn 412` |
| EC27 | đã giải quyết | `preferences.spec.ts › lỗi giữ ngôn ngữ trong phiên` |
| EC28 | đã giải quyết | `preferences.spec.ts › chưa đăng nhập không lưu` (không request nào) |
| EC29 | đã giải quyết | `drafts.spec.tsx › tài khoản khác không khôi phục` |
| EC30 | đã giải quyết | `drafts.spec.tsx › xóa khi gửi xong, khi đăng xuất`, `› xóa khi đăng xuất qua menu avatar`; `logout.spec.tsx` |
| EC31 | đã giải quyết | `prompt-card.spec.tsx › không chọn sẵn`, `› bốn trạng thái` |
| EC32 | đã giải quyết | `activity.spec.ts › request chạy nền không tính` (không `GET /auth/session`, chỉ header trong danh sách cho phép) |
| EC33 | đã giải quyết | `navigation.spec.tsx › nhóm số theo khu vực` |
| EC34 | đã giải quyết | `navigation.spec.tsx › bộ chuyển chỉ có project Active`, `› bộ chuyển bỏ project Archived ngay cả khi API trả về` |
| Mới M1 | đã giải quyết | `/` → `/dashboard` cả khi chưa kiểm được phiên (redirect bằng loader); `routes.spec.ts › / → /dashboard`; giữ smoke test e2e TS-00-01 |
| Mới M2 | đã giải quyết | cùng một ô nhập khi đổi route mà không remount không mang nháp sang route khác; `drafts.spec.tsx › nháp lưu theo route` |
| Mới M3 | đã giải quyết | 401 đến muộn sau khi đăng xuất không thành “phiên hết hạn” (`logout.spec.tsx`); Back từ `/sign-in` về màn có khung thì kiểm phiên lại (`session.spec.ts › sau khi phiên hết hạn, quay lại…`) |
| Mới M4 | cần lưu ý | Khi Preferences khác ngôn ngữ trình duyệt, khung hiện ngôn ngữ trình duyệt trong lúc kiểm phiên rồi đổi khi `GET /me` trả về (UX-I18N-001 chỉ có Preferences sau khi có phiên). Không chặn; PO quyết nếu muốn nhớ lựa chọn cục bộ |
| Mới M5 | đã giải quyết | Đăng xuất gặp lỗi mạng hoặc 5xx khi lấy CSRF: vẫn đăng nhập, giữ nháp và SSE, menu báo “Chưa đăng xuất được” có “Thử lại”; `logout.spec.tsx › đăng xuất: lỗi mạng khi lấy CSRF` |
| Mới M6 | đã giải quyết | Lệnh bị từ chối rõ (4xx) rồi gửi lại nội dung đã sửa: khóa idempotency mới, tránh `422 idempotency_key_reused`; 5xx giữ khóa; `api.spec.ts › idempotency: bị từ chối rõ ràng (4xx)…` |
| Mới M7 | đã giải quyết | Prompt không có `choices` (approval, edit_and_approve, information_request): thẻ không hiện nút xác nhận khóa mãi, nhận điều khiển của khu vực (report.md C7); `prompt-card.spec.tsx › prompt không có phương án` |
| Mới M8 | đã giải quyết | `replay.unavailable` chỉ có `id` trong data: dùng làm `Last-Event-ID` tiếp theo; `sse.spec.ts › tín hiệu chỉ có id trong data` |
| Mới M9 | đã giải quyết | Project Archived mở bằng URL: bộ chuyển ngữ cảnh không đánh dấu nhầm Global; `navigation.spec.tsx › project Archived mở bằng URL` |
| Mới M10 | đã giải quyết | `GET /me` lỗi lúc mở rồi bấm VI/EN: báo đúng lỗi của lần đọc lại (không gán `network_error`); các lần lưu chạy tuần tự; `preferences.spec.ts › GET /me lỗi lúc mở` |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện — thẻ prompt không chọn sẵn, chỉ gọi callback khi Researcher xác nhận.
- [ ] Chuyển trạng thái khớp PRD 18.2 — không áp dụng (shell không chuyển trạng thái entity).
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project — nháp theo tài khoản, SSE lọc theo project khi khu vực yêu cầu.
- [ ] Gọi model qua Model Gateway — không áp dụng. API key không xuất hiện ở đâu (lỗi chỉ hiện `Problem.code`, `correlationId`).
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design` (type `PublicApi`).
- [ ] Sự kiện ghi qua outbox — không áp dụng.
- [ ] Migration — không áp dụng.
- [x] Giao diện theo `docs/ui-design/design.md`; có trạng thái trống, đang tải, lỗi, chạy lâu.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5 (YC1–YC4) và mục 6 (C1–C6).
- [x] Không còn mã gỡ lỗi (`console.log`), TODO không có chủ; test mới có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Chạy ở chế độ Dev tự QC, chỉ đọc, bởi một agent không mang kết luận của Dev (đọc hồ sơ, mã, tự chạy lệnh), trên `49d3220`; đối chiếu thêm với nhánh sửa nguồn `docs/pc05-p1-p6-shell-sources` (PC-05 P1–P3). Kết luận của lần chạy: không CRITICAL, không HIGH; mọi AC và EC có test đúng tên `file › tên` và kiểm đúng Given–When–Then; Output O2, O3 đúng đường dẫn; không chạm điểm dừng. Dev sửa các khoảng trống dưới đây rồi chạy lại lệnh ở mục 1.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | MEDIUM | Đăng xuất gặp lỗi mạng hoặc 5xx khi lấy CSRF: đã xóa nháp, đóng SSE, đánh dấu đã đăng xuất rồi ném lỗi không ai bắt; không có trạng thái lỗi (S14, UX-STATE-003), khung treo ở “đang kiểm phiên” | `services.ts` `signOut`, `topbar/AvatarMenu.tsx` | Sửa: lấy token trước; chỉ dọn khi được hoặc khi 401; lỗi khác giữ nguyên và menu hiện `ErrorState` có “Thử lại”. Test `logout.spec.tsx › đăng xuất: lỗi mạng khi lấy CSRF` |
| G2 | partial | MEDIUM | Hai test AC chập chờn khi máy tải nặng: `session.spec.ts › chưa đăng nhập` (truy vấn nhóm VI/EN trùng TopBar), `drafts.spec.tsx › khôi phục sau đăng nhập lại` (quá 5 s) | ba lượt `vitest run` song song: 2/3 lượt có 1 lỗi | Sửa: chờ khung `/sign-in` thật (không còn tab Global, nhóm VI/EN nằm trong `.sires-frameless`); `testTimeout` 20 s, `asyncUtilTimeout` 5 s. Ba lượt song song sau sửa: 107/107 mỗi lượt |
| G3 | partial | MEDIUM | Thẻ prompt chỉ trả lời được loại `choice`; loại không có phương án hiện nút xác nhận khóa mãi | `prompt-card/PromptCard.tsx`; `docs/ui-design/pages/Chat.html` (thẻ `edit_and_approve` có ô sửa, “Sửa và duyệt”, “Từ chối”) | Chốt theo đề xuất (report.md C7): H8 giao shell phần radio kèm hệ quả; thẻ giữ khung và trạng thái cho mọi loại, loại không có `choices` nhận điều khiển của khu vực qua `children`, không còn nút khóa mãi. Test `prompt-card.spec.tsx › prompt không có phương án`. PO xem C7 |
| G4 | partial | LOW | Khóa idempotency giữ cả sau 4xx dứt khoát → lần gửi đã sửa gặp `422 idempotency_key_reused` | `api/idempotency.ts` `run` | Sửa: 4xx bỏ khóa, lỗi mạng và 5xx giữ. Test `api.spec.ts › idempotency: bị từ chối rõ ràng (4xx)…` |
| G5 | partial | LOW | `replay.unavailable` bỏ qua `Event.id` trong data khi bản ghi không có dòng `id:` | `sse.ts` `dispatch` | Sửa: `record.id || event.id`. Test `sse.spec.ts › tín hiệu chỉ có id trong data` |
| G6 | a11y | LOW | Thời gian đã chạy đổi mỗi giây trong vùng `role="status"` | `states/States.tsx` `LongOperation` | Sửa: thời gian nằm trong `aria-hidden` |
| G7 | a11y | LOW (chưa chắc) | Họ tên, email trong `role="menu"` có thể không được đọc ở chế độ menu | `topbar/AvatarMenu.tsx` | Giữ: đúng cấu trúc màn tham chiếu `TopBar--menu-vi`, `--menu-en` của nhánh sửa nguồn; họ tên đã có trong nhãn nút “Tài khoản: …” |
| G8 | partial | LOW | Bộ chuyển ngữ cảnh đánh dấu Global là đang chọn khi project không có trong danh sách Active | `topbar/ContextSwitcher.tsx` | Sửa: không đánh dấu mục nào. Test `navigation.spec.tsx › project Archived mở bằng URL` |
| G9 | partial | LOW | Lỗi khi đọc lại `GET /me` bị đổi thành `network_error`; bấm VI/EN nhanh có thể ghi lệch thứ tự | `preferences.ts` | Sửa: báo lỗi thật (`loadAccount({ throwOnError })`); các lần lưu chạy tuần tự, chỉ lần bấm cuối báo lỗi. Test `preferences.spec.ts › GET /me lỗi lúc mở` |
| G10 | rủi ro thiết kế | LOW (chưa chắc) | `index.ts` xuất từ `App`, `i18n` (đều import `features.ts`): khu vực import `src/shell` có thể tạo vòng import | `index.ts` | Sửa: hàm ngôn ngữ chuyển sang `locale.ts`, `NotFound` sang `NotFound.tsx`, không import `features.ts` |
| G11 | partial (đã ghi) | LOW | Dòng Plan của rail bỏ “Phase 2/3” của màn tham chiếu | `rail/ProjectRail.tsx` | Giữ, PO xem report.md C1 |

Sau khi sửa: `vitest run` 107/107 (ba lượt song song), typecheck, lint sạch, `check-ui.mjs` 0 lỗi. Không còn CRITICAL, HIGH.


## Lần 2 — 27/11/2026

Sau khi merge #120 (nguồn S11, S12, S14) và sửa theo report.md Lần 2 (L2-1 – L2-5).

| Lệnh | Kết quả |
| --- | --- |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00012` | ĐỦ để thực thi (cổng sẵn sàng hết LỖI sau khi có nguồn của #120) |
| `pnpm --filter @sires/web exec vitest run` | 16 file, 112 test đạt; hai lượt chạy song song cùng lúc đều đạt |
| `tsc --noEmit`, `eslint .`, `vite build` (apps/web) | Đạt, 0 lỗi |
| `check-ui.mjs apps/web/src` | 0 lỗi, 9 cảnh báo (như Lần 1: bóng của lớp nổi, bo tròn của huy hiệu số và avatar) |
| `add-license.mjs --check` | 0 file thiếu |

AC, EC thay đổi:

| Mục | Trạng thái | Test |
| --- | --- | --- |
| UX-A11Y-002-AC01 | Đạt | `prompt-card.spec.tsx › bàn phím` (callback `onAnswer` nhận `{ choiceIds: ['c2'] }`) |
| S10 mọi `PromptType` | Đạt | `prompt-card.spec.tsx › mọi loại PromptType…`, `› approval…`, `› edit_and_approve…`, `› information_request…`, `› Answered theo loại` |
| PID-00012-AC06 (phiên đã hết) | Đạt | `logout.spec.tsx › phiên đã hết khi đăng xuất (GET /auth/session 401): vẫn gửi form…` |
| Mới M7 | đã giải quyết (thay cách của Lần 1) | thẻ tự có điều khiển cho cả bốn loại, không còn dựa vào `children` |


## Lần 3 — 27/11/2026

Test của shell độc lập với màn của khu vực (PC-05 P37; report.md Lần 3, L3-1 – L3-5).

| Lệnh | Kết quả |
| --- | --- |
| `npx vitest run src/shell` (apps/web, nhánh này) | 16 file, 112 test đạt |
| `tsc --noEmit`, `eslint src/shell` (apps/web) | Đạt, 0 lỗi |
| Cây gộp `web/shell-pid-00012` + `origin/web/global-pid-00060` (`77a9971`, gồm #141) + `origin/web/settings-pid-00036` (`eb8ca71`), `pnpm install --frozen-lockfile` rồi `npx vitest run` | 33 file, 273 test đạt (shell, global, settings, mock, gồm `build.spec.ts`) |
| Cây gộp: `tsc --noEmit`, `eslint src` | Đạt, 0 lỗi |

AC, EC: không đổi hành vi của shell; chỉ đổi cách test gắn khu vực (`renderShellFrame`) và nơi `App` lấy nội dung Trợ lý.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
