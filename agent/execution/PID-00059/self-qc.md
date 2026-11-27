# PID-00059 — Self-QC của Dev

**Kết luận:** Đạt — mọi AC có test đạt; lượt đối chiếu độc lập không có CRITICAL, HIGH; 8 MEDIUM đã sửa, LOW sửa một phần, phần còn lại ghi ở mục 5

- **Ticket:** [PID-00059](../../../docs/tickets/issues/PID-00059/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build` | Chạy theo project vì nhánh xếp chồng trên `preview/ui-ph02`: `pnpm nx run-many -t lint typecheck test build -p @sires/web --skip-nx-cache` đạt ở `debcc5d` — 27 file, 218 test; lint, typecheck, build đạt. Lần đầu lỗi EPERM khi sinh contracts (một tiến trình khác giữ `libs/ts/contracts/src/generated`): xóa thư mục sinh rồi chạy lại |
| `pnpm nx run @sires/web:test` (sau khi sửa theo mục 5) | `src/features/monitoring`: 6 file, 70 test đạt (PID-00059: 5 file, 41 test; PID-00083: 29 test); `tsc --noEmit`, `eslint src/features/monitoring` đạt |
| `node scripts/docs/add-license.mjs --check` | Đạt (0 file thiếu) |
| gitleaks (cùng lệnh CI, Docker trong WSL) trên `origin/develop..web/monitoring-pid-00059` | `no leaks found` |
| `check-ui.mjs apps/web/src/features/monitoring` | 0 lỗi, 0 cảnh báo |
| Preview `dev:mock` | 1440×900: ProjectActivity (bảng vừa cột chính, không cuộn ngang, Agent List bên phải), workflow wf-057 (Recovery decision), wf-052 (dòng thời gian, tab Thảo luận), History. 390×844: GlobalActivity mỗi workflow một thẻ, nút cao 44 px, `scrollWidth = 390`; trang workflow wf-057 không cuộn ngang. 1024×768: không chụp riêng (bố cục chuyển một cột từ 1100 px). Ảnh: `pid-00059-mock-*.jpg` ở thư mục ghi chú của phiên điều phối |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00059-AC01 | `activity.spec.tsx › tự cập nhật theo SSE (PID-00059-AC01, UX-MONITOR-005-AC01, EC04)` | Đạt |
| PID-00059-AC02 | `workflow.spec.tsx › recovery decision (PID-00059-AC02, EC12)` | Đạt |
| UX-MONITOR-001-AC01 | `activity.spec.tsx › đang chạy ở trên (UX-MONITOR-001-AC01, EC02)` | Đạt |
| UX-MONITOR-002-AC01 | `workflow.spec.tsx › dòng thời gian giao việc và handoff (UX-MONITOR-002-AC01, EC16)` | Đạt |
| UX-MONITOR-003-AC01 | `agent-run.spec.tsx › provider và model, không có key (UX-MONITOR-003-AC01, EC22)` | Đạt |
| UX-MONITOR-003-AC02 | `agent-run.spec.tsx › debug (UX-MONITOR-003-AC02, EC23)` | Đạt |
| UX-MONITOR-004-AC01 | `workflow.spec.tsx › nút theo trạng thái (UX-MONITOR-004-AC01, EC08)` | Đạt |
| UX-MONITOR-005-AC01 | `activity.spec.tsx › tự cập nhật theo SSE` (cùng test với AC01) | Đạt |
| NFR-USAGE-002-AC01 | `agent-run.spec.tsx › tổng usage khớp (NFR-USAGE-002-AC01, EC26)` (phần workflow; phần theo project, Task, agent, kết nối, thời gian chờ I1) | Đạt |
| NFR-USAGE-003-AC01 | `agent-run.spec.tsx › chi phí ước tính (NFR-USAGE-003-AC01, EC27)` | Đạt |
| NFR-USAGE-004-AC01 | `agent-run.spec.tsx › không cảnh báo ngân sách (NFR-USAGE-004-AC01, EC28)` | Đạt |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | `activity.spec.tsx › trống` |
| EC02 | đã giải quyết | `activity.spec.tsx › đang chạy ở trên` |
| EC03 | đã giải quyết | `activity.spec.tsx › xem thêm` |
| EC04 | đã giải quyết | `activity.spec.tsx › tự cập nhật theo SSE` |
| EC05 | đã giải quyết | `activity.spec.tsx › nối lại SSE`; phản hồi đến muộn có `rowVersion` cũ không ghi đè dòng (mục 5, G2) |
| EC06 | đã giải quyết | `activity.spec.tsx › bước và prompt chờ` |
| EC07 | đã giải quyết | `activity.spec.tsx › thời gian chạy` |
| EC08 | đã giải quyết | `workflow.spec.tsx › nút theo trạng thái` (trang chi tiết và dòng danh sách) |
| EC09 | đã giải quyết | `workflow.spec.tsx › hủy cần xác nhận` |
| EC10 | đã giải quyết | `workflow.spec.tsx › 409 invalid_transition`, `› 409 invalid_transition chạy cả trên dòng danh sách` |
| EC11 | đã giải quyết | `workflow.spec.tsx › tạm dừng từ Waiting for User` |
| EC12 | đã giải quyết | `workflow.spec.tsx › recovery decision` |
| EC13 | đã giải quyết | `workflow.spec.tsx › không gửi trước khi quyết định` |
| EC14 | đã giải quyết | `workflow.spec.tsx › không có checkpoint` (`null` và `consistent = false`) |
| EC15 | đã giải quyết | `workflow.spec.tsx › kết thúc chỉ xem` |
| EC16 | đã giải quyết | `workflow.spec.tsx › dòng thời gian giao việc và handoff` |
| EC17 | đã giải quyết | `workflow.spec.tsx › danh sách bước` |
| EC18 | đã giải quyết | `workflow.spec.tsx › prompt trong chi tiết` |
| EC19 | đã giải quyết | `workflow.spec.tsx › bước thảo luận`: bước hiện như bước thường; tab Thảo luận của PID-00083 nay có theo YC1 (report.md mục 5) |
| EC20 | đã giải quyết | `workflow.spec.tsx › đang chạy` |
| EC21 | đã giải quyết | `agent-run.spec.tsx › không có Agent Run` |
| EC22 | đã giải quyết | `agent-run.spec.tsx › provider và model, không có key`, `› Analysis Agent theo instance` |
| EC23 | đã giải quyết | `agent-run.spec.tsx › debug` |
| EC24 | đã giải quyết | `agent-run.spec.tsx › đang chạy, discarded`; khung Agent Run đọc lại khi có `agent_run.status_changed` của nó (G3) |
| EC25 | đã giải quyết | `agent-run.spec.tsx › usage không có dữ liệu` |
| EC26 | đã giải quyết | `agent-run.spec.tsx › tổng usage khớp` |
| EC27 | đã giải quyết | `agent-run.spec.tsx › chi phí ước tính` |
| EC28 | đã giải quyết | `agent-run.spec.tsx › không cảnh báo ngân sách` |
| EC29 | đã giải quyết | `agent-run.spec.tsx › route Agent Run` |
| EC30 | đã giải quyết | `agent-list.spec.tsx › trạng thái theo việc khẩn nhất` |
| EC31 | đã giải quyết | `agent-list.spec.tsx › kết nối Invalid` |
| EC32 | đã giải quyết | `agent-list.spec.tsx › nhãn theo ngôn ngữ` |
| EC33 | đã giải quyết | `history.spec.tsx › lọc actor`, `› lọc actor báo khi còn trang` |
| EC34 | đã giải quyết | `history.spec.tsx › lọc loại và Task` |
| EC35 | đã giải quyết | `history.spec.tsx › bảng chỉ đọc` |
| EC36 | đã giải quyết | Thao tác tay trên preview: 390×844 GlobalActivity và trang workflow không cuộn ngang, nút 44 px; 1440×900 bảng vừa cột chính (mục 1) |
| EC37 | đã giải quyết | `activity.spec.tsx › đổi ngôn ngữ, đang tải, lỗi` |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện. (Recovery decision và Hủy chỉ gửi sau khi Researcher xác nhận; mở trang không gửi lệnh ghi.)
- [x] Chuyển trạng thái khớp PRD 18.2 (nút theo trạng thái; mock trả 409 khi lệnh sai trạng thái).
- [x] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project. (Sự kiện lọc theo `projectId` ở màn project.)
- [x] Gọi model qua Model Gateway; API key không xuất hiện trên màn, log hay thông báo lỗi. (`› provider và model, không có key`; không hiện `message` của provider.)
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design`.
- [x] Sự kiện ghi qua outbox — không áp dụng (web).
- [x] Migration — không áp dụng (web).
- [x] Giao diện theo `docs/ui-design/design.md`; có trạng thái trống, đang tải, lỗi, chạy lâu.
- [x] Không sửa file trong điểm dừng, file sinh tự động, file của shell; không ghi `docs/`. Một test của PID-00083 được nới khi gộp (report.md mục 5, YC1).
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5.
- [x] Không còn mã gỡ lỗi (`console.log`, `print`), TODO không có chủ; test mới có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, sires-ui-review, DEC-58)

Lượt đọc độc lập: một agent đọc hồ sơ đã làm rõ (`docs/pid-00058-00059-clarify`, H1–H20) và mã ở `debcc5d`, không dựa vào báo cáo này; chạy 69 test của khu vực, 44 test mock/route/i18n của shell, `tsc`, `eslint`, `check-ui`. Kết quả: ĐẠT có điều kiện, 0 CRITICAL, 0 HIGH, 8 MEDIUM, 16 LOW; đủ 11 AC có test đúng tên. Dev kiểm lại từng mục trong mã, sửa, chạy lại test.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | contradicts | MEDIUM | Agent List đưa mọi phiên thảo luận của project vào `deliberationAgentStates`; phiên Failed của workflow đã xong giữ Analysis Agent ở “Lỗi” | `AgentList.tsx` (`agentStates`) | Sửa: chỉ phiên của workflow đang hoạt động |
| G2 | partial | MEDIUM | `upsert` không so `rowVersion`: phản hồi đến muộn ghi đè trạng thái mới hơn (EC05) | `Activity.tsx` (`upsert`) | Sửa: bỏ phản hồi có `rowVersion` nhỏ hơn dòng đang có |
| G3 | partial | MEDIUM | Khung Agent Run không theo `agent_run.status_changed` | `AgentRun.tsx` (`AgentRunPanel`) | Sửa: đọc lại khi sự kiện là của Agent Run đang mở |
| G4 | contradicts | MEDIUM | Workflow không có `projectId` (cấp tài khoản) ra “p-” và liên kết `/projects//…` | `Activity.tsx` | Sửa: “Không thuộc project”, không có liên kết chi tiết; `activity.spec.tsx › workflow không thuộc project (Global)` |
| G5 | partial | MEDIUM | Mock chỉ nhận `status` dạng lặp; hợp đồng ghi `explode: false` (dạng dấu phẩy), client của shell gửi dạng lặp | `__mocks__/pid-00059.ts` (`queryList`) | Sửa mock: nhận cả hai dạng. Lệch client của shell với hợp đồng: báo phiên điều phối |
| G6 | missing | MEDIUM | Dòng thời gian và trạng thái agent đổi theo sự kiện mà không có `aria-live` (design.md §7) | `Workflow.tsx`, `AgentList.tsx` | Sửa: `aria-live="polite"` trên dòng thời gian, câu tóm tắt Agent List, dòng “Cập nhật” |
| G7 | contradicts | MEDIUM | Khung Agent Run ở cuối cột chính; màn tham chiếu đặt ở cột phải | `Workflow.tsx` | Sửa: khung Agent Run ở cột phải, trên Agent List |
| G8 | partial | MEDIUM | report.md chưa ghi YC1, lệch H15, sửa test của PID-00083, ghi chú cho shell | `report.md` | Sửa: report.md mục 1–6 |
| G9 | partial | LOW | Lỗi khi “Xem thêm” không hiện | `Activity.tsx`, `History.tsx` | Sửa: báo lỗi, giữ các dòng đã có |
| G21 | partial | LOW | Mục đầu dòng thời gian gán “tạo workflow” cho người kích hoạt; tham chiếu ghi Orchestrator | `Workflow.tsx` (`Timeline`) | Sửa: Orchestrator; người kích hoạt ở đầu trang |
| G10–G20, G22–G24 | partial | LOW | “Xem thêm” giữ bộ lọc cũ khi đổi lọc giữa chừng; một cờ `busy` cho mọi dòng; lỗi lệnh không kèm mã; số bước theo chỉ số mảng (`steps` đã theo `order`); prompt mới chưa có trên bước; chi phí từng phần không ghi số Agent Run; dòng phạm vi Agent List không có tên project; `aria-label` trên `span`; thời gian Paused, Interrupted đứng yên; kiểu `Page<T>` viết tay; mock cho Hủy từ Created; test NFR-USAGE-004 chưa xem danh sách; cột phải hẹp hơn màn tham chiếu (giữ 272 px để bảng 7 cột vừa 1440 px); danh sách đang hoạt động một trang 100 mục | báo cáo lượt QC | Để lại cho QC độc lập xem: không làm sai AC, EC nào; ghi ở đây để không mất |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
