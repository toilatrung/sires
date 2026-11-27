# PID-00036 — Self-QC của Dev

**Kết luận:** Đạt (Lần 2) — QC chéo của phiên web-shell ĐẠT; 3 MEDIUM của khu vực đã sửa, G1 thuộc mock dùng chung; toàn `@sires/web` 231/231

- **Ticket:** [PID-00036](../../../docs/tickets/issues/PID-00036/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build` | Chạy theo project, vì nhánh xếp chồng trên `preview/ui-ph02`: `pnpm nx run-many -t lint typecheck test build -p @sires/web` (kèm `generate-mocks`, `@sires/contracts:generate-ts`, `build`) sau merge dc9da2b: lint, typecheck, build đạt; test 26 file, 220/220 đạt. Trước merge đó hai test của shell (EC17, EC28) đỏ vì bám placeholder `sign-in`; #138 `3b63522` đã tách test shell khỏi màn thật |
| `pnpm nx run @sires/web:test` | 220 đạt, 0 lỗi; riêng `src/features/settings`: 6 file, 82 test đạt |
| `node scripts/docs/add-license.mjs --check` | Đạt (0 file thiếu) |
| `scripts/development/check-tracks.mjs` trên file đã đổi | Mã: chỉ `web/settings`. Nhánh còn có `docs/` của #122, #126 do merge theo yêu cầu của phiên điều phối; không phải file Dev sửa |
| `check-ui.mjs`, preview (khi có màn hình) | `check-ui.mjs apps/web/src/features/settings`: 0 lỗi, 4 cảnh báo (bo 32 px của avatar, bóng `--sires-shadow-float` của dialog — đúng design.md §2.3, §4). Preview `dev:mock` ở 1440×900, 1024×768, 390×844: không cuộn ngang trang, bảng cuộn trong thẻ, nút SignIn 48 px, console không lỗi. Ảnh trong thư mục ghi chú của phiên điều phối: `pid-00036-mock-providers-invalid.jpg`, `pid-00036-mock-providers-table.jpg`, `pid-00036-mock-providers-delete.jpg`, `pid-00036-mock-preferences-defaults.jpg` |

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
| UX-SETTINGS-003-AC01 | `agents.spec.tsx › đổi embedding xác nhận (UX-SETTINGS-003-AC01, EC46)` | Đạt (câu “38 Reference phải index lại toàn bộ.” theo `indexedReferenceCount` của #126) |
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
| EC04 | đã giải quyết (thao tác tay) | preview `dev:mock` ở 1440×900, 1024×768, 390×844: không cuộn ngang trang, menu lên trên dưới 768 px, bảng cuộn trong thẻ, nút SignIn 48 px |
| EC05 | đã giải quyết | `signin.spec.tsx › oidc_unavailable` |
| EC06 | đã giải quyết | `signin.spec.tsx › login_cancelled` |
| EC07 | đã giải quyết | `signin.spec.tsx › mã lạ` (login_failed dùng chung khung) |
| EC08 | đã giải quyết | `signin.spec.tsx › phiên hết hạn`, `› phiên hết hạn cùng lỗi chỉ hiện lỗi` |
| EC09 | đã giải quyết | `signin.spec.tsx › đã có phiên chuyển đi` |
| EC10 | đã giải quyết | `signin.spec.tsx › returnTo không hợp lệ` |
| EC11 | đã giải quyết | `signin.spec.tsx › bấm hai lần` |
| EC12 | đã giải quyết | `signin.spec.tsx › chế độ mock (EC12)` (`VITE_SIRES_MOCK=1`); thêm thao tác tay trên `dev:mock` |
| EC13 | đã giải quyết | `providers.spec.tsx › trống hướng dẫn`, `› thông báo kết nối đầu tiên` |
| EC14 | đã giải quyết | `providers.spec.tsx › base URL theo provider`, `› provider khóa sau khi tạo` |
| EC15 | đã giải quyết | `providers.spec.tsx › base URL sai` |
| EC16 | đã giải quyết | `providers.spec.tsx › proxy Valid` |
| EC17 | đã giải quyết | `providers.spec.tsx › tên trùng` |
| EC18 | đã giải quyết | `providers.spec.tsx › lỗi trường` (400 máy chủ), `› lỗi trường trên máy khách` |
| EC19 | đã giải quyết | `providers.spec.tsx › key sai Invalid kèm hành động` |
| EC20 | đã giải quyết | `providers.spec.tsx › lỗi tạm thời`, `› hạn mức`, `› sửa base URL` (không hiện `lastError.message`) |
| EC21 | đã giải quyết | `providers.spec.tsx › đang kiểm tra`, `› lệnh kiểm tra lỗi` |
| EC22 | đã giải quyết | `providers.spec.tsx › đóng form khi Invalid` |
| EC23 | đã giải quyết | `providers.spec.tsx › sửa về Untested` (chỉ tên, không gửi `apiKey`), `› sửa key gửi apiKey` |
| EC24 | đã giải quyết | `providers.spec.tsx › không có model` (form và bảng), `agents.spec.tsx › nhập tay` |
| EC25 | đã giải quyết | `providers.spec.tsx › key không lộ` |
| EC26 | đã giải quyết | `providers.spec.tsx › xóa`, `› dialog bàn phím (S04)` |
| EC27 | đã giải quyết | `providers.spec.tsx › xóa cần thay thế`, `› không có kết nối Valid khác` |
| EC28 | đã giải quyết | `providers.spec.tsx › 409 connection_in_use`, `› 409 mở lại với agent mới` |
| EC29 | đã giải quyết | `profile.spec.tsx › lần đầu` |
| EC30 | đã giải quyết | `profile.spec.tsx › URL Scholar sai` |
| EC31 | đã giải quyết | `profile.spec.tsx › giới hạn độ dài` |
| EC32 | đã giải quyết | `profile.spec.tsx › xóa trắng` (URL Scholar `null`, đơn vị chuỗi rỗng) |
| EC33 | đã giải quyết | `profile.spec.tsx › hai lệnh`, `› hai lệnh, lệnh sau lỗi` |
| EC34 | đã giải quyết | `profile.spec.tsx › 412`, `preferences.spec.tsx › 412`, `› 412 khi lưu ngưỡng` |
| EC35 | đã giải quyết | `profile.spec.tsx › hủy` |
| EC36 | cần lưu ý | `profile.spec.tsx › nháp` dựng lại view, không giả lập phiên hết hạn; khôi phục sau đăng nhập là của kho nháp shell (PID-00012 S09), shell đã có test |
| EC37 | đã giải quyết | `agents.spec.tsx › chưa có kết nối Valid` |
| EC38 | đã giải quyết | `agents.spec.tsx › chỉ kết nối Valid` |
| EC39 | đã giải quyết | `agents.spec.tsx › lọc model`, `› embedding chỉ kết nối có model embedding` |
| EC40 | đã giải quyết | `agents.spec.tsx › nhập tay` (nhãn “chưa xác minh”), `› model không còn trong danh sách` (422) |
| EC41 | đã giải quyết | `agents.spec.tsx › cảnh báo năng lực` |
| EC42 | đã giải quyết | `agents.spec.tsx › cùng model A B` |
| EC43 | đã giải quyết | `agents.spec.tsx › dùng mặc định` |
| EC44 | đã giải quyết | `agents.spec.tsx › chưa cấu hình` |
| EC45 | đã giải quyết | `agents.spec.tsx › embedding lần đầu` |
| EC46 | đã giải quyết | `agents.spec.tsx › đổi embedding xác nhận` |
| EC47 | đã giải quyết | `agents.spec.tsx › làm mới danh sách model`, `› làm mới trả Invalid` |
| EC48 | đã giải quyết | `preferences.spec.tsx › ngôn ngữ sau khi lưu`, `› lưu lỗi giữ ngôn ngữ` |
| EC49 | đã giải quyết | `preferences.spec.tsx › debug` |
| EC50 | đã giải quyết | `preferences.spec.tsx › ngưỡng sai`, `› lỗi trường ngưỡng từ máy chủ` |
| EC51 | đã giải quyết | `preferences.spec.tsx › khôi phục mặc định` |
| EC52 | đã giải quyết | `preferences.spec.tsx › ngưỡng mặc định từng dòng` (có `defaults` sau #126), `› chưa có giá trị mặc định` (nhánh thiếu `defaults`) |
| EC53 | đã giải quyết | `preferences.spec.tsx › hai lệnh`, `› ETag mới sau khi lưu ngưỡng` |
| EC54 | đã giải quyết | `providers.spec.tsx › tên có HTML`, `profile.spec.tsx › tên có HTML` |
| Mới | cần lưu ý | Mẫu `mocks: import.meta.env.DEV ? …` trong README mock (PID-00013) đưa mock của khu vực vào bản build khi `NODE_ENV=development`. Khu vực dùng điều kiện của `src/mocks/index.ts`; phiên điều phối đã báo phiên web-mocks |
| Mới | cần lưu ý | Override trả status mà operation không khai (503, hoặc 409 của `updateProviderConnection`) mất thân Problem ở runtime của PID-00013; test và mock dùng `Response` (report.md mục 6) |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện. (Không có APR trong khu vực.)
- [x] Chuyển trạng thái khớp PRD 18.2 — không áp dụng (web không chuyển trạng thái nghiệp vụ; `testStatus` do backend đặt).
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project.
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi. (Web không gọi model; `› key không lộ`, `› sửa base URL` kiểm không hiện `lastError.message`.)
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design`.
- [x] Sự kiện ghi qua outbox — không áp dụng (web).
- [x] Migration — không áp dụng (web).
- [x] Giao diện theo `docs/ui-design/design.md`; có trạng thái trống, đang tải, lỗi, chạy lâu.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`. Đã revert phần sửa test của shell (89f112b). `docs/` trên nhánh chỉ đến từ merge #122, #126 theo yêu cầu của phiên điều phối (xung đột giải theo quy tắc, file sinh chạy lại công cụ).
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5.
- [x] Không còn mã gỡ lỗi (`console.log`, `print`), TODO không có chủ; test mới có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Lượt đọc độc lập: một agent đọc hồ sơ ở `docs/pid-00036-clarify` và mã, không dựa vào báo cáo này. Kết luận lúc đó là “chưa sẵn sàng”: 1 HIGH, 5 MEDIUM, 6 LOW. Dev kiểm lại từng mục trong mã, sửa, rồi chạy lại test.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | contradicts | HIGH | Sửa hai test của shell, trái điểm dừng | commit eb8ca71 | Revert ở 89f112b; báo phiên điều phối kèm cách sửa |
| G2 | partial | MEDIUM | ETag của ngưỡng không làm mới sau PUT, reset → lần lưu sau gửi `If-Match` cũ | `Preferences.tsx` (`thresholdsEtag`) | Sửa: header, không có thì đọc lại `GET`; `› ETag mới sau khi lưu ngưỡng` |
| G3 | partial | MEDIUM | Đã tạo kết nối mà ô Provider vẫn đổi được | `Providers.tsx` (`disabled={!!saved}`) | Sửa; `› provider khóa sau khi tạo` |
| G4 | partial | MEDIUM | Model nhập tay không ghi “chưa xác minh” | `Agents.tsx` (nhãn ô nhập tay) | Sửa; `agents.spec.tsx › nhập tay` |
| G5 | partial | MEDIUM | 400 khi lưu ngưỡng không chỉ ra ô lỗi | `Preferences.tsx` (`thresholdKeyOf`) | Sửa; `› lỗi trường ngưỡng từ máy chủ` |
| G6 | partial | MEDIUM | Ô lỗi thiếu viền danger 1,5 px | `settings.css` (`[aria-invalid="true"]`) | Sửa |
| G7 | partial | LOW | Chọn embedding liệt kê kết nối không có model embedding | `Agents.tsx` (`embeddingChoices`) | Sửa; `› embedding chỉ kết nối có model embedding` |
| G8 | partial | LOW | Câu Invalid thiếu ảnh hưởng, lời nhắc H6, nhãn “Mã lỗi:” | `Providers.tsx` (`TestResult`), i18n | Sửa; `› hạn mức`, `› sửa base URL`, `› key sai…` |
| G9 | partial | LOW | “Làm mới” trả Invalid không có hành động | `Agents.tsx` (`ProviderProblem`) | Sửa: liên kết “Sửa ở Provider Connections”; `› làm mới trả Invalid` |
| G10 | partial | LOW | Banner cùng model thiếu model, kết nối, câu của thiết kế | `Agents.tsx`, i18n | Sửa; `› cùng model A B` |
| G11 | missing | LOW | Thiếu test chế độ mock (EC12) và bàn phím của dialog (S04) | `signin.spec.tsx`, `providers.spec.tsx` | Thêm `› chế độ mock (EC12)`, `› dialog bàn phím (S04)` |
| G12 | partial | LOW | Mock trả 400 không thân cho tên trùng khi sửa; Analysis hiện hai lần | `__mocks__/index.ts`, `Providers.tsx` | Sửa: 409 `duplicate_name` bằng `Response`; mỗi agent một lần |
| UI | partial | LOW | Núm công tắc; nút trong bảng 32 px; dialog không giữ focus; lỗi không nối `aria-describedby`; mono sai chỗ; ô ngôn ngữ; câu 412 lặp | `settings.css`, `shared.tsx`, các view | Sửa: núm tròn 9 px, nút cỡ mặc định 40 px, bẫy focus và trả focus, `aria-describedby`, câu ghép đúng khung “Đã lưu:”, “Chưa lưu:”, “Làm gì tiếp:” |
| UI | partial | LOW | Khối Mặc định của Agent Models là chữ + “Sửa” thay cho select ngay trong khối; panel sửa nằm dưới bảng, không dưới dòng | `Agents.tsx` | Để lại, chờ QC độc lập/PO: hành vi đủ theo H13, chỉ khác bố cục |

## Lần 2 — 27/11/2026

Sau QC chéo của phiên web-shell ở `6a346dc` (ĐẠT, 0 CRITICAL, 0 HIGH, 4 MEDIUM, 7 LOW; [qc-report.md](qc-report.md)). Lịch sử nhánh dựng lại sạch cho gitleaks (`web/settings-pid-00036-v2`, cùng cây với bản trước), rồi merge head mới của #138 (`b157d02`).

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run-many -t lint typecheck test build -p @sires/web` | Đạt — 27 file, 231 test; Settings 6 file, 82 test |
| `check-ui.mjs apps/web/src/features/settings` | 0 lỗi, 1 cảnh báo (bo 32 px của avatar, đúng design.md) |
| gitleaks (cùng lệnh CI) trên dải commit của nhánh | Sạch |
| Preview `dev:mock` 1440×900 | SignIn có logo, nút có mũi tên, chân trang ở đáy; panel sửa Agent Models mở ngay dưới dòng và nhận focus |

| G (qc-report) | Mức | Đã xử lý |
| --- | --- | --- |
| G1 (MSW in key ra console) | MEDIUM | Thuộc mock dùng chung, phiên điều phối đã giao phiên web-mocks |
| G2 (thiếu test `type="password"`, `autocomplete="off"`) | MEDIUM | Thêm vào `providers.spec.tsx › key sai Invalid kèm hành động` |
| G3 (SignIn thiếu logo, banner sai kiểu) | MEDIUM | Logo của shell, mũi tên trên nút, banner phiên hết hạn kiểu trung tính, chân trang ở đáy; `signin.spec.tsx › chỉ một hành động` kiểm logo |
| G4 (panel sửa Agent Models lệch, không nhận focus) | MEDIUM | Panel mở ngay dưới dòng đang sửa, cuộn tới và focus vào tiêu đề; cột Trạng thái ghi “Sẵn sàng”. Khối Mặc định dựng bằng select như màn tham chiếu: chờ PO chọn (qc-report G4) |
| G5 (check-ui báo nhầm “#126”) | LOW | Đổi tên `describe` |
| G7 (kiểu nút, khối trống) | LOW | “Thêm kết nối” là nút chính, “Kiểm tra kết nối” nút viền, “Lưu” nút chính; thao tác trong bảng là liên kết chữ; khối trống dùng `EmptyState` của shell |
| G8, G10 (Dialog tự dựng, focus ban đầu) | LOW | Dùng `Dialog` (focus vào “Giữ kết nối”) và `ConfirmDialog` của shell; bỏ Dialog tự dựng và CSS của nó |
| G9 (câu chữ ngưỡng, số nhiều) | LOW | Bỏ đường dẫn trường khỏi mô tả ngưỡng; `countN_one`, `countN_other` |
| G6, G11 | LOW | Để lại: G6 là assertion phụ của test đã có; G11 là hệ quả của merge theo yêu cầu (YC2) |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
