# SIRes UI — hướng dẫn thiết kế

Phiên bản 1.0, PO duyệt ngày 31/10/2026. Đây là bộ quy tắc cho bất kỳ ai, người hay agent, khi xây dựng hoặc review giao diện SIRes. Màn hình tham chiếu đã render nằm ở [`pages/`](pages/) và duyệt được qua [`index.html`](index.html). Nếu file này và màn tham chiếu mâu thuẫn, hãy nêu ra, đừng tự đoán.

Bối cảnh sản phẩm: SIRes (Super Intelligence Researcher) là ứng dụng web thuộc nền tảng eTroy cho người làm nghiên cứu (học viên cao học, NCS, giảng viên). Đây là công cụ làm việc hằng ngày trong phiên dài: Plan, Task, evidence, bản thảo LaTeX và nhiều AI agent làm việc dưới sự phê duyệt của con người. PRD ở [`../overview/`](../overview/index.html); hành vi màn hình nằm ở PRD mục 4 (kiến trúc thông tin) và mục 15 (yêu cầu UI/UX).

## 1. Nguyên tắc

1. **Quyết định luôn có ngữ cảnh.** Mọi phê duyệt (APR-01–APR-10) diễn ra cạnh đối tượng được duyệt và hệ quả của nó, không từ một danh sách trơn.
2. **Đề xuất và đã chốt phải nhìn khác nhau.** Draft, Proposed, Discovered Result và claim Unsupported không bao giờ trông giống Accepted, Approved hay Trusted.
3. **Không ẩn agent.** Người dùng luôn thấy agent nào đang làm gì và vì sao đang chờ.
4. **Không chỉ dựa vào màu.** Mọi trạng thái có chữ (và biểu tượng khi cần). Màn hình phải đọc đúng ở thang xám.
5. **Khung yên lặng, dữ liệu nổi bật.** Điều hướng, khung, tab giữ màu trung tính. Màu xanh thương hiệu chỉ dành cho một hành động chính của màn và dữ liệu cần chú ý.
6. **Là công cụ, không phải trang marketing.** Không hero, lời chào, minh họa, câu chữ quảng cáo hay chi tiết trang trí.

## 2. Token

Dùng đúng các giá trị dưới đây; không tự tạo sắc độ trung gian.

### 2.1 Màu

| Token | Hex | Dùng cho |
| --- | --- | --- |
| `ground` | `#F6F2EE` | Nền trang và ứng dụng |
| `surface` | `#FCF9F5` | Thẻ, pane, panel bên, khung bảng, top bar |
| `control` | `#E5DED5` | Nền ô nhập; trạng thái chọn trung tính (mục điều hướng đang mở) |
| `canvas` | `#EFEAE3` | Nền sau PDF preview và các vùng “tài liệu trên bàn” |
| `line` | `#DBD3C7` | Viền thẻ, pane, đường kẻ hàng |
| `line-control` | `#C7C7C7` | Viền ô nhập, select |
| `ink` | `#1C1B18` | Tiêu đề, chữ thân, chữ điều hướng đang chọn, công tắc bật, ô chọn của segmented control |
| `muted` | `#4D4A44` | Chữ phụ, nhãn, meta, tiêu đề cột (đạt AA trên mọi nền) |
| `disabled-ink` | `#7A756C` | Chữ trên điều khiển bị vô hiệu; luôn kèm lý do hiển thị |
| `brand` | `#0277DD` | Nền nút chính, viền trạng thái Running, thanh tiến độ |
| `brand-ink` | `#025FAC` | Chữ và liên kết màu xanh (`#0277DD` không đạt AA khi làm chữ trên nền kem) |
| `brand-tint` | `#EAF4FE` | Nền chip “cần bạn xử lý” và “Running”, dòng thêm trong diff |
| `brand-line` | `#80B9EE` | Viền chip “cần bạn xử lý”, vòng focus |
| `warn` | `#9A3412` | Blocked, Unsupported, Conflicting, needs review, Interrupted |
| `danger` | `#BE123C` | Failed, Invalid, lỗi, nút phá hủy |
| `danger-tint` | `#FFF1F2` | Nền hộp lỗi |
| `danger-ink` | `#9F1239` | Chữ trong chip lỗi |
| `pdf-paper` | `#FFFFFF` | Chỉ trang giấy trong PDF preview |

Dark mode hiện chỉ có ở component Agent List (`source/AgentList.dc.html`): surface `#1C1B18`, raised `#2E2B26`, line `#3A372F`, text `#F6F2EE`, muted `#C9C2B6`, brand `#3DA5FF`, link `#7CC0FF`, error `#F87171`. Khi làm dark theme cho toàn ứng dụng, mở rộng từ các giá trị này.

### 2.2 Chữ

- **Montserrat** cho mọi thứ (400, 500, 600; 700 chỉ cho tiêu đề style guide). Tải từ Google Fonts.
- **JetBrains Mono** chỉ cho định danh và mã: mã Task (`T-2.3`), mã workflow và Agent Run (`wf-52d`, `ar-7f3a`), BibTeX key, mã lỗi, tên model, đường dẫn file, LaTeX, Mermaid. Không dùng cho giờ, số đếm hay dòng meta; những thứ đó dùng Montserrat với `font-variant-numeric: tabular-nums`.
- Chữ có chân (`'Times New Roman', Times, serif`) chỉ trong trang PDF preview và đoạn trích evidence, để giống tài liệu in.

| Vai trò | Cỡ / độ đậm |
| --- | --- |
| Tiêu đề màn (h1) | 26px / 600 (28px cho trang chi tiết; không quá 32px) |
| Tiêu đề khu vực | 20–22px / 600 |
| Tiêu đề thẻ, panel | 15–17px / 600 |
| Chữ thân, ô bảng, điều khiển | 14px / 400–500, line-height 1.5 |
| Nhãn, meta, chip | 12–13px / 500–600 (tối thiểu 11px) |

Viết hoa kiểu câu ở mọi nơi. Không nhãn chữ hoa giãn chữ, không eyebrow.

### 2.3 Hình khối và khoảng cách

- **Bo góc chặt và cố định**: thẻ, panel, dialog, khung bảng `8px`; nút, ô nhập, select, textarea, hộp nhỏ `6px`; chip và tag `4px`; avatar và núm công tắc tròn hoàn toàn. Không giá trị nào khác. Không nút dạng viên thuốc, không bo mềm 12–24px.
- **Không đổ bóng** trên bề mặt tĩnh. Chỉ lớp nổi (menu, popover, dialog) được dùng `0 4px 16px rgba(28,27,24,.10)`.
- **Viền**: 1px `line` cho thẻ và pane; 1.5px cho chip trạng thái và thẻ mang trạng thái (proposal, prompt, recovery).
- **Khoảng cách** theo lưới 4px. Padding thẻ 16–24px, khoảng cách giữa thẻ 16–24px, lề trang `clamp(16px, 3vw, 32px)`, khoảng cách giữa khu vực 24–32px.
- **Chiều cao điều khiển** 40px (36px trong toolbar dày; 44–48px cho hành động chính trên điện thoại). Vùng bấm không dưới 40px.
- **Không gradient, glass, blur, glow, emoji.** Icon nét 14–18px (stroke 1.8–2px) màu `ink` hoặc `muted`, không đặt trong ô vuông hay hình tròn tô màu.

## 3. Ngôn ngữ trạng thái

Mỗi trạng thái chuẩn (PRD mục 5) có một nhãn duy nhất, cùng chữ và kiểu trên mọi màn. Tên trạng thái giữ tiếng Anh ở cả hai ngôn ngữ giao diện (UX-I18N-003).

| Ý nghĩa | Kiểu | Dùng cho |
| --- | --- | --- |
| Đề xuất / chưa chốt | Viền 1.5px **nét đứt**, chữ brand-ink hoặc muted | Draft, Proposed, Discovered (“Chưa duyệt — không dùng làm nguồn”), Partially Supported |
| Đã chốt | Viền 1.5px **nét liền** | Approved, Ready (brand), Accepted, Trusted, Completed, Succeeded (ink) |
| **Cần bạn xử lý** | Nền `brand-tint`, viền `brand-line`, chữ `brand-ink`, kèm biểu tượng tròn có dấu chấm than | Waiting for User, In Review, Plan Proposed, Pending Approval, mọi pending action |
| Đang chạy | Viền liền `brand`, nền `brand-tint`, chữ ink; Agent List thêm chấm 7px nhấp nháy, tắt khi `prefers-reduced-motion` | In Progress, Running, Đang chạy |
| Cảnh báo | Viền `warn` (liền = trạng thái, đứt = cờ nhẹ) | Blocked, Interrupted, Conflicting (liền); Unsupported, needs review (đứt) |
| Lỗi | Viền `danger`, nền `danger-tint` | Failed, Invalid, Lỗi |
| Trung tính / kết thúc | Viền `line`, nền `ground`, chữ muted | Queued, Cancelled, Superseded, Rejected, Paused, Đang rảnh |

Execution label là tag (bo 4px) có icon riêng, luôn tiếng Anh: **Available for agent** (icon chip, viền `line`, nền `ground`) và **Manual editor requirement** (icon bút, viền 1.5px `ink`). Xuất hiện ở mọi nơi có Task.

Thẻ Interactive Agent Prompt có bốn trạng thái: Open (viền 1.5px brand, thao tác được), Answered (viền thường, chỉ đọc, ghi ai và lúc nào), Expired và Cancelled (viền đứt muted, nền `ground`, chỉ đọc, luôn ghi “Không được tính là đồng ý”). Phương án agent đề xuất có nhãn “Đề xuất của agent” nhưng không bao giờ được chọn sẵn; nút xác nhận vô hiệu cho tới khi người dùng chọn.

## 4. Component

Nguồn tham chiếu ở `source/`, bản render ở `pages/`.

| Component | Tham chiếu | Quy tắc |
| --- | --- | --- |
| Top bar | `TopBar` | Logo → Dashboard; bộ chuyển ngữ cảnh (“Global” hoặc tên project); tab khu vực Global (gạch chân màu `ink`, không dùng brand); bên phải: Trợ lý (chỉ ở Global), Pending Actions kèm số đếm (phần khung duy nhất có viền brand), thông báo, VI/EN, Settings, avatar. Có trên mọi màn. |
| Project rail | `ProjectRail` | 220–240px, nền `surface`, tên project + trạng thái Plan, tám khu vực, số việc chờ người dùng, ô active task ở đáy. Mục đang chọn: nền `control`, chữ ink. Manuscript ẩn rail để đủ chỗ và có nút “Project” để quay lại. |
| Nút | `Components`, `Main` | Chính: nền `brand`, chữ trắng, **một nút mỗi màn**. Phụ: nền `surface`, viền `line`, chữ ink. Viền xanh (hành động phụ trong thẻ quyết định): viền `brand`, chữ brand-ink. Nút chữ: brand-ink, không viền. Phá hủy: viền và chữ `danger` trên `surface`. Vô hiệu: nền `ground`, chữ `disabled-ink`, kèm lý do viết cạnh nút. |
| Ô nhập | mọi form | Nhãn phía trên (13px/600), cao 40px, nền `control`, viền `line-control`, bo 6px. Lỗi: viền 1.5px `danger` + thông báo dưới ô nêu sai gì và cho biết chưa lưu. |
| Công tắc | `SettingsProfile`, `SettingsPreferences` | Rãnh 44×26; tắt = nền `surface`, núm `muted`; bật = nền `ink`, núm trắng. Nhãn ghi trạng thái hiện tại bằng chữ. |
| Segmented control | `Plan`, `Manuscript` | Viền `line`, ô đang chọn nền `ink`, chữ trắng. |
| Bảng | `Projects`, `Library`, `GlobalActivity` | Đặt trong thẻ `surface`; tiêu đề cột 12px muted, viết hoa kiểu câu; đường kẻ hàng 1px; không zebra, không dải nền tiêu đề; ID dùng mono; wrapper `position: relative; overflow-x: auto` để bảng rộng cuộn trong thẻ. |
| Danh sách chờ | `Dashboard`, `PendingActions` | Cũ nhất lên trên; mỗi dòng: chip cần-xử-lý ghi loại, tiêu đề, project và thời điểm, một nút viền xanh mở đối tượng trong đúng ngữ cảnh. Việc hết hiệu lực ở nhóm riêng viền đứt kèm lý do. |
| Thẻ prompt | `Chat`, `MobilePrompt` | Xem mục 3. Phương án là các dòng radio rộng hết thẻ, kèm hệ quả. |
| Change proposal | `Manuscript` | Hộp viền đứt brand ngay trong editor: agent tác giả, Task, số claim/evidence, diff (− nền `#FFE4E6`, + nền `brand-tint`), chip kiểm tra citation; chấp nhận/từ chối cả proposal; khi Outdated thay nút Chấp nhận bằng “Yêu cầu tạo lại”. |
| Evidence Inspector | `Evidence` | Liên kết Reference, vị trí (trang, đoạn, chunk), đoạn trích chữ có chân với phần khớp tô `#CFE6FC`, các claim đang dùng, Active/Excluded/Stale. Claim Conflicting hiện cả evidence hỗ trợ và phản bác. |
| Agent List | `AgentList` | Tiêu đề “Agents” + tóm tắt bằng chữ; mỗi dòng: vòng tròn chữ viết tắt, tên, vai trò, chip trạng thái, liên kết Task và bước khi đang chạy hoặc lỗi. Trạng thái: Đang chạy, Đang rảnh, Lỗi. Bind theo trạng thái workflow. |
| Banner | `Dashboard`, `Overview` | Khôi phục (viền 1.5px `warn`), nhắc thêm API key lần đầu (viền đứt brand), Archived chỉ đọc (viền 1.5px muted). Một câu nêu chuyện gì xảy ra, cái gì đã giữ lại, một hành động. |
| Dialog | `SettingsAgents` (xác nhận đổi embedding) | Rộng 480px, nền `surface`, bo 8px, lớp phủ `rgba(28,27,24,.32)`; nêu hệ quả bằng con số trước nút xác nhận; nút hủy gọi tên phương án an toàn. |
| Trống / lỗi / đang tải | `States` | Trống: lý do + hành động tiếp. Lỗi: chuyện gì xảy ra, cái gì đã lưu, làm gì tiếp, mã lỗi; không stack trace, không key. Thao tác dài: bước, agent, thời gian đã chạy, hoạt động gần nhất. |

## 5. Bố cục

- **Màn Global**: top bar + cột giữa (tối đa 1240–1320px) hoặc cột + panel phải (340–440px).
- **Màn Project**: top bar + project rail + vùng làm việc; panel chi tiết ở bên phải rộng 360–440px.
- **Manuscript**: toolbar + cây file (200–230px) + editor + vùng PDF/build log/lịch sử, theo tinh thần Overleaf, không rail.
- **Settings**: menu Settings bên trái (bốn khu vực, mỗi khu vực một view riêng) + một panel cho mỗi nhóm, một nút lưu cho mỗi view.
- **Responsive** (UX-RESP-001): hỗ trợ đầy đủ ≥ 1280px; tablet dùng được (rail xếp xuống, bảng cuộn trong thẻ); điện thoại (< 768px) cho Pending Actions, prompt, phê duyệt và theo dõi tiến độ với thanh tab dưới đáy (`MobilePending`, `MobilePrompt`). Không cuộn ngang trang ở 390px.
- Dùng hàng flex có `flex-wrap: wrap` (cột chính `flex: 999 1 560px; min-width: 0`) để panel bên rơi xuống dưới khi màn hẹp.

## 6. Câu chữ

- Ngôn ngữ giao diện tiếng Việt hoặc English (bộ chuyển có trên mọi màn); nội dung nghiên cứu, bản thảo và thuật ngữ cố định (Task, Plan, Artifact, Trusted Reference, Agent Run, tên trạng thái, execution label) giữ nguyên.
- Tiêu đề là danh từ (“Pending Actions”, “Plan Version v4”), không phải câu hay lời chào.
- Lỗi và banner: chuyện gì xảy ra, ảnh hưởng, bước tiếp, mã lỗi. Nút gọi tên hành động (“Duyệt v4”, “Mở Recovery decision”), không dùng “Bắt đầu ngay” hay “Tìm hiểu thêm”.
- Ngày `dd/mm/yyyy`, giờ `HH:mm`, theo múi giờ máy; số dùng chữ số đều cột.
- Dữ liệu mẫu phải hợp lý và nhất quán (tổng khớp, cùng một Task có cùng mã và trạng thái ở mọi nơi); dùng ngoặc vuông khi chưa có giá trị thật.

## 7. Khả năng tiếp cận

WCAG 2.1 AA cho mọi màn của WF-01–WF-07: tương phản chữ ≥ 4.5:1 (lý do chữ xanh dùng `#025FAC`, chữ phụ dùng `#4D4A44`); vòng focus 3px `#80B9EE` nhìn thấy được; mọi điều khiển là `<button>`, `<a href>`, `<label>` thật; `aria-label` cho nút chỉ có icon; `aria-live="polite"` cho dòng thời gian workflow và trạng thái agent; mọi phê duyệt và prompt làm được hoàn toàn bằng bàn phím; animation tôn trọng `prefers-reduced-motion`.

## 8. Không bao giờ

- Nút hoặc ô nhập dạng viên thuốc, bo góc khác 8/6/4px, bóng trên thẻ tĩnh, gradient, glass, glow, emoji.
- Chip trạng thái màu đặc chữ trắng lặp khắp danh sách; màu brand trên điều hướng, tab hoặc mọi nút.
- Hơn một nút chính tô màu trên một màn.
- Mono cho giờ hay meta; nhãn chữ hoa nhỏ; dòng meta đặt phía trên tiêu đề (đặt bên dưới).
- Icon trong ô vuông hoặc hình tròn tô màu; minh họa trang trí; câu chữ quảng cáo; “Chào mừng trở lại”.
- Hiển thị API key, suy luận thô của model hoặc stack trace ở bất kỳ đâu.
- Chọn sẵn phương án agent đề xuất, hoặc bất kỳ phê duyệt nào không kèm hệ quả.

## 9. Tệp

| Đường dẫn | Nội dung |
| --- | --- |
| `index.html` | Trình duyệt mọi màn, component và biến thể |
| `pages/*.html` | Màn tham chiếu HTML tĩnh (sinh tự động, không sửa tay) |
| `source/*.dc.html`, `source/canvas.json` | Nguồn thiết kế, trùng với canvas https://claude.ai/artifact/PVpjdSkkPJZrNHnwXDFCqK |
| `tools/render.mjs` | Dựng lại `pages/` và `index.html` từ `source/` |
| `tools/serve.mjs` | Phục vụ thư mục tại http://localhost:5178 |
| `assets/sires-logo.svg` | Logo |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
