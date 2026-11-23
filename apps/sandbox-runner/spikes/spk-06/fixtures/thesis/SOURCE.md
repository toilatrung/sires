# Nguồn template luận văn SPK-06

Thích nghi từ [CUED PhD thesis template của Krishna Kumar](https://github.com/kks32/phd-thesis-template),
revision cố định `8d6c2d59790d93ef58e50f908d98d49e00b4fb1d`, giấy phép MIT.
Giữ nguyên giấy phép gốc tại `vendor/LICENSE`; hash các file upstream tại
`vendor/upstream.json`. Không coi class `report` chuẩn là một template luận văn.

Giữ class PhDThesisPSnPDF, cơ chế frontmatter/mainmatter, ba chương mẫu và
BibTeX của template. Các thay đổi có chủ đích:

- Font XITS được thay bằng DejaVu Serif và Latin Modern Math đã có trong image.
  pdfLaTeX dùng Latin Modern để không cần tạo font bitmap TS1 khi tắt shell
  escape; phần tiếng Việt dùng T5. Bổ sung đuôi PNG cho graphicx ở XeLaTeX.
- Main file dùng đường dẫn tương đối `chapters/`, `figures/`, `bibliography/`;
  bỏ thông tin cá nhân/trường của trang bìa mẫu và không dùng crest.
- Giữ cấu trúc, danh sách, phương trình và citation của chương mẫu. Bỏ phần
  hướng dẫn booktabs mượn từ tài liệu Simon Fear trong chương 3.
- Thay ảnh nhân vật trong template bằng ba đồ thị PNG tự tạo bằng matplotlib;
  không sao chép hình có quyền riêng. Dữ liệu đồ thị tổng hợp, không phải số đo.
- Thêm chương tiếng Việt, encoding T5 cho pdfLaTeX, natbib + plainnat, không
  dùng `\loop` để kéo dài tài liệu hoặc tự viết `thebibliography`.

Fixture dùng để kiểm template mở nhiều chương, nhiều file, ảnh raster và
BibTeX. Số trang thực tế được ghi sau khi đo, không đặt trước hoặc dùng làm
đại diện cho mọi luận văn. Mã và text gốc MIT vẫn giữ giấy phép upstream;
phần thích nghi SIRes tuân theo giấy phép của repo.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../../../LICENSES.md).
