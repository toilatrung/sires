# PID-00058 — Self-QC của Dev

**Kết luận:** (điền sau lượt đối chiếu)

- **Ticket:** [PID-00058](../../../docs/tickets/issues/PID-00058/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build` | Chạy theo project, vì nhánh xếp chồng trên `preview/ui-ph02`: `pnpm nx run-many -t lint typecheck test build -p @sires/web` đạt — 23 file, 173 test; lint, typecheck, build đạt |
| `pnpm nx run @sires/web:test` | 173 đạt, 0 lỗi; riêng `src/features/project`: 3 file, 35 test đạt |
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
- [ ] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH. (đang chạy)

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

(điền sau lượt đối chiếu)

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
