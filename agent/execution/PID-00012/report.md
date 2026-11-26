# PID-00012 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00012](../../../docs/tickets/issues/PID-00012/index.html) · **Luồng:** `web/shell` · **Giai đoạn:** PH-01
- **Nhánh:** `web/shell-pid-00012` (tạo từ `origin/main` `c9e745b`; mã ở `8922479`, `49d3220` và commit sửa theo tự đối chiếu; đã commit có chữ ký và push) · **PR:** [toilatrung/sires#138](https://github.com/toilatrung/sires/pull/138) vào `main`
- **Cập nhật:** 27/11/2026 (Lần 4: ba LOW của QC Lần 2, claims → Evidence, client đọc phản hồi không phải JSON, Dialog dùng chung)
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Người làm: phiên do PO `toilatrung` giao (assignee `toilatrung`). Lúc bắt đầu, `check-pid.mjs PID-00012` báo 1 `LỖI` ở cổng sẵn sàng (“Chưa sẵn sàng — chờ sửa nguồn” cho S11, S12, S14). PO đã chốt PC-05 P1–P5 theo đề xuất và ủy quyền làm tiếp (mục 5, YC1); nguồn đang được sửa ở PR riêng của phiên docs-sources.

## 1. Tóm tắt

- Slice: 14/14 xong. Bị chặn: không có. S11, S12, S14 làm theo dạng PC-05 P1–P3 trong lúc PR sửa nguồn chưa merge (mục 6, Còn mở).
- AC: 14/14 đạt, kiểm với stub fetch và SSE trong thư mục test của shell (ô Xây, quy tắc 1.4.4; 107 test); chạy thật trên trình duyệt với gateway giả cục bộ ở 1440×900, 1024×768, 390×844 (ảnh ở mục 6). Edge case: 34/34 đã giải quyết (EC18 kiểm bằng tay trên trình duyệt); thêm 10 mục mới, 9 đã giải quyết, 1 cần lưu ý (self-qc.md mục 3).
- Tự đối chiếu (spec-converge-skill): 0 CRITICAL, 0 HIGH; 3 MEDIUM, 8 LOW — đã sửa 8, giữ 3 có lý do (self-qc.md mục 5).
- Yêu cầu thêm: 4 (YC1–YC4).

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Test giao diện, ngôn ngữ ban đầu, đổi ngôn ngữ giữ trạng thái, hàm định dạng | Xong | tạo: `locale.ts` (hàm ngôn ngữ không import `features.ts`), `NotFound.tsx`; sửa: `apps/web/package.json` (devDependency `jsdom` 31.0.0, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/user-event` 14.6.10), `apps/web/vite.config.ts` (Vitest jsdom), `pnpm-lock.yaml`, `apps/web/src/shell/i18n.ts`, `i18n/vi.json`, `i18n/en.json`, `i18n.spec.ts`; tạo: `format.ts`, `format.spec.ts`, `language-switch.spec.tsx`, `test/setup.ts` |
| S02 | TopBar hai ngữ cảnh, bộ chuyển ngữ cảnh, VI/EN, Trợ lý, routing | Xong | sửa: `App.tsx`, `routes.tsx`, `feature.ts` (trường tùy chọn `assistant`), `routes.spec.ts`, `src/main.tsx`, `styles/base.css`; tạo: `topbar/TopBar.tsx`, `topbar/ContextSwitcher.tsx`, `topbar/LanguageSwitch.tsx`, `context.ts`, `icons.tsx`, `assets/sires-logo.svg`, `styles/motion.css` (chép từ `docs/ui-design/assets/`), `styles/shell.css`, `topbar.spec.tsx` |
| S03 | ProjectRail, Manuscript không rail, tablet, khung điện thoại | Xong | tạo: `rail/ProjectRail.tsx`, `mobile/MobileChrome.tsx`, `rail.spec.tsx`; sửa: `App.tsx`, `styles/shell.css` |
| S04 | Client API có type, CSRF, idempotency, lỗi, kiểm phiên, phiên hết hạn | Xong | tạo: `api/client.ts`, `api/errors.ts`, `api/idempotency.ts`, `session/session.ts`, `services.ts`, `hooks.tsx`, `api.spec.ts`, `session.spec.ts`, `test/stub.ts`, `test/fixtures.ts`, `test/render.tsx` |
| S05 | Client SSE, Last-Event-ID, đăng ký theo loại và project | Xong | tạo: `sse.ts`, `sse.spec.ts` |
| S06 | Chip trạng thái, execution label, đang tải, thao tác dài, trống, lỗi | Xong | tạo: `states/statuses.ts`, `states/StatusChip.tsx`, `states/States.tsx`, `states.spec.tsx` |
| S07 | Số Pending Actions, chưa đọc, project, ProjectRail, Active task từ API và SSE (H1) | Xong | tạo: `navigation/navigation.ts`, `navigation.spec.tsx` |
| S08 | Lưu VI/EN vào Preferences, If-Match, 412, lỗi (H2) | Xong | tạo: `preferences.ts`, `preferences.spec.ts`; sửa: `App.tsx` (thông báo lỗi lưu dưới TopBar) |
| S09 | Kho nháp dùng chung (H7) | Xong | tạo: `drafts/store.ts`, `drafts.spec.tsx`, `test/features.tsx`; `useDraft` trong `hooks.tsx`; hướng dẫn trong `apps/web/src/shell/README.md` |
| S10 | Thẻ Interactive Agent Prompt (H8) | Xong | tạo: `prompt-card/PromptCard.tsx`, `prompt-card.spec.tsx` (prompt không có phương án: C7) |
| S11 | Chip cho trạng thái chuẩn bổ sung (H4; PC-05 P1) | Xong | `SUPPLEMENTARY_STATUSES`, kiểu `neutral-dashed` trong `states/statuses.ts`, `styles/shell.css`; test `states.spec.tsx` › bảng nhãn bổ sung |
| S12 | Phát “cần tải lại” khi server báo không còn phát lại được (H5; PC-05 P2) | Xong | `REPLAY_UNAVAILABLE` trong `sse.ts`; tải lại trong `navigation/navigation.ts`; test `sse.spec.ts` › tải lại khi server báo, `navigation.spec.tsx` › tải lại khi cần tải lại |
| S13 | Router gọi GET /auth/session khi điều hướng, mở màn hình (H6, H11) | Xong | tạo: `activity.ts`, `activity.spec.ts`; `touch()` trong `session/session.ts`; `useMarkScreenOpened` trong `hooks.tsx` |
| S14 | Menu avatar “Hồ sơ”, “Đăng xuất”; đăng xuất RP-initiated (H9; PC-05 P3) | Xong | tạo: `topbar/AvatarMenu.tsx`, `logout.spec.tsx`; `signOut()` trong `services.ts` |

Chung cho mọi slice: `apps/web/src/shell/index.ts` (API công khai của shell cho khu vực), `apps/web/src/shell/README.md`, `apps/web/README.md` (cách chạy). Mọi đường dẫn tương đối `apps/web/src/shell/` trừ khi ghi khác.

## 3. Kết quả

- `pnpm --filter @sires/web dev` chạy shell ở http://localhost:5173 (preview `web`); `/` chuyển `/dashboard`. Chưa có gateway hay mock thì khung hiện đủ và vùng làm việc báo “Không kiểm được phiên đăng nhập” kèm mã lỗi.
- Khung: TopBar Global (logo, bộ chuyển ngữ cảnh, sáu tab, Trợ lý, Pending Actions kèm số, chuông kèm số chưa đọc, VI/EN, Settings, menu avatar) và Project (đường dẫn “Global / khu vực”, không tab, không Trợ lý); ProjectRail tám khu vực, số theo khu vực, dòng Plan, Active task; Manuscript không rail; tablet rail xếp lên trên; điện thoại header thu gọn, menu, thanh tab dưới. So với `docs/ui-design/pages/TopBar.html` ở 1440×900: hai nhóm của TopBar có cùng kích thước (980 px và 504 px) và cùng xuống dòng như màn tham chiếu.
- Shell cấp cho khu vực (qua `apps/web/src/shell/index.ts`): đăng ký route và namespace i18n qua `Feature`, `useApi` (client có type từ `PublicApi`), `useEvents`, `useStreamSignal`, `useDraft`, `useMarkScreenOpened`, `useRefreshNavigation`, `StatusChip`, `ExecutionLabel`, `LoadingState`, `LongOperation`, `EmptyState`, `ErrorState`, `PromptCard`, `NotFound`, hàm định dạng; điểm nối mock duy nhất trong `src/main.tsx` cho PID-00013.
- Kết quả kiểm chi tiết ở [self-qc.md](self-qc.md).

## 4. Việc còn lại

- PO merge #120 trước #138 (PR này xếp chồng trên #120).
- Kiểm số trên TopBar, rail với backend thật ở cổng PH-02, PH-03 (H1).

## 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | PO, qua phiên điều phối | “PH-01 đang trong giai đoạn hoàn thiện, các vấn đề còn chưa đạt thì tự đề xuất và hoàn thiện cho xong giúp tôi … Các vấn đề phát sinh hãy chốt theo đề xuất” (26–27/11/2026); PC-05 P1–P5 chốt theo đề xuất | Trong phạm vi: làm S11, S12, S14 theo dạng PC-05 P1–P3 trong lúc PR sửa nguồn chưa merge | Làm (chốt theo đề xuất, PO ủy quyền 26/11/2026) | S11, S12, S14; `states.spec.tsx`, `sse.spec.ts`, `navigation.spec.tsx`, `logout.spec.tsx` |
| YC2 | PO, qua phiên điều phối | “`pnpm --filter @sires/web dev` hiện được shell ở cổng 5173; ghi cách chạy trong README” | Trong phạm vi (cổng Môi trường của trang ticket, spec mục 2.5) | Làm | `apps/web/README.md`, `apps/web/src/shell/README.md`; chạy preview `web` ở cổng 5173 |
| YC3 | PO, qua phiên điều phối | “để một điểm nối duy nhất (ví dụ trong `main.tsx`) cho mock gắn vào”; không tạo `apps/web/src/mocks/**` (PID-00013) | Trong phạm vi: chi tiết kỹ thuật của điểm vào ứng dụng, không đổi AC | Làm | `src/main.tsx` (`import.meta.glob('./mocks/index.ts')`, `startMocks()`); không có thư mục `src/mocks/` |
| YC4 | PO, qua phiên điều phối | “shell cung cấp cơ chế đăng ký route, i18n namespace và component dùng chung (chip trạng thái, loading/empty/error, thẻ prompt, kho nháp), có hướng dẫn ngắn trong README cho khu vực dùng” | Trong phạm vi (quy tắc 1.4.9; S06, S09, S10 đã yêu cầu README) | Làm | `apps/web/src/shell/index.ts`, `apps/web/src/shell/README.md` |

## 6. Cần PO và tài liệu đi kèm

**Đã chốt theo đề xuất (PO ủy quyền 26/11/2026)** — chi tiết hồ sơ không nói tới, ghi lại để PO xem:

| # | Điểm | Đã chốt | Vì sao |
| --- | --- | --- | --- |
| C1 | Dòng Plan và Active task của rail | Lấy từ `getPlan` (bản baseline, không có thì bản đang mở: “Plan v3 · Approved”; không có bản nào: “Chưa có Plan baseline”) và `getTask` (mã, tên); bỏ phần “Phase 2/3” của màn tham chiếu | `getProject` chỉ có `activeTaskId` và `summary.hasApprovedPlan`; Phase cần nội dung Plan Version |
| C2 | Gốc path | Mọi path của OpenAPI dưới `/api/v1`, kể cả `/auth/*` và `/events` | `servers` của `openapi.yaml`; `e2e/fixtures/load.ts` cũng vậy |
| C3 | Form đăng xuất | `POST /api/v1/auth/logout`, `application/x-www-form-urlencoded`, trường `csrfToken`; điều hướng toàn trang để trình duyệt theo 303 | PC-05 P3 chọn 303; form không gửi được header nên CSRF đi trong trường form; đã gửi đề xuất tên trường cho phiên docs-sources |
| C4 | Tín hiệu SSE | `event: replay.unavailable`; có `id` thì dùng làm `Last-Event-ID` tiếp theo, không có thì bỏ id cũ (không lặp tải lại); không giao cho nơi đăng ký | PC-05 P2 |
| C5 | Kiểu Accepted | Viền liền `ink` theo chữ của design.md §3 (“Accepted, Trusted, Completed, Succeeded (ink)”); Supported (bảng H4) viền `brand` như màn Components | Components vẽ Accepted của Artifact viền brand: lệch với design.md, design.md là luật |
| C6 | Số trên TopBar | Pending Actions hiện cả khi 0; chấm số của chuông chỉ khi lớn hơn 0 | Nhãn đọc màn hình của chuông luôn nêu số |
| C7 | Thẻ prompt cho mọi `PromptType` | Thẻ của shell trả lời được cả bốn loại: `choice` (radio), `approval` (“Duyệt”, “Từ chối”), `edit_and_approve` (ô sửa `editablePayload`, “Sửa và duyệt”, “Từ chối”), `information_request` (ô “Câu trả lời”); một callback `onAnswer(PromptResponse)`; nút trong thẻ dùng kiểu viền xanh (hành động trong thẻ quyết định), không dùng nút chính | Lần 2: phiên điều phối ghi nhận từ PR #127 (PID-00058 S05 cần thẻ của shell nhận `edit_and_approve`); màn `Chat` vẽ “Sửa và duyệt” viền xanh; nhiều thẻ trong một màn không được thành nhiều nút chính (design.md §4) |
| C8 | Đăng xuất gặp lỗi khi lấy CSRF | Lỗi mạng, 5xx: giữ phiên, nháp, SSE; menu hiện `ErrorState` “Chưa đăng xuất được” có “Thử lại”. 401 (phiên đã hết): dọn nháp, đóng SSE và vẫn gửi form (trường `csrfToken` rỗng), gateway trả 303 tới `post_logout_redirect_uri` | S14 và hợp đồng `logout` ở #120 |

- **Đề xuất cho PO:**
  1. Hợp đồng: thêm `Event: { $ref: components/schemas/orchestration.yaml#/Event }` vào `components.schemas` của `openapi.yaml` để `PublicApi` sinh type `Event` (hiện chỉ có trong `x-event-schema` của `/events`; brief của PID-00012 ghi là đã sinh được). Shell đang dùng type viết tay, tự chuyển sang type sinh khi có. Đã có ở #120 (commit `702d051`); Lần 2 merge #120 vào nhánh này và `sse.ts` dùng type sinh `components["schemas"]["Event"]`, bỏ type viết tay.
  2. Tickets 1.5, khu vực shell: cột “Path API chính” thêm `GET /projects/{projectId}/plan`, `GET /projects/{projectId}/tasks/{taskId}` (C1), cùng các path H1 đã nêu ở trang ticket mục 5.
  3. design.md §3 và Components: thống nhất kiểu Accepted (C5). Nhánh sửa nguồn ghi rõ “Accepted … (ink)”, khớp với shell; màn Components vẫn vẽ Accepted của Artifact viền brand.
  4. Spec PID-00012 mục 2.4 ghi PID-00007 “Chặn: Có”, trang ticket mục 3 ghi “không chặn (H10)”: sửa spec cho khớp.
- **Yêu cầu hợp đồng:** không có yêu cầu mới ngoài đề xuất 1 (không chặn: có type viết tay).
- **Còn mở:** PR #138 xếp chồng trên #120 (nguồn của S11, S12, S14): PO merge #120 trước, khi đó diff của #138 tự thu lại. Trên nhánh này `check-pid.mjs PID-00012` đã ĐỦ để thực thi.
- **Bước tiếp theo:** QC độc lập chạy `spec-converge-skill PID-00012`; PO merge PR vào `main`; sau khi nhánh sửa nguồn merge: rebase, sinh lại type, chạy lại test.
- **Tài liệu đi kèm:** ảnh shell chạy thật (Vite + gateway giả cục bộ trả dữ liệu như `test/fixtures.ts`), dùng cho S02, S03, S06, S14: `screenshots/01-global-tro-ly-1440.png` (Global, khung Trợ lý), `screenshots/02-project-rail-1440.png` (Project, ProjectRail), `screenshots/03-bo-chuyen-ngu-canh-1440.png`, `screenshots/04-menu-avatar-1440.png` (menu có họ tên, email theo `TopBar--menu-vi` của nhánh sửa nguồn), `screenshots/05-project-en-1440.png` (English), `screenshots/06-tablet-1024.jpg`, `screenshots/07-dien-thoai-390.jpg`, `screenshots/08-dien-thoai-menu-project-390.jpg`, `screenshots/09-route-la-1440.png`.


## Lần 2 — 27/11/2026

Việc sửa theo phiên điều phối và phiên docs-sources (không có `qc-report.md`):

| # | Nguồn | Việc | Đã làm, kiểm bằng |
| --- | --- | --- | --- |
| L2-1 | Phiên điều phối: “merge `origin/docs/pc05-p1-p6-shell-sources` vào nhánh của bạn (merge, không rebase) … ghi trong mô tả PR: xếp chồng trên #120; PO merge #120 trước” | Merge #120 (`66cc148`), sinh lại type | `check-pid.mjs PID-00012`: ĐỦ để thực thi; mô tả PR #138 có dòng xếp chồng |
| L2-2 | Phiên docs-sources: `Event` đã có trong `components.schemas` (#120) | `sse.ts` dùng type sinh, bỏ type viết tay | typecheck sạch; `sse.spec.ts` đạt |
| L2-3 | Phiên docs-sources, S14 ở #120: getSession 401 khi đăng xuất thì vẫn gửi form | `signOut()` gửi form `csrfToken` rỗng sau khi dọn nháp, đóng SSE | `logout.spec.tsx › phiên đã hết khi đăng xuất (GET /auth/session 401): vẫn gửi form…` |
| L2-4 | Phiên điều phối (ghi nhận từ PR #127): thẻ prompt nhận cả `edit_and_approve`, `information_request`, test cho từng loại | `PromptCard` cho đủ bốn `PromptType`, `onAnswer(PromptResponse)` (C7) | `prompt-card.spec.tsx`: mọi loại PromptType (kiểm cả ở mức type), approval, edit_and_approve, renderEditor, information_request, Answered theo loại |
| L2-5 | Phiên điều phối: khu vực tự đăng ký route (ví dụ Agent Run của monitoring), README ghi cách | `apps/web/README.md` mục “Thêm route của khu vực” | rà tay |

Phiên docs-sources ghi `replay.unavailable` luôn có `id` (“0” khi log trống); nhánh xử lý không có `id` giữ lại làm phòng thủ, không đổi hành vi theo hợp đồng.

Kết quả: 112 test đạt (hai lượt song song), typecheck, lint, build đạt, `check-ui.mjs` 0 lỗi, `add-license.mjs --check` sạch (self-qc.md Lần 2). Trạng thái giữ “Xong — chờ QC”.


## Lần 3 — 27/11/2026

Việc sửa theo phiên điều phối (PC-05 P37, chốt theo đề xuất của phiên web-global; không có `qc-report.md`). Nguyên nhân: khi các khu vực dựng màn thật, `renderShell` mở `/dashboard` thật (PID-00037, PID-00060) và Trợ lý thật của global; `/sign-in` là SignIn thật (PID-00036). Test của shell vì thế gọi thêm API của khu vực và thấy thêm `alert`, `status`: 11 test đỏ với #142, 2 với #143.

| # | Nguồn | Việc | Đã làm, kiểm bằng |
| --- | --- | --- | --- |
| L3-1 | Phiên điều phối: “renderShell mặc định dùng bộ feature test của shell … không nạp feature thật của khu vực” | Làm theo cách bền hơn: `renderShell` **giữ** khu vực thật (test của global, settings mở màn thật qua chính hàm này, đổi mặc định sẽ làm đỏ #141–#143); thêm `renderShellFrame` gắn `neutralFeatures` (đủ route và i18n của mọi khu vực, mỗi route là `Placeholder`, không Trợ lý, không mock); mọi test của shell dùng `renderShellFrame` | 10 file spec của shell; `test/render.tsx`, `test/features.tsx` |
| L3-2 | Như trên: Trợ lý thật render trong test của shell | `App` nhận nội dung Trợ lý qua `createRoutes` (prop `assistant`), không tự import `features`; bộ trung tính không có Trợ lý | `App.tsx`, `routes.tsx`; `topbar.spec.tsx › trợ lý` |
| L3-3 | Phiên điều phối: `navigation.spec` lọc `calls` theo query | `FetchStub.calls(path, method, query)`; đếm `notifications?status=Unread&limit=1`, `projects?status=Active`, `pending-actions?limit=1` | `navigation.spec.tsx`, `topbar.spec.tsx` |
| L3-4 | Phiên điều phối: `shellStub` trả 200 rỗng cho GET của khu vực | `/dashboard`, `/provider-connections`, `/workflows`, `/conversations` | `test/stub.ts` |
| L3-5 | Phiên điều phối: hai test `/sign-in` (#143) | Không cần sửa test: `renderShellFrame` đặt Placeholder ở `/sign-in`, không gọi `GET /auth/session`. Commit `eb8ca71` của #143 (sửa hai test này) thành thừa, gộp vẫn sạch | `routes.spec.ts › sign-in không khung (EC17)`, `preferences.spec.ts › chưa đăng nhập không lưu (EC28)` |

Kết quả: trên nhánh này 16 file, 112 test đạt; trên cây gộp thêm `origin/web/global-pid-00060` (`77a9971`, đã gồm #141) và `origin/web/settings-pid-00036` (`eb8ca71`): 33 file, 273 test đạt, typecheck, lint sạch (self-qc.md Lần 3). Trạng thái giữ “Xong — chờ QC”.


## Lần 4 — 27/11/2026

Việc từ `qc-report.md` Lần 2 (G4–G6, LOW) và từ phiên điều phối, rút ra khi dựng PID-00114 (#147), chốt theo đề xuất:

| # | Nguồn | Việc | Đã làm, kiểm bằng |
| --- | --- | --- | --- |
| L4-1 | QC G4 (đột biến M8 lọt) | Test điều hướng `replace` giữa phiên không gọi `GET /auth/session`; điều hướng của người dùng sau đó vẫn tính | `activity.spec.ts › điều hướng replace (chuyển hướng) không gọi GET /auth/session`; M8 nay đỏ |
| L4-2 | QC G5 (M6 lọt; L3-2 ghi quá lời) | Test nội dung Trợ lý đi qua `createRoutes` từ khu vực khai `Feature.assistant` | `topbar.spec.tsx › nội dung Trợ lý lấy từ khu vực…`; M6 nay đỏ |
| L4-3 | QC G6 (M11, M3b lọt) | Test rail không hiện số 0 cạnh số dương; test `refreshCounts` đọc lại số chưa đọc và Pending Actions | `rail.spec.tsx › không hiện số 0…`, `navigation.spec.tsx › refreshCounts…`; M11, M3b nay đỏ |
| L4-4 | Phiên điều phối (PID-00114): “`context.ts` thiếu ánh xạ `claims: 'evidence'`” | `/projects/:id/claims/…` đánh dấu References and Evidence trên rail | `context.ts`; `rail.spec.tsx › route claims thuộc References and Evidence` |
| L4-5 | Phiên điều phối: “Client API chỉ đọc JSON … thêm cách đọc phản hồi không phải JSON (blob hoặc text) mà vẫn giữ CSRF, xử lý lỗi và kiểm phiên” | `api.getBlob`, `api.getText` dùng chung đường gửi với mọi lời gọi (`Accept: */*`, problem+json → `ApiError`, 401 → luồng phiên hết hạn); README ghi cách dùng | `api/client.ts`; `api.spec.ts › getBlob, getText…` |
| L4-6 | Phiên điều phối: “Shell chưa có dialog dùng chung … focus trap, Esc và aria” | `Dialog`, `ConfirmDialog` trong `dialog/Dialog.tsx`, xuất ở `index.ts`, CSS ở `styles/shell.css`, README bảng component | `dialog.spec.tsx` (aria, focus phương án an toàn, Tab và Shift+Tab giữ trong dialog, gõ không mất focus, Esc, trả focus, nút xác nhận vô hiệu khi `busy`, dạng form Enter gửi) |

QC G1 (“Phase 2/3” trên rail) chờ PO xem C1; G2 hết khi #120 vào `main`; G3 do PID-00036 thay màn giữ chỗ `/sign-in`. Các khu vực đang tự làm dialog (planning ở #145) chuyển sang `ConfirmDialog` của shell khi #138 vào `develop`.

Kết quả: 17 file, 121 test đạt; typecheck, lint đạt (self-qc.md Lần 4). Trạng thái giữ “Xong — chờ QC”.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
