# PID-00036 — Báo cáo QC độc lập

> Bản chép của báo cáo QC chéo từ phiên web-shell (27/11/2026). Key mẫu của mục G1 được che (`sk-test-QC…`) để quét secret của CI không báo nhầm.

Cách dùng: nhánh chưa có `qc-report.md`. Tạo `agent/execution/PID-00036/qc-report.md` theo khung `PID-Template/qc-report.md`, với dòng “Kết luận mới nhất” và mục “Lần 1” dưới đây.

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH (4 MEDIUM, 7 LOW) ở `6a346dc` (Lần 1, 27/11/2026). 14/14 AC có test đúng tên ở hồ sơ, assertion phủ đủ Given–When–Then. Khu vực có 6 file, 82/82 test; toàn `@sires/web` 26 file, 220/220 test; typecheck và eslint sạch. Chạy thật trên `dev:mock`: không cuộn ngang ở 390 px, không lỗi console. Key chỉ hiện dạng che trong DOM, URL, storage và request (H7). Riêng log `[MSW]` của mock dùng chung in nguyên key ra console (G1, việc của PID-00013). Còn lệch so với màn tham chiếu ở SignIn và Agent Models (G3, G4). Test chưa khóa `type="password"` (G2). Các điểm này không chặn merge; merge sau #120, #138, #131, #122, #126.

- **Ticket:** [PID-00036](../../../docs/tickets/issues/PID-00036/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 27/11/2026 · spec-converge-skill

Người chạy: phiên QC do PO `toilatrung` giao, không mang kết luận của Dev. Mã nguồn: PR #143, nhánh `web/settings-pid-00036` → `develop`, commit `6a346dcf47c84364c6d7fcfacc187a60cc15d935`. Kiểm trong worktree tách riêng (detached). Sau khi kiểm, `git status` sạch.

Phạm vi theo giao việc: `apps/web/src/features/settings/**` và `agent/execution/PID-00036/`. Hồ sơ đã đọc: #122 (`origin/docs/pid-00036-clarify`, `c417ab2`) và #126 (`origin/docs/pid-00036-sources`, `d53da71`): trang ticket, `specs/index.html`, `acceptance.html` (14 AC), `scope.html` (P1–P16, N1–N9, EC01–EC54), slice S01–S07, `designs/notes.html`. Cũng đã đọc `design.md`, README của shell, README mock, màn tham chiếu `SignIn*` và `Settings*` ở `docs/ui-design/pages/`.

**Phần thuộc PID trên nhánh.** Các commit không phải merge trong `origin/preview/ui-ph02..HEAD` chỉ sửa `features/settings/**` và `agent/execution/PID-00036/**`. Ngoại lệ là `eb8ca71`, sửa hai test của shell; commit này đã revert ở `89f112b`, nên thay đổi ròng ở `apps/web/src/shell` bằng 0. `c417ab2`, `d53da71` là hồ sơ của #122, #126.

Merge `8c39474` (#126 vào nhánh) giải xung đột ở 17 file trong `docs/` và `taskboard.html`. Các file này gộp thay đổi của cả hai phía (ví dụ `15-settings-and-sign-in.yaml` giữ cả `logout` của #120 và mã lỗi đăng nhập của #126). Merge `dc9da2b` (#138 `3b63522`) không giải xung đột nào.

So với `develop`, diff của PR có 333 file, vì nhánh xếp chồng trên #120, #138, #131, #122, #126. `git merge-tree` với `origin/preview/ui-ph02` (`1df54a9`, đã có #138 `33454e7`) và với `origin/develop`: không xung đột.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | AGENT-PROVIDER-002-AC01 (“console … không chứa” key), H7, NFR-SECRETS-001 | partial (ngoài mã của PID) | MEDIUM | Chạy `dev:mock`, tạo kết nối với key `sk-test-QC…(che)`. Console in `Request {… body: {"…","apiKey":"sk-test-QC…(che)"}}` từ `msw.js:242`, tức log request mặc định của MSW. Key sai `sk-test-WRONG-0001` khi sửa kết nối cũng bị in như vậy. Nguyên nhân: `apps/web/src/shell/mock/browser.ts:37` gọi `worker.start({ onUnhandledFrame: 'bypass', … })` mà không có `quiet`. Mã của khu vực không log key: Vitest (`providers.spec.tsx:113-140`) theo dõi console và đạt; bản build không có mock | Không sửa ở PID này (điểm dừng: mock dùng chung). Chuyển PID-00013: `quiet: true`, hoặc che `apiKey` trong log của `createProviderConnection`, `updateProviderConnection`. Tới lúc đó, khi thử trên mock chỉ nhập key giả |
| G2 | H7 (`type="password"`, `autocomplete="off"`, không nút hiện key); PID-00036-AC01 (“key chỉ ở dạng che”) | partial (test) | MEDIUM | Mã đúng: `Providers.tsx:334-345`, trên trình duyệt thấy `type=password`, `autocomplete=off`. Nhưng không test nào kiểm hai thuộc tính này. Đã thử đột biến: đổi thành `type="text"`, `autoComplete="on"`, `providers.spec.tsx` vẫn đạt 28/28. Đột biến bỏ `setApiKey('')` thì 3 test đỏ, nghĩa là phần xóa key đã được khóa | Thêm assertion `type`, `autocomplete` của ô API key vào `providers.spec.tsx › key sai Invalid kèm hành động` (hoặc `› key không lộ`) |
| G3 | UX-AUTH-001, S02 (“theo SignIn”); màn tham chiếu `SignIn`, `SignIn--state-session-expired` | partial (giao diện) | MEDIUM | So ở 1440×900: thẻ thiếu logo SIRES ở đầu (`SignIn.tsx:72-76`). Nút chính thiếu mũi tên →. Banner phiên hết hạn tô `brand-tint` viền xanh (`SignIn.tsx:87`, `settings.css:215`); màn tham chiếu dùng kiểu trung tính. Dòng chân trang nằm sát thẻ thay vì ở đáy trang (`settings.css:196`, `:218`). Câu chữ, nút 48 px, khung lỗi, 390 px đều đúng | Thêm logo (asset của shell, nếu chưa có thì báo phiên điều phối) và icon mũi tên. Banner session-expired dùng kiểu trung tính như màn tham chiếu. Đặt chân trang ở đáy trang |
| G4 | S06 (“theo SettingsAgents”); design.md §5; màn tham chiếu `SettingsAgents` | partial (giao diện, Dev để ngỏ) | MEDIUM | Khối Mặc định chỉ có chữ và nút “Sửa” (`Agents.tsx:127-136`); màn tham chiếu chọn kết nối, model ngay trong khối. Panel “Đang sửa” hiện dưới bảng (`Agents.tsx:201-211`) chứ không ngay dưới dòng, và không nhận focus khi mở (`AssignmentEditor`, `Agents.tsx:233` trở đi, không có effect focus). Ở 1440×900, bấm “Sửa” của Evidence Retrieval Agent thì panel nằm ngoài màn, người dùng bàn phím hay trình đọc màn hình không biết panel đã mở. Cột Trạng thái hiện “—” thay cho “Sẵn sàng” (`Agents.tsx:186-187`); cảnh báo không có icon. Embedding là một panel riêng, không phải dòng cuối của bảng | Đặt panel sửa ngay dưới dòng đang sửa, như màn tham chiếu (hoặc ít nhất cuộn tới và focus vào tiêu đề panel khi mở). PO chọn: dựng khối Mặc định bằng select như màn tham chiếu, hoặc chấp nhận lệch và sửa nguồn thiết kế |
| G5 | S02–S07 mục “Kiểm” (“check-ui … không có lỗi ở apps/web/src/features/settings/”) | contradicts (phụ) | LOW | `check-ui.mjs apps/web/src` báo `ERROR preferences.spec.tsx:154 [colour] #126` ở tên `describe('Preferences sau #126 và tự QC')`. Đây là báo nhầm: “#126” là số PR. Nhưng tiêu chí xong của slice là 0 lỗi, và self-qc.md ghi “0 lỗi” | Đổi tên describe (ví dụ “sau sửa nguồn PR 126”), hoặc báo chủ skill để check-ui bỏ qua chuỗi trong test |
| G6 | EC02, EC21, EC23, EC35, EC36 | partial (test) | LOW | Test có đúng tên, nhưng thiếu một phần “xử lý mong đợi”. `› lỗi tải` không kiểm menu Settings vẫn dùng được. `› lệnh kiểm tra lỗi` không kiểm chip của dòng vẫn `Valid`. `› sửa key gửi apiKey` không kiểm kết nối về `Untested` trước khi kiểm. `› hủy` không kiểm không có request. `› nháp` chỉ dựng lại view, không giả lập phiên hết hạn (Dev đã ghi). Mã xử lý đúng ở cả năm chỗ (đọc mã và thử tay) | Bổ sung assertion vào các test trên |
| G7 | design.md §4–§5; màn tham chiếu `SettingsProviders`, `--state-first-connection`; P1 (“trống … bằng component dùng chung của shell”) | partial (giao diện) | LOW | “Thêm kết nối” là nút viền (`Providers.tsx:96`); màn tham chiếu tô xanh nút này, còn “Kiểm tra kết nối” trong form là nút viền (impl ngược lại, `Providers.tsx:366`). Cột Thao tác dùng nút có viền, “Xóa” viền đỏ; màn tham chiếu dùng liên kết chữ. Khối trống viền đứt brand, form viền liền; màn tham chiếu ngược lại. Khối trống tự dựng (`Providers.tsx:104-109`, `Agents.tsx:113-121`), không dùng `EmptyState` của shell | Theo màn tham chiếu: nút chính và kiểu viền; dùng `EmptyState({ title, reason, action })` của shell |
| G8 | Dialog design.md §4; S04 (“dùng được bằng bàn phím”) | partial | LOW | Dialog xóa kết nối đang gán đặt focus vào radio đầu tiên (“OpenAI cá nhân”), không vào phương án an toàn “Giữ kết nối” (`shared.tsx:90-93` lấy phần tử focus được đầu tiên). Không có lựa chọn nào bị chọn sẵn. Dialog khôi phục ngưỡng và dialog đổi embedding thì focus đúng vào “Giữ …”. `aria-modal`, bẫy Tab, Escape, trả focus về nút “Xóa” đều đạt trên trình duyệt | Cho `Dialog` nhận phần tử focus ban đầu, đặt vào nút hủy. Hoặc chuyển sang `Dialog`/`ConfirmDialog` của shell khi #138 `33454e7` vào nhánh (xem G10) |
| G9 | design.md §6 (câu chữ) | partial | LOW | Mô tả ngưỡng hiện tên trường hợp đồng cho người dùng: `claimSupport.supported: điểm tối thiểu…` (`i18n/vi.json:218, 220, 222`); màn tham chiếu ghi câu thường. `agents.embedding.dialog.countN` bản en: “{{count}} References” nên khi có 1 Reference sẽ ra “1 References” | Bỏ đường dẫn trường khỏi câu; dùng dạng số nhiều của i18next (`_one`, `_other`) |
| G10 | Public API của shell; README mock của #131 bản mới; #138 Lần 4 | quy ước | LOW | Điều kiện mock `import.meta.env.DEV && import.meta.env.MODE !== 'production'` (`index.tsx:32`) đúng, và `build.spec.ts` đạt. `isMockMode()` ở `SignIn.tsx:22-24` lặp lại điều kiện này. `origin/web/mock-pid-00013-v3` đã có `mockEnabled` ở `shell/index.ts`. `Dialog` tự dựng ở `shared.tsx:87-135`; shell đã có `Dialog`, `ConfirmDialog` từ #138 `33454e7`, nhưng nhánh này mới gộp `3b63522` | Sau khi #131, #138 bản mới vào nhánh: dùng `mockEnabled` của shell, và dùng `Dialog`/`ConfirmDialog` của shell thay cho bản tự dựng |
| G11 | Quy tắc 1.4.1; docs-write rule (R-01–R-07) | quy trình | LOW | `check-tracks --base origin/preview/ui-ph02`: 3 luồng (contracts-spec, web/settings, web/shell), vì có nhiều merge base. Diff so với `develop` có `docs/` của #120, #122, #126 và 17 file `docs/` do merge `8c39474` giải xung đột (theo yêu cầu YC2 của phiên điều phối, file sinh dựng lại bằng công cụ). Nhánh dựng trên #138 `3b63522`; #138 nay ở `33454e7` (đẩy lúc 03:59, sau commit cuối của PR lúc 03:25) | Merge theo thứ tự #120 → #138 → #131 → #122 → #126 → #143. Sau khi #126 vào, kiểm lại diff `docs/` của #143 về 0 và chạy lại test của khu vực trên #138 bản mới |

Không có CRITICAL, HIGH.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00036-AC01 | Đạt | stub (Vitest, mock), thêm thao tác tay | `providers.spec.tsx › key sai Invalid kèm hành động (PID-00036-AC01, EC19)` | Đạt. Test kiểm: chip Invalid, `auth_failed`, câu của SIRes, “Mã lỗi:”, “Lưu” vô hiệu, “Sửa API key” đưa focus vào ô key, ô key rỗng, placeholder `••••••••0001`, DOM và storage không có key. Trên trình duyệt cũng thấy đúng như vậy. `type=password` chưa có test (G2) |
| PID-00036-AC02 | Đạt | stub, thêm thao tác tay | `signin.spec.tsx › oidc_unavailable`; `› login_cancelled (EC06)`; `› mã lạ (EC07)`; `› tiếng Anh theo namespace settings` | Đạt. Có tiêu đề, “Chưa có dữ liệu nào bị thay đổi”, liên hệ quản trị, “Mã lỗi: oidc_unavailable”, nút bấm được. Mã lạ hiện như login_failed, chữ thường, không chèn HTML (đã thử `<b>X</b>` trên trình duyệt) |
| UX-AUTH-001-AC01 | Đạt | stub, thêm thao tác tay | `signin.spec.tsx › chỉ một hành động (UX-AUTH-001-AC01)` | Đạt. Một nút, không có ô nhập, liên kết đăng ký hay Google. `browser.assign` tới `/api/v1/auth/login?returnTo=%2Fdashboard` |
| UX-AUTH-002-AC01 | Đạt | stub | `signin.spec.tsx › oidc_unavailable (PID-00036-AC02, UX-AUTH-002-AC01, EC05)` | Đạt |
| UX-SETTINGS-001-AC01 | Đạt | stub, thêm thao tác tay | `profile.spec.tsx › lần đầu (UX-SETTINGS-001-AC01, EC29)` | Đạt. “Nguyễn Thảo”, email chỉ đọc kèm “do eTroy quản lý”, công tắc Tắt, không có ô mật khẩu, không có “Đổi ảnh đại diện” |
| UX-SETTINGS-001-AC02 | Đạt | stub, thêm thao tác tay | `profile.spec.tsx › URL Scholar sai (UX-SETTINGS-001-AC02, EC30)` | Đạt. Hiện đúng câu lỗi, `aria-invalid`, không có `PATCH /me/profile` |
| UX-SETTINGS-002-AC01 | Đạt | stub | `providers.spec.tsx › chỉ ba provider, chưa kiểm không Valid (UX-SETTINGS-002-AC01)` | Đạt. Ba lựa chọn đúng thứ tự; Untested và Invalid thì “Lưu” vô hiệu; Valid chỉ có sau khi kiểm tra |
| UX-SETTINGS-002-AC02 | Đạt (phần Settings) | stub, thêm thao tác tay | `providers.spec.tsx › trống hướng dẫn (UX-SETTINGS-002-AC02, EC13)` | Đạt |
| UX-SETTINGS-003-AC01 | Đạt | stub, thêm thao tác tay | `agents.spec.tsx › đổi embedding xác nhận (UX-SETTINGS-003-AC01, EC46)` | Đạt. Chỉ có “OpenAI cá nhân” và hai model embedding. Dialog nêu model cũ → mới, “38 Reference phải index lại toàn bộ.” (`indexedReferenceCount` của #126), usage trên kết nối. “Giữ model hiện tại” không gửi request |
| UX-SETTINGS-004-AC01 | Đạt (phần giao diện) | stub, thêm thao tác tay | `preferences.spec.tsx › debug (UX-SETTINGS-004-AC01, EC49)` | Đạt. Hiện “Bật · lưu tới” ngày hôm nay + 30, ba ý giải thích, gửi `{"debugMode":true}` |
| UX-SETTINGS-005-AC01 | Đạt (phần giao diện) | stub, thêm thao tác tay | `preferences.spec.tsx › khôi phục mặc định (UX-SETTINGS-005-AC01, EC51)` | Đạt. Hủy dialog thì không gửi; xác nhận thì gửi `reset`, hiện 0,80 / 0,50, mất “đã chỉnh”, bỏ sửa chưa lưu |
| NFR-PRIV-001-AC01 | Đạt (phần giao diện) | stub, thêm thao tác tay | `providers.spec.tsx › thông báo kết nối đầu tiên (NFR-PRIV-001-AC01, EC13)` | Đạt. “Kiểm tra kết nối” vô hiệu tới khi đánh dấu ô; đã có kết nối thì không có khối này |
| AGENT-PROVIDER-002-AC01 | Đạt ở mức stub; lưu ý G1 | stub, thêm thao tác tay | `providers.spec.tsx › key không lộ (AGENT-PROVIDER-002-AC01, EC25)` | Vitest đạt: DOM, URL, storage, console, request khác lệnh tạo đều không có key. Trên trình duyệt: DOM, giá trị ô nhập, URL, storage không có key; chỉ `POST /provider-connections` mang key; không phản hồi nào chứa key; bảng hiện `••••••••9z7x`, tải lại trang vẫn vậy. Riêng console của `dev:mock` có key do MSW của shell in (G1) |
| AGENT-PROVIDER-002-AC03 | Đạt (phần giao diện) | stub, thêm thao tác tay | `providers.spec.tsx › xóa cần thay thế (AGENT-PROVIDER-002-AC03, EC27)` | Đạt. Liệt kê Writing Agent; nút xóa vô hiệu tới khi chọn; gửi `replacementConnectionId` của OpenAI cá nhân. Trên trình duyệt, dialog giống `SettingsProviders--state-delete` |

**Edge case.** Đủ 54/54 EC, mỗi EC có test đúng tên ở `scope.html` (riêng EC04 là thao tác tay). Đã đọc từng test của 6 file. Thiếu một phần ở EC02, EC21, EC23, EC35, EC36 (G6). EC04 kiểm ở mục trình duyệt.

**Shell API.** Mã của khu vực chỉ import từ `../../shell` và `@sires/contracts`. Test import thêm `shell/mock`, `shell/mock/node`, `shell/test/*`; `__mocks__/index.ts` import `shell/mock` như README mock hướng dẫn. Route và i18n đi qua `Feature`. Mock đặt trong `Feature.mocks` có điều kiện đúng (`build.spec.ts` đạt). Bốn ô Profile đăng ký `useDraft` (EC36); form kết nối không đăng ký (H7). Chip trạng thái dùng `StatusChip`. Ghi có `If-Match` ở `updateProfile`, `updatePreferences`, `updateVerificationThresholds`, `updateProviderConnection`; hợp đồng không yêu cầu Idempotency-Key cho 16 operation này. Xử lý 412 (đọc lại, giữ giá trị đang nhập) và 409 (`duplicate_name`, `connection_in_use`). Mock giữ đúng 16 operation, không trùng `getSession`, `getMe`, và không giữ key.

**sires-ui-review: Đạt có điều kiện.** Token, bo góc, chuyển động đều đạt: dialog `sires-dialog-in 0.4s` lấy từ `motion.css` của shell. Không cuộn ngang ở 390 px. Mỗi màn tối đa một nút chính. Các lệch bố cục, component so với màn tham chiếu ở G3, G4 (mức Major theo thang của sires-ui-review), G7–G9 (Minor). `check-ui`: 1 lỗi báo nhầm (G5), 4 cảnh báo hợp lệ (avatar 32 px, bóng của dialog).

### Trình duyệt

Kiểm trên `vite --mode mock --port 5181` bằng Playwright, Chromium 1255. Ảnh lưu ở `scratchpad/qc-143-shots/`. Đã so cạnh nhau với `docs/ui-design/pages/*.html` ở cùng khổ.

| Màn / trạng thái | Khổ | `scrollWidth` | Lỗi console | Ghi chú |
| --- | --- | --- | --- | --- |
| `/settings/profile` | 1440, 1024, 390 | 1440, 1024, 390 | không | Giống `SettingsProfile`; ở 390 menu lên trên |
| `/settings/providers` | 1440, 1024, 390 | 1440, 1024, 390 | không | Bảng cuộn trong thẻ ở 390. Lệch ở G7 |
| `/settings/agents` | 1440, 1024, 390 | 1440, 1024, 390 | không | Lệch bố cục ở G4 |
| `/settings/preferences` | 1440, 1024, 390 | 1440, 1024, 390 | không | Giống `SettingsPreferences--debug`; ba ngưỡng có “Mặc định 0,80…” |
| `/sign-in?error=oidc_unavailable` | 1440, 1024, 390 | không cuộn ngang | không | Nút 48 px. Lệch ở G3 |
| `/sign-in?error=login_cancelled`, `?error=<b>X</b>` | 1440 | 1440 | không | Mã lạ hiện dạng chữ |
| `/sign-in?returnTo=/dashboard` (getSession 401) | 1440, 1024, 390 | không cuộn ngang | chỉ 401 do QC chủ động gây ra | Bấm nút ở chế độ mock: đi tới `returnTo` (EC12) |
| `/sign-in?reason=session-expired` (getSession 401) | 1440, 1024, 390 | không cuộn ngang | chỉ 401 do QC chủ động gây ra | Banner tô xanh, màn tham chiếu trung tính (G3) |
| Providers: sửa Gemini, key sai | 1440 | — | không | Invalid, `auth_failed`, “Sửa API key” đưa focus vào ô `password`, placeholder `••••••••0001` |
| Providers: tạo kết nối, Lưu, tải lại trang | 1440 | — | key có trong log `[MSW]` (G1) | Key không có trong DOM, ô nhập, URL, storage hay phản hồi; request mang key chỉ có `POST /provider-connections` |
| Providers: trống, kết nối đầu tiên | 1440 | — | không | Có `role=note`; “Kiểm tra kết nối” vô hiệu |
| Dialog xóa “Claude cá nhân” | 1440 | — | không | `aria-modal=true`, rộng 480 px, focus vào radio đầu tiên (G8); Escape trả focus về nút “Xóa kết nối Claude cá nhân” |
| Dialog đổi embedding, dialog khôi phục ngưỡng | 1440 | — | không | Focus vào “Giữ model hiện tại” / “Giữ ngưỡng hiện tại” |
| Profile URL Scholar sai | 1440 | — | không | Giống `SettingsProfile--state-invalid-url` |
| Providers tiếng Anh | 1440 | — | không | Nhãn đổi, dữ liệu giữ nguyên |

Chưa kiểm: reduced motion (chỉ đo dialog 0,4 s; `motion.css` của shell đã có nhánh reduced motion), độ tương phản bằng công cụ, trình đọc màn hình thật.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt, exit 0 (1 phút 32 giây) |
| `npx tsc -p tsconfig.json --noEmit` (apps/web) | Lần đầu lỗi TS2307 `@sires/contracts` (worktree mới chưa sinh type, lỗi môi trường). Sau `pnpm --filter @sires/contracts generate:ts`, `build` và `node src/shell/mock/generate.mjs` (shell 165, settings 16 operation): exit 0 |
| `npx eslint src/features/settings` | 0 lỗi, 0 cảnh báo theo luật. Có cảnh báo “No cached ProjectGraph”, nên `@nx/enforce-module-boundaries` bị bỏ qua khi chạy ngoài nx |
| `npx vitest run src/features/settings --maxWorkers=2` | 6 file, 82/82 đạt |
| `npx vitest run --maxWorkers=2` | 26 file, 220/220 đạt (gồm `shell/mock/build.spec.ts`) |
| `node agent/skills/qc/sires-ui-review/scripts/check-ui.mjs apps/web/src` | 1 lỗi, 13 cảnh báo. Trong `features/settings`: 1 lỗi (G5, báo nhầm), 4 cảnh báo hợp lệ |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu giấy phép |
| `node scripts/development/check-tracks.mjs --base origin/preview/ui-ph02` | 3 luồng, do nhánh xếp chồng (G11). Commit riêng của PID chỉ chạm `web/settings` |
| `check-pid.mjs PID-00036 --root <dir>` (hồ sơ `c417ab2` cộng thư mục thực thi) | ĐỦ để thực thi. 2 cảnh báo: thư mục tạm không có `LICENSES.md`; trạng thái đã là “Xong — chờ QC” |
| `check-pid.mjs PID-00036 --root <dir> --result` | KẾT QUẢ ĐỦ (0 cảnh báo) |
| `git merge-tree --write-tree HEAD origin/preview/ui-ph02`; `… origin/develop` | Không xung đột |
| Đột biến M1: ô key `type="text"`, `autoComplete="on"`, chạy `providers.spec.tsx` | 28/28 vẫn đạt: không test nào bắt (G2). Đã hoàn nguyên bằng `git checkout --` |
| Đột biến M2: bỏ `setApiKey('')` sau lệnh tạo, sửa | 3 test đỏ: đã được khóa. Đã hoàn nguyên |
| Playwright trên `vite --mode mock --port 5181` | Xem mục Trình duyệt. Đã tắt server sau khi kiểm |
| `pnpm nx affected -t lint typecheck test build` | Không chạy: giao việc yêu cầu không chạy trên máy dùng chung. Thay bằng các lệnh từng phần ở trên |

### Lệch với Self-QC

- `self-qc.md` mục 1 ghi `check-ui … features/settings: 0 lỗi, 4 cảnh báo`. QC chạy ở `6a346dc` thấy 1 lỗi, do tên describe có “#126”, thêm từ `0d01fce` (G5).
- `self-qc.md` ghi preview `dev:mock` “console không lỗi”. Đúng là không có lỗi, nhưng console có key do log `[MSW]` in ra. Dev không nêu điểm này (G1).
- `self-qc.md` mục 2 ghi AC01 đạt. Đúng, nhưng test chưa khóa `type="password"` (G2).
- `self-qc.md` mục 5, điểm UI cuối, Dev để ngỏ bố cục Agent Models. QC xếp MEDIUM và thêm việc panel không nhận focus (G4).
- `report.md` ghi “đã merge head mới của #138 `3b63522`”. Đúng lúc ghi (03:25); sau đó #138 lên `33454e7` (03:59) (G11).
- Phần còn lại khớp với QC: số test 82 và 220; lint, typecheck; 14 AC; 54 EC có test; key không lộ trong mã của khu vực; mock 16 operation; điều kiện mock; revert test của shell.

### Việc còn lại, theo thứ tự phụ thuộc

1. Thêm assertion `type="password"`, `autocomplete="off"` cho ô API key (G2, PID-00036-AC01, H7).
2. Agent Models: đặt panel sửa ngay dưới dòng đang sửa, focus vào panel khi mở; dựng khối Mặc định như màn tham chiếu, hoặc chờ PO chấp nhận lệch (G4, S06).
3. SignIn: thêm logo, icon mũi tên; banner phiên hết hạn kiểu trung tính; chân trang ở đáy trang (G3, S02).
4. Đổi tên describe có “#126” để `check-ui` sạch (G5).
5. Bổ sung assertion cho EC02, EC21, EC23, EC35 (G6).
6. Sửa nhỏ: nút chính và kiểu viền của Provider Connections, dùng `EmptyState` của shell (G7); focus ban đầu của dialog xóa (G8); câu mô tả ngưỡng và số nhiều tiếng Anh (G9).
7. Sau khi #131, #138 bản mới vào nhánh: dùng `mockEnabled` và `Dialog`/`ConfirmDialog` của shell (G10).
8. Việc của PID-00013, không phải Dev của PID này: tắt hoặc che log request của MSW với lệnh mang `apiKey` (G1).
9. Merge theo thứ tự ở G11, rồi kiểm lại diff `docs/` và chạy test của khu vực trên #138 bản mới (G11).

Không việc nào chặn merge.

### Đề xuất cho PO

- **PID-00013 (mock dùng chung):** `worker.start({ quiet: true })`, hoặc che `apiKey` trong log (G1). Trên `dev:mock`, mọi khu vực có ô nhập bí mật đều gặp chuyện này.
- **Hợp đồng:** đồng ý với hai đề xuất của Dev ở `report.md` mục 6, đều không chặn: `updateProviderConnection` khai `409 duplicate_name`; có schema riêng cho thân merge-patch.
- **Thiết kế:** chốt bố cục Agent Models (G4). Hoặc Dev làm theo `SettingsAgents`, hoặc PO chấp nhận khối Mặc định dạng chữ + “Sửa” và panel dưới bảng, rồi sửa nguồn thiết kế.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
