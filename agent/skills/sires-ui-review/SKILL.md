---
name: sires-ui-review
description: Review implemented SIRes UI against the approved design (docs/ui-design/design.md and the reference HTML screens in docs/ui-design/pages). Use when asked to check, audit, QA, compare or "review giao diện" for SIRes screens, a PR that touches SIRes UI, or whether a built screen "đã giống thiết kế chưa". Runs a static token check, compares the running screen with the reference at the same viewport, and reports deviations with fixes.
---

# SIRes UI review

Mục tiêu: trả lời “màn hình đã triển khai có đúng thiết kế đã duyệt không”, bằng bằng chứng, và chỉ ra cách sửa từng chỗ lệch. Bạn review, không tự sửa code trừ khi người dùng yêu cầu.

Đường dẫn tính từ gốc repo.

## 1. Chuẩn bị

1. Đọc `docs/ui-design/design.md` (luật) và `docs/ui-design/README.md` (bảng màn hình, requirement PRD).
2. Xác định phạm vi: những màn/component nào, file code nào (diff của PR, thư mục feature), và ứng dụng có chạy được không (URL, lệnh dev). Nếu không rõ màn nào tương ứng màn tham chiếu nào, ghép theo tên khu vực trong `README.md` và hỏi lại khi vẫn mơ hồ.
3. Mở màn tham chiếu: `docs/ui-design/pages/<Tên>.html` và các biến thể `<Tên>--*.html`. Muốn xem tất cả trong trình duyệt, chạy `node docs/ui-design/tools/serve.mjs` rồi mở http://localhost:5178/.

## 2. Kiểm tra tĩnh

Chạy trên các file đã thay đổi (hoặc thư mục UI):

```
node agent/skills/sires-ui-review/scripts/check-ui.mjs <file-hoặc-thư-mục> [...]
```

Script báo `error` cho màu ngoài token, bo góc ngoài 8/6/4px, gradient, blur, font khác Montserrat/JetBrains Mono, màu palette Tailwind, emoji, chuỗi giống API key; báo `warn` cho bóng, bo tròn hoàn toàn, chữ hoa giãn chữ. Đối chiếu từng `warn` với ngữ cảnh (avatar, menu nổi là hợp lệ). Script chỉ đọc giá trị trên từng dòng; giá trị đến từ biến hoặc theme thì kiểm tra file theme.

## 3. So sánh trực quan

Khi có trình duyệt (built-in browser, Playwright, Chrome):

1. Mở màn đã triển khai và màn tham chiếu ở cùng khổ: 1440×900, rồi 390×844 cho các màn có trên điện thoại (Pending Actions, prompt, phê duyệt, tiến độ) và để kiểm tra không cuộn ngang.
2. Chụp cả hai; đặt cạnh nhau. So từng vùng theo thứ tự: khung (top bar, rail, cột, panel phải) → thứ tự khối → component → trạng thái và nhãn → chữ → khoảng cách và kích thước.
3. Dùng `getComputedStyle` để đo khi mắt không chắc: màu nền/viền/chữ, `border-radius`, `font-family`, cỡ chữ, chiều cao điều khiển.
4. Kiểm tra các biến thể mà màn tham chiếu có (trống, lỗi, khôi phục, archived, outdated, citation lỗi…). Trạng thái thiếu là lỗi.

Không có trình duyệt: so DOM/JSX với HTML tham chiếu (cấu trúc, chữ, thuộc tính style) và ghi rõ “chưa kiểm tra trực quan”.

## 4. Danh sách kiểm tra

Đánh dấu từng mục Đạt / Lệch / Không áp dụng:

- **Token**: chỉ màu, font, bo góc, bóng trong design.md §2; chữ xanh dùng `#025FAC`, nền nút `#0277DD`; không bóng trên thẻ tĩnh.
- **Bố cục**: cùng khung và thứ tự khối với màn tham chiếu; panel bên rơi xuống khi hẹp; bảng rộng cuộn trong thẻ; không cuộn ngang ở 390px.
- **Trạng thái** (design.md §3): đúng kiểu nét đứt/nét liền/cần bạn xử lý/Running/cảnh báo/lỗi/trung tính; tên trạng thái tiếng Anh; có chữ; execution label đúng icon ở mọi nơi có Task; cờ needs review có nguyên nhân và liên kết.
- **Chrome yên lặng**: điều hướng, tab, mục chọn dùng màu trung tính; đúng một nút chính tô xanh mỗi màn.
- **Chữ**: Montserrat; mono chỉ cho ID và mã; tiêu đề 26–28px (không quá 32px); không eyebrow phía trên tiêu đề; không chữ hoa giãn chữ.
- **Quyết định**: phê duyệt đặt cạnh đối tượng và hệ quả; phương án agent đề xuất không chọn sẵn; nút vô hiệu có lý do; Từ chối Plan bắt buộc lý do; prompt Expired/Cancelled ghi “Không được tính là đồng ý”.
- **Câu chữ**: tiêu đề danh từ; lỗi nêu chuyện gì, cái gì đã lưu, làm gì tiếp, mã lỗi; không stack trace, không API key, không suy luận thô của model.
- **A11y**: phần tử thật, nhãn cho ô nhập, `aria-label` cho nút icon, focus nhìn thấy (3px `#80B9EE`), thao tác phê duyệt/prompt bằng bàn phím, `aria-live` cho trạng thái động, tương phản ≥ 4.5:1, `prefers-reduced-motion`.
- **Song ngữ**: chuỗi qua i18n, đổi VI/EN không đổi nội dung nghiên cứu; ngày `dd/mm/yyyy`.
- **Hành vi PRD**: các acceptance criterion UX-* của màn (mục 15 PRD) mà giao diện thể hiện được.

## 5. Báo cáo

Kết luận một dòng trước: **Đạt**, **Đạt có điều kiện** (chỉ lệch Minor) hoặc **Chưa đạt** (có Blocker/Major). Sau đó bảng phát hiện, nặng nhất trước:

| Mức | Màn / vị trí | Kỳ vọng (tham chiếu) | Thực tế | Cách sửa |
| --- | --- | --- | --- | --- |
| Blocker | `PlanCompare`, thanh duyệt | Nút Từ chối vô hiệu tới khi nhập lý do (UX-PLAN-002, design.md §3) | Từ chối được khi lý do trống | Ràng buộc `disabled` theo độ dài lý do |

Mức độ:
- **Blocker**: sai hành vi phê duyệt/an toàn (chọn sẵn đề xuất, hiện API key, thiếu hệ quả, mất dữ liệu đang nhập), vi phạm a11y chặn thao tác, thiếu trạng thái bắt buộc.
- **Major**: lệch bố cục hoặc component so với tham chiếu, sai kiểu trạng thái, nhiều nút chính, màu/font ngoài token, cuộn ngang trên điện thoại.
- **Minor**: lệch khoảng cách, cỡ chữ, câu chữ nhỏ.

Cuối báo cáo: những gì đã kiểm tra (màn, biến thể, khổ màn hình, công cụ), những gì chưa kiểm tra được và vì sao, kết quả `check-ui.mjs` (số error/warn). Kèm ảnh chụp đối chiếu nếu có.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
