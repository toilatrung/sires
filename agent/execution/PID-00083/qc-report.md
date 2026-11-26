# PID-00083 — Báo cáo QC độc lập

**Kết luận mới nhất:** CHƯA ĐẠT tại `0c9c7c8`: 0 CRITICAL, 2 HIGH (G1: chuỗi i18n thêm vào `monitoring/i18n/` thay vì `monitoring/deliberation/`, S01:39; G2: prompt quyết định Expired/Cancelled hiện như đã chọn), 4 MEDIUM, 6 LOW (Lần 1, 27/11/2026, đã gồm kiểm trên ảnh của Dev; tab chưa có route)

- **Ticket:** PID-00083 — tab Thảo luận trong chi tiết workflow. Hồ sơ chuẩn: PR #134, commit `d2edf24` (`docs/tickets/issues/PID-00083/**`, đọc bằng `git show d2edf24:…`).
- **PR:** #148 vào `develop`, nhánh `web/monitoring-pid-00083`, head `0c9c7c8`. Phần của PID này là diff `3c05b2d...0c9c7c8` (15 file: 10 file `apps/web/src/features/monitoring/**`, 5 file `agent/execution/PID-00083/**`).
- **Kết quả của Dev:** `agent/execution/PID-00083/report.md`, `implement.md`, `self-qc.md` (trong nhánh PR).

QC chạy độc lập với Dev, chỉ đọc: không sửa mã, không sửa `docs/`, không commit. Worktree `H:\Troy University\sires\.claude\worktrees\qc-pid-00083` (detached ở `0c9c7c8`).

## Lần 1 — 27/11/2026 · spec-converge-skill (kèm phần kiểm tĩnh của sires-ui-review)

Người chạy: phiên QC do PO giao. Mã nguồn: nhánh `web/monitoring-pid-00083`, commit `0c9c7c8`. Nguồn ý định: hồ sơ `d2edf24` (ticket, brief, scope, acceptance, spec, slice S01–S04, designs/notes); PRD, `docs/docs_context.md` ở `d2edf24`; `docs/api-design` ở `0c9c7c8`; thiết kế `docs/ui-design/source/Workflow.dc.html`, `AgentList.dc.html`, `docs/ui-design/design.md`. Quyền sở hữu file của PID-00059 đối chiếu thêm bản đã làm rõ ở PR #127 (`origin/docs/pid-00058-00059-clarify`, `9d38c2b`) vì bản ở `d2edf24` chưa làm rõ.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | Đầu ra O1; S01 (`d2edf24` `specs/slices/S01-tab-mock.html:39`: “Chuỗi i18n trong namespace `monitoring`, file của PID này đặt trong `apps/web/src/features/monitoring/deliberation/`”); quy ước không sửa file của PID-00059 (phiên điều phối, 27/11/2026); quy tắc 1.4.13 | contradicts | HIGH | `apps/web/src/features/monitoring/i18n/vi.json:2-105`, `en.json:2-105` (thêm 103 khóa `deliberation.*`). Hai file này là Đầu ra của PID-00059 (#127 `PID-00059/specs/slices/S01-area-frame-mock.html:37`). PR của PID-00059 viết lại cả hai file nên sẽ xung đột, không còn là “PR merge sau thêm một dòng import” | Chuyển khóa sang file riêng của PID trong `monitoring/deliberation/` (ví dụ `deliberation/i18n/vi.json`, `en.json`), xuất từ `deliberation/index.ts` (ví dụ `deliberationMessages`); trả `monitoring/i18n/*.json` về như `3c05b2d`; `testing.tsx` nạp messages cho test; ghi dòng gộp messages trong `monitoring/index.tsx` vào mục “Dòng nối” của PR |
| G2 | design.md:156 (prompt Expired, Cancelled “luôn ghi ‘Không được tính là đồng ý’”); brief “agent đề xuất, Researcher quyết định”; H7; EC15 | contradicts | HIGH | `deliberation/DeliberationTab.tsx:277-281`: mọi trạng thái khác `Open` đều vào `Chosen`; `:329-335`: tiêu đề “Bạn đã chọn”, người chọn mặc định “Bạn” khi không có `respondedBy`; `:344` chỉ thêm chip. Prompt quyết định Expired hoặc Cancelled hiện “Bạn đã chọn … Bạn · Expired”, không có “Không được tính là đồng ý” | Chỉ dùng `Chosen` khi `status === 'Answered'`; trạng thái khác giao cho `PromptCard` của shell (đã có nhánh Expired/Cancelled: `shell/prompt-card/PromptCard.tsx:111, 310`); thêm test Expired và Cancelled |
| G3 | EC06, EC13; route của khu vực (`apps/web/README.md:15, 23`); PID-00059 H13 (#127 `PID-00059/index.html:113`) | contradicts | MEDIUM | `deliberation/Board.tsx:63` dẫn tới `/projects/:p/activity/runs/:id`, route đã chốt là `projects/:projectId/activity/agent-runs/:agentRunId`. `Board.tsx:125-132`: nguồn Reference, Evidence dẫn tới `/projects/:p/references?…`, route không tồn tại (Evidence là `projects/:projectId/evidence`, Reference là `library/:referenceId`). Test khóa route sai: `deliberation.spec.tsx:212, 247` | Sửa ba liên kết theo bảng route; sửa hai assert |
| G4 | S02 (`S02-rounds-entries.html:36`: “chip trạng thái chạy … running có chấm Đang chạy”); Workflow.dc.html:336 (ô đang viết có `data-running`), :343-347 (ô bên lỗi: nền, viền danger, `role="note"`); UX-STATE-001; H8; EC13 | partial | MEDIUM | `Board.tsx:55` ô “Đang viết…” là `<p>` không có `data-running`, nên không có chấm; `Board.tsx:87-89`, `deliberation.css:41-43` trạng thái bên là chữ đổi màu, không phải chip, running không có chấm; `Board.tsx:60`, `deliberation.css:49` ô của bên lỗi dùng kiểu “trống” nét đứt muted, không theo kiểu lỗi | Gắn `data-running` cho ô đang viết; trạng thái bên dùng chip (running có chấm); ô bên `error` theo kiểu danger, `role="note"` như màn tham chiếu |
| G5 | H15; EC22; S02:36 (cột có góc nhìn, model, kết nối, chip trạng thái) | partial | MEDIUM | `deliberation.css:87` ẩn `.dl-board__head` dưới 768 px; ô chỉ còn tên bên (`Board.tsx:110`). Ở 390 px mất góc nhìn, model, kết nối và trạng thái bên, kể cả “Lỗi” (ảnh `screenshots/02-thao-luan-completed-390.png` của Dev cho thấy) | Dưới 768 px giữ một dòng thông tin bên (model · trạng thái) ở ô đầu của mỗi bên, hoặc xếp chồng đầu cột thay vì ẩn |
| G6 | S01 (`S01-tab-mock.html:36`: “Bước deliberation trong danh sách bước có liên kết ‘Xem thảo luận’”); S04 (`S04-…html:36`: nhãn “ở đầu tab và cạnh bước”); EC18, EC21; AgentList.dc.html:250 | partial | MEDIUM | Phần cạnh bước và Agent List để cho PR merge sau (Dev G1, G2), nhưng PR không giao sẵn: không có component hay hàm cho liên kết “Xem thảo luận” và nhãn cạnh bước, không có khóa i18n “Xem thảo luận”; Agent List chỉ có `agentNote` cho running, thiếu chuỗi cho phiên Failed (“chờ bạn chọn chạy lại phiên hoặc tiếp tục”, “Vòng k · lỗi …”). PR merge sau sẽ phải tự viết logic của PID-00083 và sửa i18n | Xuất thêm từ `deliberation/index.ts` component hoặc hàm cho liên kết bước và nhãn bước (dựa trên `WorkflowStep.deliberationId`, phiên Completed, prompt đề xuất `skip`), thêm khóa còn thiếu vào file i18n riêng (sau G1); ghi vào mục “Dòng nối” của PR |
| G7 | DEC-47, DEC-48; OQ-101; điểm dừng ticket mục 7 | partial | LOW | `Board.tsx:37-49` dựng `backLinks`, `supersededBy`, `retractions` từ mọi entry, kể cả entry của vòng đang mở nếu dữ liệu có; ô vòng mở vẫn ẩn (`:53-56`) nhưng số “n phản biện” ở điểm đích sẽ lộ. Không có test cho trường hợp dữ liệu chứa entry của vòng đang mở | Lọc `visible` theo vòng đã đóng; thêm một test |
| G8 | Đầu ra O2; S01:38 (kịch bản “cùng model, snapshot lỗi thời; phát `deliberation.*`, `context_snapshot.outdated`”); Problem (`common.yaml:223-232`) | partial | LOW | `__mocks__/deliberation.ts`: không có kịch bản snapshot lỗi thời; chỉ `closeRound` phát sự kiện (`:324-333`), không có hàm phát `entry_retracted`, `status_changed`, `context_snapshot.outdated`; kho mặc định chỉ một phiên (`:301`); lỗi 404 có `type: 'x'`, `title: 'not_found'` (`:350`), khác Problem (`type` là URI) và `shell/mock/runtime.ts:83` | Thêm kịch bản và hàm phát sự kiện; 404 theo dạng của runtime |
| G9 | design.md (ngày `dd/mm/yyyy`) | partial | LOW | `DeliberationTab.tsx:129` (bộ chọn phiên), `:341` (“Bạn đã chọn”) chỉ có giờ; phiên khác ngày khó phân biệt | Dùng `formatDateTime` hoặc thêm ngày khi khác hôm nay |
| G10 | H3; EC23 | partial | LOW | `DeliberationTab.tsx:104` gọi lại `useDeliberationTab` nên trang chủ và tab tải, đăng ký sự kiện hai lần; `:95` khi `listDeliberations` lỗi thì `visible` false, tab bị ẩn không báo lỗi; `:82-85` chỉ đọc trang đầu (`nextCursor` bỏ qua) | Cho `DeliberationTab` nhận state từ trang chủ; PR body dặn trang chủ hiện `tab.error` |
| G11 | design.md §7 (A11y) | partial | LOW | `Board.tsx:109` đặt `aria-label` trên `div` không có role, trình đọc màn hình không chắc đọc tên bên | Thêm `role="group"` |
| G12 | Event (`orchestration.yaml`, Event: `objectId` không định nghĩa theo từng loại); H12 | partial | LOW | `DeliberationTab.tsx:171-173` chỉ đọc lại khi `event.objectId` bằng mã phiên hoặc mã snapshot; với `deliberation.entry_retracted` gateway có thể đặt `objectId` là mã entry | Ghi để kiểm ở Hội tụ PH-04; cân nhắc đọc lại theo `objectType` |

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00083-AC01 | đạt | stub (Xây với mock) | `apps/web/src/features/monitoring/deliberation/deliberation.spec.tsx › vòng 1 còn ẩn (PID-00083-AC01, EC02)` (`:144-159`) | Đạt (22/22 test của file) |
| UX-MONITOR-006-AC01 | đạt | stub (Xây với mock) | `› ba cột theo vòng (UX-MONITOR-006-AC01, EC04)` (`:161-175`) | Đạt |

Edge case (23): có test cho EC01–EC21, EC23 (đều đạt); EC22 chỉ thao tác tay. Khác với kết luận của Dev: EC06 và EC13 liên kết tới route không có (G3); EC13 ô lỗi lệch kiểu (G4); EC22 mất thông tin bên ở 390 px (G5); EC18, EC21 chỉ xong phần dữ liệu (G6); EC15 đúng cho Answered nhưng sai cho Expired, Cancelled (G2).

Kiểm tĩnh sires-ui-review (`check-ui.mjs apps/web/src/features/monitoring`): 0 error, 0 warning. So JSX với Workflow.dc.html (chưa kiểm trực quan): khung, thứ tự khối (đầu phiên, cảnh báo, Problem Brief, board, usage, tổng hợp, quyết định), câu chữ “Vòng 2/3”, “Đang viết, mở khi vòng đóng”, câu Cancelled khớp; lệch ở G4, G5. Token: chỉ dùng biến `--sires-*`, bo góc theo biến, không bóng, không animation riêng (chấm chạy lấy từ `shell/styles/motion.css`, có nhánh reduced motion). Trạng thái entity giữ tiếng Anh (Running, Completed, Failed, Cancelled); trạng thái agent theo ngôn ngữ. vi/en: 104/104 khóa, không thiếu.

### DEC-47, DEC-48

Nguyên văn (ở `d2edf24`): `docs/docs_context.md:43` — DEC-47 “Vòng 1 đề xuất độc lập (lập trường bị ẩn với nhau)”; DEC-48 “entry hiển thị cho Researcher khi vòng đóng; không bắt buộc khác provider, cảnh báo khi cùng model”. PRD 20.1 (`docs/overview/sections/20-…html:80-81`) cùng nội dung. Hợp đồng `getDeliberation` (`docs/api-design/paths/08-…yaml:364-388`, `DeliberationDetail`): `entries` chỉ gồm vòng đã đóng, vòng mở nằm trong `pendingEntries` không có nội dung.

| Quy tắc | Mã thực hiện | Test |
| --- | --- | --- |
| Vòng 1 ẩn lập trường của các bên | `Board.tsx:53-56`: vòng chưa đóng chỉ hiện ô “Đang viết, mở khi vòng đóng” theo `pendingEntries`, không bao giờ hiện entry của vòng đó; `:104` ghi chú “lập trường bị ẩn với nhau cho đến khi vòng đóng” | `deliberation.spec.tsx:144-159` (ba ô, không có nội dung, `.dl-entry` = 0); `:177-184` (Vòng 2 mở) |
| Entry chỉ hiện khi vòng đóng | `Board.tsx:57` (chỉ lấy entry của vòng đã đóng); đọc lại khi `deliberation.round_closed`: `DeliberationTab.tsx:171-173`; mock `closeRound` `__mocks__/deliberation.ts:324-333` | `:144-159` (đóng vòng qua `/events` thì ba lập trường hiện), `:260-279` (EC19, sự kiện trùng không đổi kết quả) |
| Cảnh báo khi các agent dùng cùng model | `DeliberationTab.tsx:221-230`: banner theo `sameModelWarning` của server, nêu model và kết nối, liên kết `/settings/agents` | `:285-292` (EC11) |

Kết luận DEC-47/48: đạt ở mức Xây với mock. Còn một điểm phòng thủ LOW (G7).

### Quy ước với PID-00058, PID-00059

- Không chạm file của PID-00058 (`apps/web/src/features/project/**`): đúng, diff không có file nào ở đó.
- Không chạm `monitoring/index.tsx`, không tạo `monitoring/__mocks__/index.ts`, `mocks.config.json`: đúng. Mock ở file riêng `monitoring/__mocks__/deliberation.ts`; hai operation `listDeliberations`, `getDeliberation` không trùng 10 operation của PID-00059 (#127 H6).
- Sửa `monitoring/i18n/vi.json`, `en.json` (Đầu ra của PID-00059): **vi phạm** (G1).
- Component và hàm nhận biết: `deliberation/index.ts:6-7` xuất `DeliberationTab`, `useDeliberationTab` (trả `visible`: có phiên hoặc có prompt `deliberation_proposal` Open, `DeliberationTab.tsx:95`), kiểu `DeliberationTabState`, `deliberationAgentStates`, `AgentKey`, `DeliberationAgentState`; mock xuất `deliberationMocks`. Khớp “Dòng nối” trong PR body và quyết định của phiên điều phối. Hồ sơ `d2edf24` không nêu tên export nên không có lệch tên. Chưa đủ để PR merge sau “chỉ thêm một dòng import”: G1 (i18n), G6 (liên kết và nhãn cạnh bước, chuỗi Agent List khi Failed).

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm --filter @sires/web exec vitest run src/features/monitoring` | 1 file, 22/22 test đạt (24,8 s) |
| `pnpm --filter @sires/web exec vitest run` (toàn bộ web) | 20/21 file, 158/160 test đạt. 2 test lỗi ở `src/shell/mock/mock.spec.ts` (“khu vực sinh mock vào __mocks__ của mình”, “lỗi có type”) vì worktree chưa sinh `@sires/contracts` (“Cannot find module '@sires/contracts'”). Do môi trường, không thuộc PID-00083 |
| `tsc --noEmit -p apps/web/tsconfig.json` (trong worktree) | Lỗi TS2307 `@sires/contracts` do chưa sinh `libs/ts/contracts/src/generated`, `dist`. Không sinh vì worktree chỉ đọc |
| `tsc -p <scratchpad>/tsconfig.qc.json` (mở rộng `apps/web/tsconfig.json`; `@sires/contracts` trỏ tới `PublicApi` sinh vào scratchpad từ `docs/api-design/dist/openapi.bundled.yaml` của chính worktree, bằng `openapi-typescript` của repo) | 0 lỗi trên toàn `apps/web/src` |
| `npx eslint src/features/monitoring` (apps/web) | 0 lỗi, 0 cảnh báo; rule `@nx/enforce-module-boundaries` bị bỏ qua (không có ProjectGraph cache) |
| `node agent/skills/qc/sires-ui-review/scripts/check-ui.mjs apps/web/src/features/monitoring` | 0 error, 0 warning |
| `node scripts/docs/add-license.mjs --check` | 0 file chưa có thông báo giấy phép |
| `node scripts/development/check-tracks.mjs --base 3c05b2d` | tracks touched: repo, web/monitoring (exit 0) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00083 --result` | KẾT QUẢ ĐỦ (0 cảnh báo) |
| `pnpm nx affected -t lint typecheck test build` | không chạy — cần sinh contracts và cache Nx, sẽ ghi vào worktree chỉ đọc |
| Dev server, trình duyệt | không chạy — theo giao việc, phiên điều phối tự xem |

### Lệch với Self-QC

- `self-qc.md` §3 ghi EC06, EC13 “đã giải quyết”: liên kết Agent Run và “Nguồn:” trỏ tới route không có (G3); ô của bên lỗi lệch kiểu lỗi của thiết kế (G4).
- §3 ghi EC22 “đã giải quyết”: dưới 768 px mất góc nhìn, model, kết nối, trạng thái bên (G5).
- §4 ghi “đều khớp bố cục”: còn lệch chấm đang chạy, chip trạng thái bên, ô lỗi (G4).
- `report.md` §2 ghi “Không sửa index.tsx của khu vực, file của shell hay khu vực khác”: đúng, nhưng có sửa `monitoring/i18n/vi.json`, `en.json`, trái S01:39 và là file của PID-00059. Dev không nêu như một chỗ lệch (G1).
- Dev không xét prompt quyết định Expired, Cancelled (G2).
- §1 “toàn bộ web 160 test đạt”: QC được 158/160; 2 lỗi do worktree thiếu contracts, không mâu thuẫn với mã của PID.
- Dev G1, G2 (MEDIUM, phần cạnh bước và Agent List chờ PID-00059): QC giữ mức MEDIUM, bổ sung phần còn thiếu để PR merge sau chỉ cần import (G6).

### Việc còn lại, theo thứ tự phụ thuộc

1. Chuyển chuỗi i18n sang file riêng trong `deliberation/`, trả `monitoring/i18n/*.json` về bản gốc (G1, Đầu ra O1, S01).
2. Prompt quyết định Expired, Cancelled dùng thẻ của shell, có “Không được tính là đồng ý”; thêm test (G2, EC15).
3. Sửa route Agent Run, Evidence, Reference và hai assert (G3, EC06, EC13).
4. Chấm đang chạy, chip trạng thái bên, kiểu ô lỗi (G4); thông tin bên dưới 768 px (G5).
5. Giao sẵn liên kết “Xem thảo luận”, nhãn cạnh bước, chuỗi Agent List khi Failed, vào file i18n mới (G6, sau bước 1); cập nhật mục “Dòng nối” của PR.
6. LOW: G7–G12.

Sau khi sửa: Dev ghi “Lần 2” ở `report.md`, `self-qc.md`; QC chạy lại.

### Đề xuất cho PO

- Ghi rõ trong quy ước gắn component vào trang của PID khác: chuỗi i18n của PID gắn vào cũng ở file riêng như mock, và dòng gộp messages do PR merge sau thêm. PID-00084 (#146) cũng sửa `project/i18n/*.json`, nên QC của PID đó cần xét cùng điểm này.
- EC18 và EC01 vênh nhau: khi Researcher chọn `skip` và không có phiên, tab bị ẩn (EC01), nên nhãn “Không qua thảo luận” ở đầu tab không bao giờ hiện; chỉ còn nhãn cạnh bước. Đề nghị chốt lại trong lần làm rõ sau.
- `Event.objectId` của các sự kiện `deliberation.*` chưa định nghĩa theo từng loại (G12); nên chốt trước Hội tụ PH-04.

### Màn và trạng thái cần xem trên trình duyệt (gợi ý cho phiên điều phối)

PR không có route riêng: trang workflow của PID-00059 chưa có, mock chưa nối vào khu vực. Cần gắn tạm, không commit (như Dev đã làm), trên bản sao của `0c9c7c8` chạy `pnpm --filter @sires/web dev:mock`:

- Trong `monitoring/index.tsx`, route `projects/:projectId/activity/workflows/:workflowId` render một trang thay thế giống `WorkflowPage` ở `deliberation/testing.tsx:63-82` (dùng `useDeliberationTab` và `DeliberationTab`), với đối tượng workflow chép từ `testing.tsx:38-60`. Không import `testing.tsx` vì file này import `vitest`.
- Thêm `mocks: () => import('./__mocks__/deliberation').then((m) => ({ default: m.deliberationMocks }))`. Chọn kịch bản bằng query: khi nạp module gọi `resetDeliberationMock(scenarios[q]())` với `q` lấy từ `?dl=round1|round2|completed|failed|cancelled`. Gán `globalThis.dl = { closeRound, entries, scenarios, resetDeliberationMock, DELIBERATION_ID }` để thao tác trong console.
- URL: `/projects/1a000000-0000-4000-8000-000000000001/activity/workflows/7a000000-0000-4000-8000-000000000052?view=deliberation&dl=<kịch bản>`. Mã phiên là `7a000000-0000-4000-8000-000000000301` (hiện “dl-301”).
- Đóng vòng trực tiếp: ở `dl=round1`, gõ trong console `dl.closeRound(dl.DELIBERATION_ID, [dl.entries.posO(), dl.entries.posA(), dl.entries.posB()])`. Hàm phát `deliberation.round_closed` qua `siresMock.events`.

Kiểm ở 1440×900 và 390×844:

1. `dl=round1`: chip Running có chấm, “Vòng 1/3”, banner cùng model, ba ô “Đang viết…” (G4: thiếu chấm); đóng vòng thì ba lập trường hiện, không tải lại trang.
2. `dl=round2`: Vòng 1 hiện đủ, Vòng 2 là ô đang viết.
3. `dl=completed`: ba cột; phản biện nối tới điểm đích (Tab, Enter, viền focus 3px), liên kết ngược; “Đã thay” thu gọn, “Đổi lập trường”; usage có dòng tổng; bản tổng hợp, bảng phương án cuộn trong thẻ ở 390; “Qua thảo luận · Deliberation Record”; prompt quyết định (getPrompt là dữ liệu sinh).
4. `dl=failed`: chip Failed; cột B “Lỗi” (ẩn ở 390, G5); ô “Không có lập trường” (G4); liên kết Agent Run (G3, sẽ ra 404).
5. `dl=cancelled`: câu Cancelled; entry Vòng 1 giữ; không có bản tổng hợp.
6. Hai phiên: trong console `dl.resetDeliberationMock({ ...dl.scenarios.completed(), id: '7a000000-0000-4000-8000-000000000300', startedAt: '2026-11-26T08:00:00Z' }, dl.scenarios.round2())`, rồi phát một sự kiện `deliberation.status_changed` cùng project để tải lại → bộ chọn phiên, mới nhất trước, `?deliberation=`.
7. Ở 390: không cuộn ngang trang; đầu cột ẩn (G5); thanh tab dưới đáy không che nội dung. Đổi VI/EN: nhãn đổi, trạng thái giữ tiếng Anh. Bật reduced motion: chấm đứng yên.
8. Đang tải, lỗi: chặn hoặc đặt 500 cho `GET …/deliberations/{id}` (Network throttling, hoặc override tạm) → LoadingState rồi ErrorState có nút thử lại.

## Kiểm trên trình duyệt

Người chạy: phiên QC do PO giao, 27/11/2026. Worktree QC tách riêng ở đúng head `0c9c7c8` (detached): đã `pnpm install --frozen-lockfile` và chạy `dev:mock` (cổng 5282).

- Ở head của PR, tab Thảo luận chưa có route: `monitoring/index.tsx` vẫn là Placeholder. Điều này đúng quy ước với PID-00059: PR merge sau thêm import từ `./deliberation`.
- Phiên này không gắn tạm tab vào route workflow, vì không được ghi file vào worktree của phiên khác. Có một lệnh sửa `index.tsx` đã lỡ chạy; phiên đã trả file về nguyên trạng ngay, `git status` sạch ở `0c9c7c8`.
- Phần giao diện vì vậy kiểm bằng ảnh của Dev (gắn tạm, không commit) và test.

Ảnh `screenshots/01-thao-luan-completed-1440.png` và `02-thao-luan-completed-390.png` (kịch bản `completed`):

- 1440 px:
  - Đầu phiên có `methodology`, `Completed`, “kết thúc sau Vòng 2”, liên kết Deliberation Record.
  - Cảnh báo “Hai Analysis Agent dùng cùng model” (DEC-48), kèm “Đổi trong Agent Models”.
  - Có Problem Brief và ba thẻ bên (model, kết nối, góc nhìn, trạng thái).
  - Vòng 1 ghi “lập trường bị ẩn với nhau cho đến khi vòng đóng” (DEC-47); Vòng 2 có nhãn phản biện (Phản đối, Bổ sung thông tin, Đồng ý, Đổi lập trường).
  - Có bảng Usage (chi phí ghi là ước tính) và Bản tổng hợp (đồng thuận, bất đồng, bảng phương án, khuyến nghị, câu hỏi).
- 390 px:
  - Không thấy tràn ngang.
  - Ba thẻ bên không còn: tên bên chỉ là tiêu đề nhóm, mất model, kết nối, góc nhìn và trạng thái. Khớp G5 (`deliberation.css:87`).
  - Dải điều hướng nằm giữa ảnh là do chụp cả trang với thanh cố định.

Các trạng thái không có ảnh đều chưa xem trên trình duyệt: `round1` (ô “Đang viết…”, ẩn lập trường), đóng vòng, `round2`, `failed`, `cancelled`, hai phiên, đang tải, lỗi. Test phủ các trạng thái này (`deliberation.spec.tsx`, 22/22 đạt, gồm ẩn lập trường ở Vòng 1, entry hiện khi vòng đóng, cảnh báo cùng model).

Lệnh do phiên điều phối chạy trên worktree QC:

| Lệnh | Kết quả |
| --- | --- |
| `pnpm exec vitest run src/features/monitoring` | 1 file, 22/22 đạt |
| `pnpm exec eslint src/features/monitoring` | 0 lỗi |
| `pnpm run typecheck` (`apps/web`) | không kết luận được: `@sires/contracts` không resolve trong worktree QC. Subagent QC đạt 0 lỗi khi trỏ module này tới kiểu sinh. CI của PR: `typescript` và 25 check đạt ở `0c9c7c8` |

Phiên điều phối đối chiếu lại G1 với hồ sơ ở `d2edf24` và giữ mức HIGH:

- `specs/slices/S01-tab-mock.html` dòng 39 ghi: “Chuỗi i18n trong namespace `monitoring`, file của PID này đặt trong `apps/web/src/features/monitoring/deliberation/`”.
- Diff thêm 103 khóa vào `monitoring/i18n/vi.json`, `en.json` (+105 dòng mỗi file).
- Đây là lệch đầu ra theo quy tắc 1.4.13. Hồ sơ PID-00084 không có quy định tương tự, nên mục giống vậy ở PID-00084 (G14) để LOW là nhất quán.

### Kết luận sau khi kiểm trên trình duyệt

- **CHƯA ĐẠT**: 0 CRITICAL, 2 HIGH (G1, G2), 4 MEDIUM (G3–G6), 6 LOW. Ảnh của Dev xác nhận thêm G5; không có khoảng trống mới.
- Kiểm lại trên trình duyệt (round1, failed, 390 px) sau khi PID-00059 gắn tab, hoặc khi Dev sửa và cung cấp cách gắn tạm.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
