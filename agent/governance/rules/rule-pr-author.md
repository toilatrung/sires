# rule-pr-author — Tác giả pull request

- Trạng thái: Hiệu lực
- Áp dụng: mọi agent, mọi phiên có tạo commit hoặc pull request

## Quy tắc

Agent **không được tự gán cộng tác (collaborator)** khi tạo commit hay pull request:

- Không thêm dòng `Co-Authored-By:` (của agent, của mô hình hay của bất kỳ ai) vào commit message.
- Không thêm dòng ghi công kiểu `Generated with …`, `🤖 …` vào mô tả PR.
- Không tự gán assignee, reviewer, hay thêm collaborator vào kho/PR; người mở PR tự gán.

Tác giả commit và PR là tài khoản git đang cấu hình trên máy (`git config user.name` / `user.email`). Agent không sửa cấu hình này.

## Lý do

Lịch sử git và PR phải phản ánh người chịu trách nhiệm thay đổi. Ghi công tự động làm nhiễu lịch sử và không do PO quyết định.

## Ưu tiên

Rule này ghi đè mặc định của công cụ agent (ví dụ hướng dẫn tự thêm `Co-Authored-By` hay dòng ghi công). Chỉ bỏ qua khi PO yêu cầu rõ trong phiên.
