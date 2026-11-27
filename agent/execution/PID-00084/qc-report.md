# PID-00084 — Báo cáo QC độc lập

**Kết luận mới nhất:** CHƯA ĐẠT tại `378815b`: 0 CRITICAL, 1 HIGH (G1: sự kiện của chính câu trả lời bị coi là "xử lý ở nơi khác"), 4 MEDIUM, 9 LOW (Lần 1, 27/11/2026, đã gồm kiểm trên ảnh của Dev; thẻ chưa có route)

- **Ticket:** [PID-00084](../../../docs/tickets/issues/PID-00084/index.html) — hồ sơ chuẩn đọc từ commit `d2edf24` (nhánh của PR #134), vì bản trong nhánh PR thiếu file.
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong `agent/execution/PID-00084/` tại `378815b`.

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè.

## Lần 1 — 27/11/2026 · spec-converge-skill (+ phần kiểm tĩnh của sires-ui-review)

Người chạy: phiên QC do PO giao. Mã nguồn: PR #146 (`web/project-pid-00084` → `develop`), commit `378815b`, kiểm trên worktree chỉ đọc (detached). Diff của PID: `git diff 3c05b2d...378815b` (`3c05b2d` = merge-base với `preview/ui-ph02`), 13 file: 8 file trong `apps/web/src/features/project/`, 5 file trong `agent/execution/PID-00084/`.

Nguồn ý định: `docs/tickets/issues/PID-00084/{index.html, specs/brief.html, specs/scope.html, specs/acceptance.html, specs/index.html, specs/slices/S01-card-render.html, specs/slices/S02-answer-flow.html, designs/notes.html}` tại `d2edf24`; PRD 8.7 (ORCH-DELIB-001, ORCH-DELIB-005), 15.10 (UX-MONITOR-007), 20.1 (DEC-47, DEC-48) tại `d2edf24`; hợp đồng `docs/api-design/components/schemas/orchestration.yaml` (`PromptPurpose`, `DeliberationProposal`, `PromptResponse`), `paths/08-…yaml` (`answerPrompt`), `events/asyncapi.yaml` (`promptStatusChanged`); thiết kế `docs/ui-design/source/Chat.dc.html` (khối “Đề xuất thảo luận”, dòng 242–275), `docs/ui-design/design.md` §3–§7. Hồ sơ PID-00058, PID-00059: `d2edf24` (Đầu ra) và bản làm rõ `9d38c2b` (`docs/pid-00058-00059-clarify`, H3, H5, H18).

### Khoảng trống

Mọi đường dẫn mã tương đối `apps/web/src/features/project/`.

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | EC07, H4; luồng chính PID-00084-AC01, UX-MONITOR-007-AC01 | partial | HIGH | `deliberation-card/DeliberationCard.tsx:84-86` nghe mọi `prompt.status_changed` của prompt này khi `!sending.current`; `:72-81` đọc lại và `:77` bật “đã được xử lý ở nơi khác” khi trạng thái khác `Open`. `events/asyncapi.yaml` `promptStatusChanged` (“Prompt Open, Answered, Cancelled, Expired”) phát cả khi chính Researcher trả lời; sự kiện qua outbox thường tới sau khi `POST /prompts/{id}/response` đã trả về (`sending.current` đã về `false` ở `:105`). Kết quả: ngay sau khi Researcher bấm “Bỏ qua”/“Thảo luận”, thẻ đọc lại prompt (thêm một `GET` sau lúc bấm, trái câu chữ UX-MONITOR-007-AC01 “không có lời gọi nào ngoài answerPrompt”) và hiện “Đề xuất này đã được xử lý ở nơi khác; thẻ hiện trạng thái mới, không gửi lại.” cho chính câu trả lời của họ. Test `card.spec.tsx:233-265` chỉ phát sự kiện khi chưa trả lời, không phủ trường hợp này | Bỏ qua sự kiện khi prompt cục bộ đã không còn `Open` (hoặc khi `event.toState` trùng trạng thái đã biết, hoặc sau khi chính thẻ này đã nhận 200). Thêm test: trả lời “Bỏ qua” thành công → phát `prompt.status_changed` Open→Answered → không có dòng “nơi khác”, không có request nào sau lúc bấm ngoài `POST` |
| G2 | EC09; spec 4.7 “Thẻ nêu thiếu cấu hình và dẫn tới Settings”; ORCH-DELIB-001 (luồng lỗi) | partial | MEDIUM | `DeliberationCard.tsx:175-178` chỉ coi là thiếu cấu hình khi kết nối của Analysis Agent **có** trong `listProviderConnections` và `testStatus !== 'Valid'`; liên kết “Mở Agent Models” ở `:212-217` phụ thuộc điều đó. Kết nối đã xóa/không tra được, instance chưa gán model, model thiếu năng lực bắt buộc, hoặc `listProviderConnections` lỗi (`:138`) → không có đường tới Settings. Ảnh của Dev `screenshots/01-the-de-xuat-1440.png` (thẻ thứ ba, luồng thiếu cấu hình trên `dev:mock`) không có liên kết này. Hợp đồng không có cờ riêng cho luồng thiếu cấu hình (`PromptPurpose` dùng chung `deliberation_proposal`), và EC03 (“không tra được tên kết nối → chỉ thay tên”) mâu thuẫn một phần với EC09 | Chờ PO chốt cách nhận biết (xem Đề xuất cho PO); tạm thời tối thiểu coi kết nối không tra được (khi danh sách đã tải được) hoặc lỗi tải danh sách là “có thể thiếu cấu hình” và vẫn hiện “Mở Agent Models”; thêm test cho từng nhánh |
| G3 | H11, spec 2.3 (3 operation: `getPrompt`, `answerPrompt`, `listProviderConnections`); spec 7 “Dừng và hỏi khi gặp hành vi spec không nói tới” | unrequested | MEDIUM | `DeliberationCard.tsx:145-158` gọi `GET /workflows/{workflowId}` (`getWorkflow`, khu vực monitoring của PID-00059) để có “bước m/n”; override ở `deliberation-card/testing.tsx:41`. Cần cho H3/EC01 (“bước m/n của workflow”) nên spec tự thiếu; Dev ghi ở `implement.md` §3 nhưng `report.md` mục 6 ghi “Đề xuất cho PO: không có” | Ghi vào `report.md` (Đề xuất cho PO) để PO bổ sung `getWorkflow` vào spec 2.3/H11, hoặc bỏ phần “bước m/n” nếu PO không đồng ý |
| G4 | S01 “Component … nhận InteractiveAgentPrompt … và callback trả lời”; quy ước gắn một dòng (YC1); PID-00058 H3 | partial | MEDIUM | Component tự gọi `answerPrompt`, chỉ nhận `onChange?` (`DeliberationCard.tsx:49-54`); mẫu gắn ở `:10-12` và `report.md` §3 không truyền `onChange`. `:70` `useEffect(() => setPrompt(initial), [initial])` đặt lại thẻ theo prop mỗi khi Chat đưa đối tượng prompt mới: nếu Chat (PID-00058) còn giữ bản `Open` cũ và render lại, thẻ quay về `Open` sau khi đã trả lời, cho bấm lần nữa (→ 409 → “nơi khác”) | Ghi rõ hợp đồng gắn trong comment `index.ts`/`DeliberationCard.tsx` và `report.md` (Chat truyền `onChange` để cập nhật prompt của mình); chỉ nhận prop mới khi `rowVersion`/trạng thái mới hơn bản đang giữ; thêm test render lại với prop cũ sau khi trả lời |
| G5 | PID-00084-AC01 Then “tin kết quả tiếp theo của Orchestrator (`message.posted`, `deliberation.status = skipped`) mang nhãn Không qua thảo luận”; S02 bước 3; `acceptance.html` (override `listMessages`) | partial | MEDIUM | Test `card.spec.tsx:168-195` chỉ kiểm phần thẻ; không có kịch bản `message.posted` sau câu trả lời. Phần nhãn do Chat của PID-00058 (H18) hiển thị, Chat chưa có; theo quy ước “PR merge sau thêm dòng import”, việc này chuyển sang PR merge sau. Hiện chỉ ghi ở `report.md` §4 của PID-00084, chưa ghi trong hồ sơ hay `report.md` của PID-00058 | Phiên điều phối chuyển việc cho phiên PID-00058: thêm dòng gắn thẻ và test tích hợp AC01 (bấm “Bỏ qua” → `message.posted` có `deliberation.status = skipped` → nhãn “Không qua thảo luận”), dùng `proposalMessage()`, `skippedResultMessage()`. AC01 chỉ đóng khi test này có |
| G6 | Ticket mục 8 và `designs/notes.html` (“Kiểm trên preview web ở 1440×900 và 1024×768”; chỉ dùng bàn phím; đổi VI/EN) | partial | LOW | `self-qc.md` mục 1: thao tác tay ở 1440×900 và 390×844, không có 1024×768; chọn “Bỏ qua”/“Thảo luận” trên màn chưa làm | Kiểm thêm ở 1024×768 (mục “Kiểm trên trình duyệt”) |
| G7 | Chat.dc.html dòng 242–262; design.md §3, §6 | partial | LOW | (a) “wf-…” ở dòng meta không phải liên kết tới Workflow như thiết kế (`wf-52d` là `<a href="Workflow.dc.html">`), và tự cắt 3 ký tự đầu UUID (`DeliberationCard.tsx:181,194`) → mọi workflow trên mock đều là `wf-7a0`, lệch `statusReason` “Workflow wf-52d …” của chính fixture (`__mocks__/deliberation-card.ts:129`); (b) chip loại vấn đề thiếu icon tròn chấm than, cảnh báo cùng model thiếu icon tam giác như thiết kế; (c) Expired/Cancelled giữ nền `surface`, design.md §3 ghi nền `ground` (`deliberation-card/deliberation-card.css:24`); (d) nút 14px, thiết kế 13px (`.css:61` chỉ đặt chiều cao); (e) “Không được tính là đồng ý.” không đậm như thẻ chuẩn của shell (`shell/prompt-card/PromptCard.tsx:310`) | Sửa theo thiết kế; nhãn workflow dùng liên kết tới trang workflow và một quy ước mã ngắn thống nhất với khu vực monitoring |
| G8 | EC10; O1 “trạng thái error”; độ bền | partial | LOW | `StandardCard` (`DeliberationCard.tsx:113-116`) bỏ `error`, `elsewhere` của `usePromptAnswer` → gửi lỗi ở thẻ chuẩn không hiện gì. Theo mẫu gắn, Chat chỉ render `DeliberationCard` khi `isDeliberationProposal` đúng nên nhánh này không chạy qua Chat. `ProposalCard` dùng `!` cho dữ liệu đọc lại từ server (`:127`, `:167-168`): bản đọc lại thiếu `deliberationProposal` hoặc thiếu lựa chọn (ví dụ mock sinh tự động) làm thẻ ném lỗi | Hiện `ErrorState` ở nhánh thẻ chuẩn hoặc ghi rõ chỉ dùng qua `isDeliberationProposal`; khi bản đọc lại không còn hợp lệ cho thẻ đề xuất thì chuyển sang thẻ chuẩn thay vì ném lỗi |
| G9 | EC03 “tên kết nối thay bằng provider và model của bên đó” | partial | LOW | `DeliberationCard.tsx:171` chỉ thay bằng model; participant trong `DeliberationProposal` không có trường provider (hợp đồng) | Đề xuất PO sửa EC03 thành “model của bên đó” (xem Đề xuất cho PO) |
| G10 | UX-MONITOR-007-AC01 “không có lời gọi nào ngoài answerPrompt” | partial | LOW | `card.spec.tsx:173-175,190` chỉ ghi request khác `GET`; AC nói mọi lời gọi. Hiện tại (không có SSE) sau lúc bấm không có `GET` nào, nhưng test không chứng minh; G1 sẽ thêm `GET` khi có SSE | Ghi mọi request sau lúc bấm và so với đúng một `POST` |
| G11 | design.md §7, sires-ui-review A11y (`aria-live` cho trạng thái động) | partial | LOW | Kết quả “Bạn đã chọn …” (`DeliberationCard.tsx:255-271`) không nằm trong vùng `aria-live`; dòng “nơi khác” `role="status"` (`:234-238`) được chèn cùng lúc với nội dung nên trình đọc màn hình có thể không đọc. Focus về `article` (`:163`) chỉ đọc tiêu đề | Một vùng `role="status"` cố định trong thẻ, đổi nội dung khi trả lời xong, khi “nơi khác” |
| G12 | EC09, `PromptPurpose` (luồng thiếu cấu hình: `deliberate` = “cấu hình lại rồi thảo luận”, phiên chưa mở) | partial | LOW | Chọn “Cấu hình lại rồi thảo luận” → thẻ Answered vẫn kèm “Mở tab Thảo luận” (`DeliberationCard.tsx:264-269`) dù phiên chưa mở (System kiểm lại, còn thiếu thì tạo prompt mới) | Khi là luồng thiếu cấu hình (sau khi PO chốt G2), thay liên kết tab Thảo luận bằng “Mở Agent Models” |
| G13 | H7, PID-00058 H5 (prompt thuộc PID-00060) | partial | LOW | Comment `__mocks__/deliberation-card.ts:8` ghi “getPrompt, answerPrompt belong to PID-00058” — sai chủ; theo H7 thuộc PID-00060 | Sửa comment |
| G14 | Quy ước “không sửa file của PID-00058”; Đầu ra PID-00058 O1 (`features/project/` có sẵn, i18n) | unrequested (ghi để biết) | LOW | Diff sửa `i18n/vi.json`, `i18n/en.json` (thêm 15 khóa `deliberationCard.*`). Hai file có từ scaffold `e914437`, không phải file PID-00058 tạo; là cách duy nhất vào namespace `project` mà không sửa `index.tsx` (H9). PID-00058 cũng sẽ thêm khóa vào cùng chỗ → xung đột văn bản khi PR sau merge | Không cần sửa; PR merge sau giải xung đột JSON (giữ cả hai bộ khóa) |

Tổng: 0 CRITICAL, 1 HIGH (G1), 4 MEDIUM (G2–G5), 9 LOW (G6–G14).

### DEC-47, DEC-48 với thẻ đề xuất

Nguyên văn (PRD 20.1 tại `d2edf24`): DEC-47 “… independent sealed positions (round 1), cross-critique (round 2), an optional targeted round, then an Orchestrator synthesis … goes to the Researcher as a choice …”; DEC-48 “… exactly two Analysis Agent instances; the Researcher confirms before a session runs, except the analysis step of 6.3; the Orchestrator assigns perspectives per problem; entries become visible to the Researcher when their round closes; different providers are not required, the System warns when both instances use the same model.”

| Điểm của DEC | Áp cho thẻ? | Mã | Test | Kết quả |
| --- | --- | --- | --- | --- |
| Researcher xác nhận trước khi phiên chạy (OQ-099, ORCH-DELIB-001) | Có — thẻ là bước xác nhận | Hai nút, không chọn sẵn, chỉ gửi khi bấm: `DeliberationCard.tsx:240-253`; một lần: `:88-108` | `› bàn phím (EC11)` (không `aria-pressed`), `› bỏ qua` (một `POST`), `› bấm hai lần (EC06)` | Đạt ở mức mock; G1 (đọc lại và báo sai sau câu trả lời khi có SSE) |
| Cảnh báo khi hai instance cùng model; không bắt buộc khác provider (ORCH-DELIB-005) | Có | Dùng cờ `sameModelWarning` của server, không tự tính: `:227-232`, kèm “Đổi trong Agent Models” → `/settings/agents`; cảnh báo không chặn nút | `› cảnh báo cùng model (EC02)` `card.spec.tsx:68-75` | Đạt (test không kiểm nút vẫn bật khi có cảnh báo — chỉ đọc mã) |
| Orchestrator giao góc nhìn theo vấn đề (ORCH-DELIB-005-AC02) | Có | “Các bên” kèm `perspective` từng bên: `:219-220` | `› nội dung thẻ (EC01)` | Đạt |
| Đúng 2 Analysis Agent | Hiển thị | Thẻ hiển thị theo `participants`, không giả định số lượng; câu cảnh báo nêu “A và B” theo thiết kế | `› nội dung thẻ` | Đạt (ràng buộc số lượng thuộc backend) |
| Cấu hình vòng (Vòng 1, Vòng 2, vòng hẹp; ORCH-DELIB-002 `maxRounds`) | Có | “Tối đa {maxRounds} vòng sau Vòng 1” trong `deliberationCard.costLine` (`:223`, `i18n/vi.json`) | `› nội dung thẻ`, `› thiếu dữ liệu chi phí` | Đạt |
| Chi phí trên API key của Researcher, chỉ số lượt (OQ-099) | Có | `estimatedAgentRuns`, tên kết nối, `costNote`; không ước lượng tiền: `:221-225` | `› nội dung thẻ`, `› thiếu dữ liệu chi phí (EC03)` | Đạt; G9 (EC03 “provider”) |
| Kết quả bỏ qua mang nhãn “không qua thảo luận” (DEC-47, ORCH-DELIB-001-AC03) | Phần Chat | Thẻ gửi `skip`; nhãn trên tin do PID-00058 hiển thị | `› bỏ qua` chỉ phần thẻ | Một phần — G5 |
| Lập trường kín ở Vòng 1; entry hiện khi vòng đóng (OQ-101) | Không — phiên chưa mở khi thẻ hiện; thuộc tab Thảo luận (PID-00083) | Thẻ không hiện entry nào | — | Không áp dụng; không vi phạm |
| Luồng thiếu cấu hình (ORCH-DELIB-001 luồng lỗi) | Có | Nhãn, hệ quả nút lấy từ server (`:243-251`); liên kết Settings có điều kiện (`:175-178`) | `› thiếu cấu hình (EC09)` | Một phần — G2, G12 |

### Quy ước với PID-00058, PID-00059

- **File thuộc PID khác:** PID-00058 sở hữu khu vực `apps/web/src/features/project/` (Overview, Chat, `__mocks__/` 9 operation hội thoại, test chat/prompt; `index.tsx` là điểm vào khu vực); PID-00059 sở hữu `apps/web/src/features/monitoring/**`. Diff `3c05b2d...378815b` chỉ tạo `deliberation-card/{DeliberationCard.tsx, index.ts, deliberation-card.css, testing.tsx, card.spec.tsx}`, `__mocks__/deliberation-card.ts` và sửa `i18n/vi.json`, `i18n/en.json`. Không chạm `features/project/index.tsx`, `features/monitoring/**`, `shell/**` (không thêm slot vào shell). Nhánh `origin/web/project-pid-00058` (`763e59a`) chưa có file nào trong `apps/web`, nên không có xung đột với file mã của PID-00058; chỉ có xung đột văn bản dự kiến ở hai file i18n (G14). `check-tracks.mjs --base 3c05b2d`: `repo, web/project`. → **Đạt.**
- **Component kèm hàm nhận biết:** `deliberation-card/index.ts:6` export `DeliberationCard`, `isDeliberationProposal`, `deliberationTabHref`, `DELIBERATE`, `SKIP`, `type DeliberationCardProps`. `isDeliberationProposal` (`DeliberationCard.tsx:38-43`): `purpose === 'deliberation_proposal'`, có `deliberationProposal`, đủ `deliberate` và `skip` (EC10). Mock ở file riêng, không khai operation (H7). → **Đạt**, kèm G4 (mẫu gắn không truyền `onChange`; thực tế cần một dòng import và đổi một biểu thức render).
- **Việc của PR merge sau:** dòng gắn thẻ, ghép fixture, test tích hợp nhãn AC01 — mới ghi ở `report.md` §4 của PID-00084 (G5).

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00084-AC01 (phần Chat) | một phần | stub (mock PID-00013, override cục bộ) | `apps/web/src/features/project/deliberation-card/card.spec.tsx › bỏ qua (PID-00084-AC01, UX-MONITOR-007-AC01, EC04)` | Đạt (1/13 trong lần chạy 13/13). Thiếu phần nhãn tin kết quả (G5); sai thông báo khi có SSE (G1) |
| UX-MONITOR-007-AC01 (phần giao diện) | đạt ở mức mock | stub | cùng test, `writes = [POST …/response]` | Đạt; test chỉ lọc lệnh ghi (G10); G1 thêm `GET` sau lúc bấm trên luồng thật |

Edge case: EC01 đạt (bước m/n cần `getWorkflow` — G3); EC02 đạt; EC03 một phần (G9); EC04 phần thẻ (G5); EC05 đạt; EC06 đạt; EC07 một phần (G1); EC08 đạt (nền — G7c); EC09 một phần (G2, G12); EC10 đạt; EC11 đạt (G11); EC12 đạt ở test (VI/EN, HTML thành chữ), khổ hẹp chờ kiểm trên trình duyệt.

Kiểm tĩnh theo sires-ui-review (chưa kiểm trực quan): Token — đạt (`check-ui` 0/0; mọi biến `--sires-*` dùng trong CSS có trong `shell/styles/tokens.css`). Bố cục — `dl` hai cột 120px như thiết kế, một cột dưới 720px (`.css:67-71`). Trạng thái — Open viền brand 1,5px, Answered viền `line`, Expired/Cancelled viền đứt `muted` (nền lệch — G7c); chip trạng thái tiếng Anh. Chrome yên lặng — không có nút chính tô xanh trong thẻ (Thảo luận `outline`, Bỏ qua phụ, như thiết kế). Chữ — mono cho model và mã workflow; tiêu đề thẻ 16px. Quyết định — không chọn sẵn; Expired/Cancelled ghi “Không được tính là đồng ý”. Câu chữ — lỗi qua `ErrorState` (có mã, “chưa được ghi”). A11y — nút thật, nhóm có `aria-label`, focus 3px `brand-line` (`.css`), bàn phím có test; `aria-live` — G11. Chuyển động — không có. Song ngữ — mọi chuỗi qua namespace `project`, trừ tên agent và “Agent Run” (thuật ngữ cố định).

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `node agent/skills/qc/sires-ui-review/scripts/check-ui.mjs apps/web/src/features/project` | 0 error(s), 0 warning(s) |
| `pnpm exec vitest run src/features/project` (trong `apps/web`) | 1 file, 13 test đạt (23,16 s) |
| `pnpm exec eslint src/features/project` (trong `apps/web`) | Thoát 0, không lỗi; cảnh báo môi trường “No cached ProjectGraph” (rule `@nx/enforce-module-boundaries` bị bỏ qua) |
| `pnpm exec tsc -p tsconfig.json --noEmit` (trong `apps/web`) | Không kết luận được — 774 lỗi lan toàn `apps/web`, gốc là TS2307 không tìm thấy `@sires/contracts` (`libs/ts/contracts/dist` chưa build, `pnpm install` đang chạy ở nền); lỗi ở file của PID này đều là hệ quả (`any` ngầm, `RequestOptions`). Không lấy kết quả “đạt” của self-qc |
| `node scripts/development/check-tracks.mjs --base 3c05b2d` | `tracks touched: repo, web/project`, thoát 0 |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00084 --result --root <bản giải nén: docs của d2edf24 + agent/execution của 378815b>` | KẾT QUẢ ĐỦ, 0 cảnh báo; trạng thái “Xong — chờ QC” |
| `gh pr view 146` | OPEN, base `develop`, head `378815b`, MERGEABLE, 35 commit (gồm các commit của `preview/ui-ph02` chưa vào `develop`) |
| `pnpm nx affected -t lint typecheck test build` | không chạy — `pnpm install` đang chạy ở nền, contracts chưa build |
| Dev server, trình duyệt | không chạy — theo giao việc; phiên điều phối kiểm |

### Lệch với Self-QC

- `self-qc.md` mục 3 ghi EC07 “đã giải quyết”, mục 5 “0 HIGH”; QC thấy G1 (HIGH): sự kiện của chính câu trả lời bị coi là “xử lý ở nơi khác”.
- `self-qc.md` mục 3 ghi EC09 “đã giải quyết”; ảnh `01-the-de-xuat-1440.png` của Dev cho thấy thẻ thiếu cấu hình trên `dev:mock` không có “Mở Agent Models” (G2).
- `self-qc.md` mục 1 ghi `tsc --noEmit` đạt; QC không tái lập được do môi trường (contracts chưa build) — chưa kết luận, không phải lỗi của Dev.
- Thao tác tay của Dev ở 1440×900 và 390×844; ticket yêu cầu 1440×900 và 1024×768 (G6).
- `report.md` mục 6 “Đề xuất cho PO: không có”; QC thấy ba điểm cần PO (G2, G3, G9).

### Việc còn lại, theo thứ tự phụ thuộc

1. Sửa luồng sự kiện để không coi câu trả lời của chính mình là “nơi khác”; thêm test (G1, EC07, PID-00084-AC01).
2. Chốt hợp đồng gắn với Chat: `onChange`, không đặt lại thẻ bằng prop cũ; cập nhật mẫu gắn trong comment và `report.md` (G4) — trước khi PID-00058 gắn.
3. Ghi `getWorkflow` và cách nhận biết luồng thiếu cấu hình vào `report.md` mục “Đề xuất cho PO” (G3, G2); sau khi PO chốt, sửa liên kết Settings và liên kết tab Thảo luận cho luồng thiếu cấu hình (G2, G12).
4. Phiên điều phối chuyển cho phiên PID-00058: dòng gắn thẻ, ghép fixture, test tích hợp nhãn “Không qua thảo luận” (G5, PID-00084-AC01).
5. LOW: kiểm 1024×768 (G6); lệch thiết kế (G7); nhánh thẻ chuẩn và dữ liệu đọc lại (G8); test AC lọc mọi request (G10); `aria-live` (G11); comment chủ mock (G13); xung đột i18n khi merge (G14).

### Đề xuất cho PO

- Bổ sung `getWorkflow` (`GET /workflows/{workflowId}`, mock của PID-00059) vào spec 2.3/H11 của PID-00084, vì H3/EC01 yêu cầu “bước m/n của workflow” mà `InteractiveAgentPrompt` chỉ có `workflowId`, `stepId` (G3).
- Chốt cách giao diện nhận biết luồng “Analysis Agent thiếu cấu hình hợp lệ”: thêm cờ trong `DeliberationProposal` (ví dụ danh sách instance thiếu cấu hình) qua phiên sửa hợp đồng, hoặc quy tắc phía giao diện (kết nối không tra được hoặc không `Valid` → hiện “Mở Agent Models”); đồng thời sửa EC03 cho khớp (G2).
- Sửa EC03 “provider và model của bên đó” thành “model của bên đó” (participant không có provider trong hợp đồng) (G9).
- Ghi vào hồ sơ hoặc `report.md` của PID-00058 các việc của PR merge sau: dòng gắn thẻ, ghép fixture, test tích hợp AC01 (G5).

### Danh sách cần xem trên trình duyệt (cho phiên điều phối)

Thẻ chưa có route riêng: Chat của PID-00058 chưa có, route `projects/:projectId/chat` hiện là `Placeholder`. Muốn xem phải gắn tạm như Dev đã làm (không commit, ở bản làm việc riêng): trong `features/project/index.tsx` thay `element` của `projects/:projectId/chat` bằng danh sách `<DeliberationCard prompt={…} projectId={PROJECT_ID} />` dùng các fixture của `__mocks__/deliberation-card.ts`, rồi `pnpm --filter @sires/web dev:mock` (cổng 5173), mở `/projects/1a000000-0000-4000-8000-000000000001/chat`.

- Trạng thái cần xem ở 1440×900, 1024×768 (ticket) và 390×844 (không cuộn ngang, `dl` một cột dưới 720px): `openProposal()` (Open đủ dữ liệu), `sameModelProposal()` (cảnh báo cùng model, liên kết `/settings/agents`), `missingConfigProposal()` (nhãn nút của server; kiểm có/không có “Mở Agent Models” — G2), `sparseProposal()` (không có ghi chú chi phí, tên kết nối thay bằng model), `answeredProposal()` (Answered, viền thường, “Bạn đã chọn Bỏ qua · HH:mm”), `expiredProposal()`, `cancelledProposal()` (viền đứt, `statusReason`, “Không được tính là đồng ý”, không có nút; nền — G7c), `withoutSkip()` (thẻ chuẩn của shell).
- So với Chat.dc.html (`docs/ui-design/source/Chat.dc.html`, biến thể `deliberation: proposed`): chip loại vấn đề và icon, dòng meta “Orchestrator · giờ · bước m/n của wf-…” (trên `dev:mock` không có “bước m/n” và tên kết nối vì `getWorkflow`, `listProviderConnections` là mock sinh tự động), cảnh báo có icon, cỡ chữ nút (G7).
- Bàn phím: Tab tới “Thảo luận” rồi “Bỏ qua”, Enter/Space chọn, focus về thẻ sau khi trả lời; đổi VI/EN bằng nút trên top bar.
- Luồng trả lời trên `dev:mock`: `answerPrompt` là mock sinh tự động, trả một prompt mẫu khác id nên nội dung thẻ sau khi bấm có thể lạ — luồng trả lời đã kiểm bằng test; trên màn chỉ cần thấy nút vô hiệu khi đang gửi và thẻ không còn nút.
- Tái hiện G1 (tùy chọn): sau khi bấm một nút ở thẻ `openProposal()`, chạy trong console `siresMock.events.emit({ type: 'prompt.status_changed', projectId: '1a000000-0000-4000-8000-000000000001', objectType: 'interactive_agent_prompt', objectId: '6a000000-0000-4000-8000-000000000041', fromState: 'Open', toState: 'Answered' })` — thẻ sẽ đọc lại prompt; vì kho mock không có prompt 41, kỳ vọng thấy khối lỗi hoặc dòng “nơi khác” dù người dùng vừa tự trả lời.

## Kiểm trên trình duyệt

Người chạy: phiên QC do PO giao, 27/11/2026. Worktree QC tách riêng ở đúng head `378815b` (detached), đã `pnpm install --frozen-lockfile`.

- Thẻ chưa có route ở head của PR. Điều này đúng quy ước với PID-00058, PID-00059: PR giao `DeliberationCard` kèm `isDeliberationProposal`, PR merge sau thêm một dòng import. Phiên này không gắn tạm thẻ vào route `chat`, vì không được ghi file vào worktree của phiên khác. Vì vậy phần giao diện được kiểm bằng ảnh của Dev và test.
- Ảnh `screenshots/01-the-de-xuat-1440.png` và `02-the-de-xuat-390.png`:
  - Đủ năm trạng thái: Open; cảnh báo cùng model (`gpt-5`, liên kết “Đổi trong Agent Models”); thiếu cấu hình (“Cấu hình lại rồi thảo luận”, “Tiếp tục không thảo luận”); Answered (“Bạn đã chọn Bỏ qua · 03:08”); Cancelled (viền đứt, “Không được tính là đồng ý”).
  - Hai nút cùng kiểu viền, không chọn sẵn.
  - Ở 390 px, nút xuống hàng, không thấy tràn ngang. Dải điều hướng nằm giữa ảnh 390 px là do chụp cả trang với thanh cố định.
  - Thẻ thiếu cấu hình không có liên kết “Mở Agent Models”; chỉ có câu hướng dẫn “Mở Settings → Agent Models…”. Khớp G2.
- G1 (HIGH) được xác nhận bằng đọc mã, chưa tái hiện được trên trình duyệt vì không có route:
  - Handler `prompt.status_changed` chỉ bỏ qua sự kiện khi `sending.current` còn true (`DeliberationCard.tsx:84-86`).
  - Sau khi `answer()` xong, `finally` đặt `sending.current = false`. Sự kiện do chính câu trả lời sinh ra, thường đến sau phản hồi POST, sẽ gọi `refresh(true)`.
  - Lúc đó prompt đã khác `Open` nên `setElsewhere(true)` chạy (`:77`), và thẻ báo đã xử lý ở nơi khác dù chính người dùng vừa trả lời.

Lệnh do phiên điều phối chạy trên worktree QC:

| Lệnh | Kết quả |
| --- | --- |
| `pnpm exec vitest run src/features/project` | 1 file, 13/13 đạt |
| `pnpm exec eslint src/features/project` | 0 lỗi |
| `pnpm run typecheck` (`apps/web`) | không kết luận được: `@sires/contracts` không resolve trong worktree QC, kể cả sau `nx run @sires/contracts:generate`. CI của PR: `typescript` và 25 check đạt ở `378815b` |

Chưa xem trên trình duyệt: 1024×768, bàn phím, đổi VI/EN, so trực tiếp với `Chat.dc.html` trên màn. Làm sau khi PR merge sau gắn thẻ vào Chat.

### Kết luận sau khi kiểm trên trình duyệt

- **CHƯA ĐẠT**: 0 CRITICAL, 1 HIGH (G1), 4 MEDIUM (G2–G5), 9 LOW. Phần kiểm trên ảnh không thêm khoảng trống mới.
- Sửa G1: bỏ qua sự kiện khi prompt đã ở trạng thái mà chính thẻ vừa nhận từ phản hồi POST, hoặc nhớ id câu trả lời của mình. Thêm test: trả lời xong, rồi phát `prompt.status_changed` cùng `objectId`, thì không hiện thông báo “nơi khác”.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
