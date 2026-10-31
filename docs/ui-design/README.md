# SIRes — Bộ thiết kế giao diện

Trạng thái: **PO đã duyệt ngày 31/10/2026**, là mẫu thiết kế chính. Quy tắc cho người và agent: [design.md](design.md). Xem mọi màn, component và biến thể: mở [index.html](index.html) (hoặc chạy `node docs/ui-design/tools/serve.mjs` rồi vào http://localhost:5178/).

Canvas gốc: https://claude.ai/artifact/PVpjdSkkPJZrNHnwXDFCqK (riêng tư; chia sẻ qua menu Share của trang).

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
| --- | --- |
| `index.html` | Trình xem: danh sách màn theo nhóm, chọn biến thể, khổ Desktop/Tablet/Điện thoại, mở riêng từng trang |
| `design.md` | Hướng dẫn thiết kế: token, trạng thái, component, bố cục, câu chữ, a11y, danh sách cấm |
| `pages/*.html` | 80 trang HTML tĩnh (35 nguồn + 45 biến thể Tweaks), sinh tự động — không sửa tay |
| `source/*.dc.html`, `source/canvas.json` | Nguồn thiết kế (định dạng component của canvas) và chỉ mục bố cục |
| `tools/render.mjs` | `node docs/ui-design/tools/render.mjs` — dựng lại `pages/` và `index.html` từ `source/` |
| `tools/serve.mjs`, `tools/index.template.html` | Máy chủ xem cục bộ (cổng 5178) và khuôn của index |
| `assets/sires-logo.svg` | Logo |
| `assets/motion.css` | Chuyển động dùng chung (design.md 2.4, DEC-51; tác vụ chạy lâu 2.4.1, DEC-52). Nguồn chuẩn duy nhất: `render.mjs` chép nguyên văn vào khối `<style data-sires-motion>` trong helmet của mọi `source/*.dc.html` (để canvas hiển thị đúng chuyển động) và gắn một lần bằng `<link>` vào mọi trang trong `pages/` (khối chép bị bỏ khi dựng, không trùng) |

Skill cho agent (gốc repo): `agent/skills/sires-ui-executor` (dựng UI theo thiết kế) và `agent/skills/sires-ui-review` (đối chiếu UI đã triển khai với thiết kế, kèm `scripts/check-ui.mjs`). Skill bên thứ ba `agent/skills/vendor/animate-ui` (Animate UI, giấy phép MIT + Commons Clause trong thư mục đó) là nguồn token chuyển động.

Phong cách: **Cream** (typeui.sh/design-skills/cream), thay cho phong cách phẳng kiểu Overleaf của DEC-18 theo yêu cầu 31/10/2026. Nền kem #F6F2EE, thẻ #FCF9F5, ô nhập #E5DED5, viền #DBD3C7; Montserrat cho mọi chữ, JetBrains Mono cho LaTeX/mã; brand #0277DD (nền nút, viền), #025FAC (chữ, liên kết); bo góc chặt (thẻ 8px, nút và ô nhập 6px, nhãn 4px) thay cho bo 24px/viên thuốc của Cream gốc; không đổ bóng. Quy ước trạng thái: nét đứt = đề xuất, nét liền = đã chốt, nền xanh nhạt + biểu tượng = cần bạn xử lý. Bản DEC-18 trước khi đổi được lưu trong lịch sử phiên bản của canvas (phiên bản 14).

Sửa thiết kế: sửa `source/<Tên>.dc.html` (hoặc trên canvas rồi tải về), chạy lại `tools/render.mjs`, cập nhật `design.md` nếu quy tắc thay đổi. Chuyển động sửa ở `assets/motion.css` rồi chạy render; không sửa khối `<style data-sires-motion>` trong nguồn (render ghi đè). Nguồn tải về từ canvas đã có sẵn khối này nên mở trên canvas vẫn thấy thanh indeterminate, skeleton, chấm Đang chạy, dialog, alert, tooltip và hiệu ứng bấm.

## Danh sách màn hình

| Mã | File | Màn hình | Cơ sở PRD |
| --- | --- | --- | --- |
| — | Main | Style guide (Cream) | DEC-18 |
| — | Components | Nhãn trạng thái, execution label, prompt 4 trạng thái | 15.5, 5 |
| — | TopBar, ProjectRail | Điều hướng dùng chung; số Pending Actions (8) và chuông Notifications (3 chưa đọc) | UX-LAYOUT-001/003, 4.4 |
| — | AgentList | Danh sách 10 agent của project (Orchestrator, Discovery, Reference Processing, Evidence Retrieval, Synthesis, Writing, Verification, Diagram, Analysis Agent A, B), nhãn Đang chạy, Chờ bạn, Gián đoạn, Lỗi, Đang rảnh. Biến thể `wfState`: running (mặc định), waiting, interrupted, deliberation, synthesis, deliberation-failed, cancelled; `theme`: dark | SCOPE-12, UX-MONITOR-001, AGENT-ANALYSIS-001 |
| — | AgentListPreview | Agent List light và dark cạnh nhau, cùng bảy biến thể `wfState` như AgentList | design.md 2.1 (dark) |
| G1 | Dashboard | Dashboard, 8 việc chờ (cũ nhất trên); biến thể recovery, first-run | 15.1, UX-PENDING-001, UX-STATE-005, UX-SETTINGS-002 |
| G2 | Projects | Research Projects + tạo project | 7.2 |
| G3 | Discover | Tìm Google Scholar + nhập thủ công; biến thể đang tìm | 10.1–10.4, UX-STATE-001 |
| G4 | Library | Trusted Library, duyệt theo lô; biến thể empty, loading | 10.6–10.8, UX-REF-001/002 |
| G5 | Reference | Chi tiết Reference + provenance | UX-REF-003 |
| G6 | Assistant | Global AI Assistant (khung bên) | UX-LAYOUT-002 |
| G7 | GlobalTasks | Tasks & Plan tổng hợp (chỉ đọc) | 9.12 |
| G8 | GlobalActivity | Agent Activity cấp Global: workflow đang hoạt động trên cùng, Tạm dừng cho cả Waiting for User (DEC-53) | UX-MONITOR-001, UX-MONITOR-004 |
| G9 | PendingActions | Pending Actions (8 việc, lọc theo loại PRD 4.4) + nhóm Hết hiệu lực | 4.4, UX-PENDING-001/002 |
| G10 | Notifications | Notifications mở từ chuông TopBar: đã đọc/chưa đọc, lọc theo loại; biến thể chưa đọc | 4.4, UX-STATE-001 |
| S0 | SignIn | Đăng nhập eTroy OIDC; biến thể lỗi OIDC, hết phiên | UX-AUTH-001/002 |
| S1 | SettingsProfile | Profile; biến thể URL sai | 15.12 |
| S2 | SettingsProviders | Provider Connections | 15.12 |
| S3 | SettingsAgents | Agent Models (dòng Analysis Agent A, B và cảnh báo cùng model); biến thể xác nhận đổi embedding | 15.12, ORCH-DELIB-005 |
| S4 | SettingsPreferences | Preferences; biến thể debug | 15.12 |
| P1 | Overview | Overview, 6 việc chờ của project; biến thể no-plan, archived, recovery | 15.2 |
| P2 | Chat | Project AI Chat + Interactive Agent Prompt + thẻ đề xuất thảo luận; biến thể bỏ qua thảo luận | 15.3, UX-MONITOR-007 |
| P3 | Plan | Task board + chi tiết Task + readiness; biến thể dependency graph (baseline v3) và dependency graph có chu trình khi soạn Draft v5 | UX-TASK-001–005 |
| P4 | PlanCompare | So sánh và duyệt Plan Version | UX-PLAN-001/002 |
| P5 | TaskReview | Nghiệm thu Task | UX-TASK-006 |
| P6 | Evidence | Claim + Evidence Inspector | UX-EVID-001, UX-CLAIM-001 |
| P7 | Artifacts | Research Artifacts, phiên bản, provenance | 5.7, 13 |
| P8 | Manuscript | Editor, Change Proposal, build log, lịch sử revision; biến thể khung phải build log, lịch sử; proposal citation lỗi, outdated; đang build | 15.7, UX-STATE-001 |
| P9 | ProjectActivity | Agent Activity cấp project: danh sách workflow + Agent List; biến thể đang hoạt động, đã kết thúc | UX-MONITOR-001, UX-MONITOR-004 |
| P9 | Workflow | Chi tiết workflow wf-52d + Agent Run + Recovery decision. Mặc định Waiting for User; biến thể state running, interrupted; view danh sách bước, thảo luận đang chạy, hoàn tất, Failed, Cancelled; debug | UX-MONITOR-002–004, UX-MONITOR-006, ORCH-DELIB-002, WF-06 |
| P10 | History | Activity and History | 14.8 |
| X1 | States | Thao tác dài (biết và chưa biết thời lượng), đang tải danh sách, trống, lỗi, khôi phục, notification | 15.8 |
| M1 | MobilePending | Pending Actions ở 390px (cùng 8 việc) | UX-RESP-001 |
| M2 | MobilePrompt | Trả lời prompt ở 390px | UX-RESP-001 |

## Ghi chú thiết kế (đã duyệt)

- Dữ liệu mẫu (tên project, tác giả, model, số liệu) chỉ để minh họa. Giá trị Ngưỡng kiểm chứng ghi trong ngoặc vuông là placeholder. Các màn Global và project dùng chung một thời điểm 31/10/2026 09:52 (workflow wf-52d đang Waiting for User): 8 pending action (6 thuộc project “RAG trong tổng quan tài liệu”), 3 notification chưa đọc, 4 workflow đang hoạt động. Biến thể của Workflow và Agent List ở thời điểm khác ghi giờ của chúng.
- DEC-18 ở PRD 20.1 đã cập nhật theo thiết kế này (31/10/2026).
- Cream gốc dùng #0277DD cho chữ xanh; ở đây chữ xanh dùng #025FAC và chữ phụ dùng #4D4A44 (không dùng #7A756C) để đạt WCAG AA. Cảnh báo #9A3412, lỗi #BE123C.
- Bản thảo PDF và đoạn trích evidence giữ chữ có chân (Times) để giống tài liệu in.
- Manuscript bỏ ProjectRail để dành chỗ cho ba vùng; quay lại project bằng nút “Project” trên thanh công cụ.
- Pending Actions nằm ở phía phải TopBar (luôn hiện số đếm) thay vì là một tab Global.
- Đã rà soát theo taste-skill (Leonxlnx/taste-skill, phần app screens): bo góc chặt nhất quán; chip trạng thái nền nhạt thay vì màu đặc chữ trắng; điều hướng và tab đang chọn dùng màu trung tính (màu xanh chỉ cho một nút chính mỗi màn và dữ liệu); công tắc bật màu mực; chữ mono chỉ cho ID, mã, LaTeX; bỏ nhãn meta nằm trên tiêu đề; tiêu đề màn ứng dụng 26px. Taste-skill cũng cảnh báo nền kem là một dấu hiệu AI phổ biến; vẫn giữ theo lựa chọn của bạn.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
