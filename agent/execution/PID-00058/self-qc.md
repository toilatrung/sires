# PID-00058 — Self-QC của Dev

**Kết luận:** Đạt — mọi AC có test đạt; lượt đối chiếu độc lập không có CRITICAL, HIGH; 7 MEDIUM và phần lớn LOW đã sửa, phần còn lại ghi ở mục 5

- **Ticket:** [PID-00058](../../../docs/tickets/issues/PID-00058/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build` | Chạy theo project, vì nhánh xếp chồng trên `preview/ui-ph02`: sau khi merge head mới của #138, `pnpm nx run-many -t lint typecheck test build -p @sires/web --skip-nx-cache` đạt — 24 file, 186 test; lint, typecheck, build đạt |
| `pnpm nx run @sires/web:test` | 186 đạt, 0 lỗi; riêng `src/features/project`: 3 file, 39 test đạt |
| `node scripts/docs/add-license.mjs --check` | Đạt (0 file thiếu) |
| `scripts/development/check-tracks.mjs` trên file đã đổi | Chỉ `web/project` (và `agent/execution/PID-00058`) |
| gitleaks (cùng lệnh CI, Docker trong WSL) trên `develop..web/project-pid-00058` | `no leaks found` |
| `check-ui.mjs`, preview (khi có màn hình) | `check-ui.mjs apps/web/src/features/project`: 0 lỗi, 0 cảnh báo. Preview `dev:mock` 1440×900: gửi tin → “Readiness check” hiện dần kèm “Agent Run ar-…”, rồi thay bằng tin đã lưu (một tin); 390×844: Overview, Chat không cuộn ngang. Ảnh: `pid-00058-mock-chat-stream.jpg`, `pid-00058-mock-overview.jpg` (thư mục ghi chú của phiên điều phối) |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00058-AC01 | `chat.spec.tsx › chữ xuất hiện dần (PID-00058-AC01, EC15)` | Đạt |
| PID-00058-AC02 | `prompt.spec.tsx › Answered ở nơi khác (PID-00058-AC02, UX-PROMPT-005-AC01, EC21)` | Đạt |
| UX-OVERVIEW-001-AC01 | `overview.spec.tsx › tiến độ theo Phase (UX-OVERVIEW-001-AC01, EC04)` | Đạt |
| UX-OVERVIEW-002-AC01 | `overview.spec.tsx › chưa có Plan (UX-OVERVIEW-002-AC01, EC01)` | Đạt |
| UX-OVERVIEW-003-AC01 | `overview.spec.tsx › archived chỉ đọc (UX-OVERVIEW-003-AC01, EC02)` | Đạt |
| UX-CHAT-001-AC01 | `chat.spec.tsx › tham chiếu active task (UX-CHAT-001-AC01, EC10)` | Đạt |
| UX-CHAT-002-AC01 | `chat.spec.tsx › tên agent và Agent Run (UX-CHAT-002-AC01, EC17)` | Đạt |
| UX-PROMPT-001-AC01 | `prompt.spec.tsx › thẻ trong luồng (UX-PROMPT-001-AC01, EC20)` | Đạt |
| UX-PROMPT-002-AC01 | `prompt.spec.tsx › không chọn sẵn (UX-PROMPT-002-AC01, EC24)` | Đạt |
| UX-PROMPT-003-AC01 | `prompt.spec.tsx › sửa và duyệt (UX-PROMPT-003-AC01)` | Đạt |
| UX-PROMPT-004-AC01 | `prompt.spec.tsx › Cancelled, Expired (UX-PROMPT-004-AC01, EC23)` | Đạt |
| UX-PROMPT-005-AC01 | `prompt.spec.tsx › Answered ở nơi khác` (cùng test với AC02) | Đạt |
| UX-A11Y-002-AC01 | `prompt.spec.tsx › bàn phím (UX-A11Y-002-AC01)` | Đạt |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | `overview.spec.tsx › chưa có Plan` |
| EC02 | đã giải quyết | `overview.spec.tsx › archived chỉ đọc` |
| EC03 | đã giải quyết | `overview.spec.tsx › banner khôi phục` |
| EC04 | đã giải quyết | `overview.spec.tsx › tiến độ theo Phase` |
| EC05 | đã giải quyết | `overview.spec.tsx › khối bản thảo` |
| EC06 | đã giải quyết | `overview.spec.tsx › sửa research context`, `› sửa research context bị 409` |
| EC07 | đã giải quyết | `chat.spec.tsx › hội thoại đầu tiên` |
| EC08 | đã giải quyết | `chat.spec.tsx › tải tin cũ hơn` |
| EC09 | đã giải quyết | `chat.spec.tsx › gửi tin nhắn` |
| EC10 | đã giải quyết | `chat.spec.tsx › tham chiếu active task` |
| EC11 | đã giải quyết | `chat.spec.tsx › bỏ active task` |
| EC12 | đã giải quyết | `chat.spec.tsx › nháp` |
| EC13 | đã giải quyết | `chat.spec.tsx › đang trả lời` |
| EC14 | đã giải quyết | `chat.spec.tsx › delta trùng, sai thứ tự` |
| EC15 | đã giải quyết | `chat.spec.tsx › chữ xuất hiện dần` |
| EC16 | đã giải quyết | `chat.spec.tsx › mất SSE giữa stream` |
| EC17 | đã giải quyết | `chat.spec.tsx › tên agent và Agent Run` (cả Analysis Agent B) |
| EC18 | đã giải quyết | `chat.spec.tsx › nhãn thảo luận` |
| EC19 | đã giải quyết | `chat.spec.tsx › nội dung có HTML` |
| EC20 | đã giải quyết | `prompt.spec.tsx › thẻ trong luồng`, `› lỗi tải thẻ có Thử lại` |
| EC21 | đã giải quyết | `prompt.spec.tsx › Answered ở nơi khác` |
| EC22 | đã giải quyết | `prompt.spec.tsx › trả lời trễ 409` |
| EC23 | đã giải quyết | `prompt.spec.tsx › Cancelled, Expired` |
| EC24 | đã giải quyết | `prompt.spec.tsx › không chọn sẵn`, `› sửa và duyệt`, `› bàn phím` |
| EC25 | không xảy ra | Thẻ của shell nhận đủ bốn loại (approval, choice, edit_and_approve, information_request; PID-00012 Lần 2), không phải dừng |
| EC26 | đã giải quyết | `prompt.spec.tsx › đề xuất thảo luận thẻ chuẩn`; thẻ riêng của PID-00084 vào bằng một dòng ở PR merge sau |
| EC27 | đã giải quyết | `chat.spec.tsx › archived chỉ đọc`; prompt Open hiện Expired khi project Archived (`PromptInline.tsx`) |
| EC28 | đã giải quyết | `chat.spec.tsx › lỗi provider` |
| EC29 | đã giải quyết | `chat.spec.tsx › khung context`, `› khung context khi chưa có gì` |
| EC30 | đã giải quyết (thao tác tay) | preview 1440×900, 390×844; khung context xếp xuống dưới 1280 px (`project.css`) |
| EC31 | đã giải quyết | `chat.spec.tsx › đổi ngôn ngữ, đang tải, lỗi`, `› đang tải và lỗi tải` |
| Mới | cần lưu ý | Fixture dùng chung không có Plan cho mọi project: `getPlan` 404 được hiểu là chưa có Plan (Overview, khung context) |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện. (Prompt chỉ gửi sau khi Researcher xác nhận.)
- [x] Chuyển trạng thái khớp PRD 18.2 — không áp dụng (web không chuyển trạng thái nghiệp vụ).
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project. (Mọi lệnh theo `projectId`; sự kiện lọc theo `projectId`, delta lọc theo `conversationId`.)
- [x] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi. (Không hiện `message` của provider — `› lỗi provider`.)
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design`.
- [x] Sự kiện ghi qua outbox — không áp dụng (web).
- [x] Migration — không áp dụng (web).
- [x] Giao diện theo `docs/ui-design/design.md`; có trạng thái trống, đang tải, lỗi, chạy lâu.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5.
- [x] Không còn mã gỡ lỗi (`console.log`, `print`), TODO không có chủ; test mới có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Lượt đọc độc lập: một agent đọc hồ sơ ở `docs/pid-00058-00059-clarify` và mã, không dựa vào báo cáo này; kết quả 0 CRITICAL, 0 HIGH, 7 MEDIUM, 8 LOW. Dev kiểm lại từng mục trong mã, sửa, chạy lại test.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | contradicts | MEDIUM | Số Indexed đọc sai trường qua ép kiểu, luôn 0 | `Chat.tsx` (`ContextPanel`) | Sửa: `reference.indexingStatus` có type; `chat.spec.tsx › khung context` ra “14 · 12 Indexed” |
| G2 | partial | MEDIUM | Lọc Task đang hoạt động dùng “Needs Review” không phải TaskStatus | `Overview.tsx` (`ACTIVE`) | Sửa: `In Review` và cờ `needsReview`, type `TaskStatus`. Slice S02 ghi “Needs Review”: đề xuất PO sửa chữ ở hồ sơ |
| G3 | partial | MEDIUM | Dòng “đang trả lời” không tắt khi có `message.posted` mà không có delta | `Chat.tsx` | Sửa; `› tin đã lưu kết thúc dòng đang trả lời` |
| G4 | contradicts | MEDIUM | Prompt Open tự đổi Expired ở client khi Archived | `PromptInline.tsx` | Sửa: chỉ theo `prompt.status_changed` → getPrompt; `prompt.spec.tsx › Expired khi project lưu trữ` |
| G5 | partial | MEDIUM | Tín hiệu `reload` chỉ đọc lại tin nhắn | `PromptInline.tsx`, `Chat.tsx` | Sửa: thẻ prompt và khung context cũng đọc lại |
| G6 | partial | MEDIUM | Thanh tiến độ Phase không có phần tô | `Overview.tsx` (`PhaseProgress`) | Sửa theo markup của shell (`sires-progress__fill`, `data-progress`) |
| G7 | partial | MEDIUM | Bố cục Overview khác màn tham chiếu | `Overview.tsx`, `project.css` | Sửa: context full width, Plan rộng cạnh cột phụ, Task đang hoạt động full width, loại việc chờ, “4/4 Completed”. Còn thiếu (LOW, để QC độc lập/PO xem): thông tin bản thảo ở đầu trang, agent của Task, phân bổ trạng thái dưới mỗi Phase |
| G8 | missing | LOW | Không gọi `listContextVersions` | `Overview.tsx` | Để lại: form sửa đọc version hiện hành từ `getSharedContext`; lịch sử version không có ở màn tham chiếu |
| G9 | partial | LOW | Khóa Idempotency của research context không theo nội dung | `Overview.tsx` | Sửa: khóa theo nội dung gửi |
| G10 | partial | LOW | Delta trễ sau khi thay bản nháp tạo bản nháp ma | `Chat.tsx` | Sửa: nhớ `seq` theo Agent Run; `› chữ xuất hiện dần` kiểm thêm |
| G11 | partial | LOW | Tải tin cũ không giữ vị trí cuộn | `Chat.tsx` | Sửa: bù chiều cao đã chèn |
| G12 | partial | LOW | Trống, đang tải chưa dùng component của shell | `Chat.tsx`, `PromptInline.tsx` | Sửa: `EmptyState`, `LoadingState` |
| G13 | partial | LOW | Nhãn trường `title` thô; tên đối tượng thô | `PromptInline.tsx` | Sửa: `fieldLabels`, tên đối tượng theo i18n |
| G14 | partial | LOW | Khu vực chưa thêm fixture theo màn tham chiếu (T-2.3, Plan v3) | `__mocks__` | Để lại: dùng dữ liệu demo dùng chung của PID-00013 (T02…); kịch bản delta trùng, mất kết nối có trong test, chưa có trên dev |
| G15 | partial | LOW | `refresh` lỗi không được bắt | `Chat.tsx` | Sửa |
| UI | partial | LOW | Tin của Researcher, bán kính banner, chip giả định, `aria-live`, nhãn ô nhập | `project.css`, `Chat.tsx`, `Overview.tsx` | Sửa theo màn tham chiếu: bong bóng brand-tint bên phải, banner bo 8px, tiêu đề khôi phục màu warn, chip `proposed-brand`, `aria-live="polite"` cho luồng, nhãn ẩn và placeholder “Nhắn Orchestrator…”, lý do vô hiệu nối `aria-describedby` |

## Lần 2 — 27/11/2026

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run-many -t lint typecheck test build -p @sires/web` | Đạt; `npx vitest run`: 25 file, 206 test (project 4 file, 57 test gồm `deliberation-card/card.spec.tsx` của PID-00084) |
| `check-ui.mjs apps/web/src/features/project` | 0 lỗi, 0 cảnh báo |
| gitleaks trên dải commit của nhánh | Sạch |

- Thay đổi: `PromptInline.tsx` dùng `DeliberationCard` khi `isDeliberationProposal(prompt)`, còn lại `PromptCard`; `__mocks__/index.ts` ghép fixture `openProposal`, `proposalMessage`, `skippedResultMessage`. Test prompt giới hạn override `getPrompt` vào prompt đang test (luồng nay có thêm đề xuất thảo luận).
- Test mới: `chat.spec.tsx › bỏ qua thảo luận ra nhãn Không qua thảo luận (PID-00084-AC01)` — bấm “Bỏ qua” trên thẻ trong Chat gửi `{ choiceIds: ['skip'] }`, tin kết quả của Orchestrator mang nhãn “Không qua thảo luận”.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
