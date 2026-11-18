# rule-pr-description — Cách viết pull request

- Trạng thái: Hiệu lực
- Áp dụng: mọi agent, mỗi khi tạo hoặc sửa pull request

## Tiêu đề

Theo Conventional Commits, một dòng, tiếng Việt:

```
<loại>(<phạm vi>): <mô tả ngắn>
```

- `loại`: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `deploy`.
- `phạm vi`: chức năng hoặc module bị ảnh hưởng (`identity`, `tickets`, `brand`…).
- `mô tả ngắn`: viết thường, không dấu chấm cuối, dưới ~70 ký tự.

Ví dụ: `feat(identity): khu quản trị hệ thống dưới /api/v1/identity/admin/*`

## Thân

Đúng ba phần, theo thứ tự, không thêm phần khác:

```markdown
## Mục đích
<1–3 câu: vấn đề hoặc nhu cầu; mã ticket/DEC nếu có (PBI-NN, DEC-NN)>

## Giải pháp
- <ý chính 1>
- <ý chính 2>

## Những file đã thay đổi
- `đường/dẫn/file` — <thay đổi gì>
```

## Giới hạn độ dài

- Cả thân **không quá ~25 dòng**. Mỗi gạch đầu dòng một ý, một dòng.
- **Giải pháp**: tối đa 5 ý; nói *làm gì*, không kể lại quá trình làm.
- **Những file đã thay đổi**: nhiều file cùng mục đích thì gộp theo thư mục (`src/api/identity/admin/*`); quá 10 mục thì chỉ liệt kê nhóm chính.
- Không dán log, diff, kết quả test đầy đủ, ảnh chụp dài hay danh sách checklist vào mô tả.
- Không thêm dòng ghi công hay `Co-Authored-By` (xem [rule-pr-author](rule-pr-author.md)).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
