---
name: sires-ui-executor
description: Build or change any SIRes user interface (screens, components, pages, states) so it follows the approved SIRes design (Cream-based, tight radii, quiet chrome). Use whenever you implement, scaffold, restyle or extend SIRes UI in any stack, including "làm giao diện", "dựng màn hình", "thêm component", "sửa UI", "thêm animation", "hiệu ứng loading" for SIRes or eTroy research screens. Reads docs/ui-design/design.md and the reference HTML screens before writing code; motion follows design.md 2.4 with the vendored Animate UI skill as the technique source.
---

# SIRes UI executor

Bạn đang dựng giao diện cho SIRes. Thiết kế đã được PO duyệt (31/10/2026; chuyển động bổ sung 01/11/2026, DEC-51, DEC-52) và là chuẩn bắt buộc. Việc của bạn là tái hiện đúng thiết kế đó trong code, không sáng tác phong cách mới.

Mọi đường dẫn dưới đây tính từ gốc repo.

## 1. Đọc trước khi viết code

1. Đọc toàn bộ `docs/ui-design/design.md`. Đây là luật: token, trạng thái, component, bố cục, câu chữ, a11y, danh sách cấm.
2. Xác định màn hoặc component cần làm trong `docs/ui-design/README.md` (bảng màn hình, cột “Cơ sở PRD”) và mở bản tham chiếu tương ứng:
   - `docs/ui-design/pages/<Tên>.html` và mọi biến thể `<Tên>--*.html` (trạng thái trống, lỗi, khôi phục, archived…). Đây là HTML tĩnh: đọc cấu trúc DOM, thứ tự khối, chữ, kích thước, màu.
   - `docs/ui-design/source/<Tên>.dc.html` khi cần dữ liệu mẫu hoặc logic biến thể (`renderVals()`).
   - Component dùng chung: `TopBar`, `ProjectRail`, `AgentList`, bảng trạng thái `Components`, style guide `Main`.
   - Chuyển động: `docs/ui-design/assets/motion.css` (token, chấm Đang chạy, thanh tiến độ, skeleton, reduced-motion). Màn tham chiếu không có JS nên chỉ thể hiện trạng thái tĩnh và hiệu ứng lúc tải, hover, bấm.
3. Đọc requirement PRD liên quan (UX-*, WF-*) trong `docs/overview/sections/15-ui-ux-requirements.html` và mục chức năng tương ứng (7–13) để biết hành vi, không chỉ hình thức.
4. Nếu dự án đã có token hoặc component library, tìm trước (`grep` theo tên token, màu `#0277DD`, `Montserrat`) và dùng lại; đừng tạo bản thứ hai.

## 2. Token

Lấy token từ `references/tokens.css` trong skill này (đúng giá trị của design.md §2) và chuyển động từ `docs/ui-design/assets/motion.css` (design.md §2.4). Cách dùng:

- CSS thuần / CSS modules: chép file vào dự án (một lần) và dùng biến `var(--sires-…)`.
- Tailwind: map các biến này vào `theme.extend` (colors, borderRadius `sm:4px`, `DEFAULT:6px`, `lg:8px`, fontFamily); tắt hoặc không dùng `rounded-xl`, `rounded-2xl`, `rounded-full` (trừ avatar), `shadow-*` (trừ menu, popover, dialog).
- Component library (MUI, shadcn, Ant…): ghi đè theme bằng cùng giá trị; không để giá trị mặc định của thư viện lộ ra (bo góc, bóng, màu primary).

Không dùng màu, bo góc, font, bóng nào ngoài token. Nếu thiếu một giá trị, chọn giá trị gần nhất có sẵn và ghi chú lại trong báo cáo cuối.

## 3. Khi dựng

- Dựng đúng cấu trúc của màn tham chiếu: cùng vùng (top bar, rail, cột chính, panel phải), cùng thứ tự khối, cùng component. Được phép thay dữ liệu mẫu bằng dữ liệu thật.
- Trạng thái: dùng đúng bảng ở design.md §3 (nét đứt = đề xuất, nét liền = đã chốt, nền xanh nhạt + icon = cần bạn xử lý, Running, cảnh báo, lỗi, trung tính). Tên trạng thái giữ tiếng Anh. Mọi trạng thái có chữ.
- Một nút chính tô xanh trên mỗi màn; còn lại là nút phụ, viền xanh hoặc nút chữ.
- Điều hướng, tab, mục đang chọn: màu trung tính (`ink`, `control`), không dùng brand.
- Mono chỉ cho ID và mã; giờ, số đếm dùng Montserrat với `tabular-nums`. Dòng meta đặt dưới tiêu đề, không phía trên.
- Phê duyệt luôn đặt cạnh đối tượng và hệ quả; phương án agent đề xuất không chọn sẵn; nút vô hiệu luôn có lý do.
- Dựng đủ các trạng thái mà màn tham chiếu có biến thể: trống, đang tải, đang chạy, lỗi, khôi phục, archived, chỉ đọc. Dùng mẫu ở `pages/States.html`.
- Responsive theo design.md §5: không cuộn ngang ở 390px; bảng rộng cuộn trong thẻ (`position: relative; overflow-x: auto`); panel bên xuống dưới khi hẹp.
- A11y theo design.md §7: phần tử thật (`button`, `a`, `label`), focus 3px `#80B9EE`, `aria-live` cho trạng thái động, `prefers-reduced-motion`.
- Song ngữ: chuỗi giao diện qua cơ chế i18n của dự án (vi, en); không dịch thuật ngữ cố định.

## 4. Chuyển động và tác vụ chạy lâu

Luật là design.md §2.4 và §2.4.1. Skill bên thứ ba `agent/skills/vendor/animate-ui` là nguồn kỹ thuật (recipe, cách gắn Motion vào Radix/Base UI/React Aria, kiểm tra), luôn ở mức **subtle**. Khi skill đó và design.md khác nhau, design.md thắng:

| Animate UI mặc định | SIRes |
| --- | --- |
| Dialog co từ 0.8 kèm `rotateX(-20deg)` | Co từ 0.9, không nghiêng |
| Blur nối hai trạng thái (`blur.*`) | Không blur; chỉ mờ dần |
| Spring có vượt nhẹ (popover, toast, tag) | Không nảy trên bề mặt; dùng tween của `motion.css` hoặc spring không vượt (`spring.dialog`, `spring.slide`, `spring.progress`) |
| Hiệu ứng chữ, nền, nút trong catalog | Không dùng (design.md §8) |
| Hỏi người dùng mức subtle/more/expressive | Không hỏi; luôn subtle |

Theo stack:

- **CSS/HTML hoặc không có Motion**: chép `motion.css`, gắn `data-running` cho chip đang chạy, `data-progress` cho phần tô thanh tiến độ (`data-progress="indeterminate"` cho rãnh khi chưa biết thời lượng), `data-skeleton` cho từng khối skeleton.
- **React với shadcn/ui hoặc Radix/Base UI/React Aria**: được theo đường A/B của skill Animate UI (`@animate-ui/react`, `motion`), sau đó truyền `transition` theo bảng design.md §2.4 và bỏ blur, nghiêng. Chấm, thanh tiến độ và skeleton vẫn theo `motion.css` để mọi màn giống nhau.
- **Vue**: `references/vue.md` của skill Animate UI, cùng các ghi đè trên.

Tác vụ chạy lâu (UX-STATE-001: workflow, indexing, build, tìm kiếm):

- Chip trạng thái có chấm Đang chạy; thẻ thao tác dài ghi tên thao tác, ai làm (agent hoặc System), thời gian đã chạy, hoạt động gần nhất, nút hủy khi hủy được, và “rời trang được, kết quả báo qua notification”.
- Biết số bước: thanh tiến độ kèm “Bước 2/4”. Chưa biết thời lượng: thanh chạy lặp kèm thời gian đã chạy. Không spinner xoay.
- Tải danh sách ngắn: skeleton đúng bố cục dòng thật (`aria-hidden`) và một dòng `role="status"` nêu đang tải gì. Việc của agent không dùng skeleton.
- Màn tham chiếu: `States`, `Library--state-loading`, `Discover--state-searching`, `Manuscript--building`, `Workflow--state-running`, `AgentList`.
- Reduced motion: bỏ dịch chuyển, giữ mờ dần, dừng mọi vòng lặp; thanh chưa biết thời lượng hiện cả rãnh màu nhạt.

## 5. Khi thiết kế không có sẵn

Nếu màn hoặc trạng thái chưa có trong `pages/`:

1. Ghép từ component và mẫu bố cục đã có (design.md §4, §5); chọn màn tham chiếu gần nhất và nói rõ đã dựa vào màn nào.
2. Không thêm phong cách mới (màu, bo góc, kiểu thẻ, minh họa). Nếu thật sự cần một component mới, dựng tối giản theo token và liệt kê nó trong báo cáo để PO duyệt.
3. Đề xuất cập nhật thiết kế: thêm artboard vào `docs/ui-design/source/` (định dạng `.dc.html` như các file sẵn có) rồi chạy `node docs/ui-design/tools/render.mjs` — chỉ khi người dùng yêu cầu cập nhật thiết kế.

## 6. Trước khi báo xong

1. Chạy kiểm tra token tĩnh của skill review:
   `node agent/skills/sires-ui-review/scripts/check-ui.mjs <thư mục hoặc file đã sửa>`
   Sửa mọi lỗi `error`; với `warn`, sửa hoặc giải thích. Script cũng cảnh báo chuyển động sai luật (animate width/height, ease-in, spinner, nảy, nghiêng, phóng to khi hover, thiếu reduced-motion).
2. Nếu có trình duyệt và ứng dụng chạy được: mở màn đã dựng và `docs/ui-design/pages/<Tên>.html` ở cùng khổ (1440 và 390), so sánh bố cục, component, trạng thái, chữ. Với chuyển động: xem khung giữa animation (DevTools Animations ở 10%) và bật reduced motion (`emulateMedia({ reducedMotion: 'reduce' })` hoặc cài đặt hệ điều hành). Nên dùng skill `sires-ui-review` cho bước này.
3. Báo cáo ngắn: màn đã làm, màn tham chiếu đã dùng, requirement PRD đã đáp ứng, chỗ lệch thiết kế (nếu có) và lý do, phần chưa kiểm chứng.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
