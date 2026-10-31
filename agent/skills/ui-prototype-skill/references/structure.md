# Cấu trúc thư mục ui-design

Mô hình lấy từ `docs/ui-design` của SIRes, bỏ phần phong cách. Mọi đường dẫn dưới đây tính từ thư mục `ui-design`.

## Vai trò từng file

| Đường dẫn | Ai sửa | Vai trò |
| --- | --- | --- |
| `README.md` | Người | Trang vào: trạng thái duyệt (ai, ngày), cách xem, bảng cấu trúc thư mục, bảng màn hình (mã, file, màn, cơ sở yêu cầu), ghi chú thiết kế đã duyệt |
| `design.md` | Người | Luật thiết kế cho người và agent. Khung ở [docs-outline.md](docs-outline.md) |
| `index.html` | Render | Trình xem: danh sách màn theo nhóm, tìm kiếm, chọn biến thể, khổ Desktop/Tablet/Điện thoại, mở riêng |
| `pages/<Tên>.html` | Render | Trang tĩnh của biến thể mặc định |
| `pages/<Tên>--<prop>-<option>.html` | Render | Biến thể `enum` |
| `pages/<Tên>--<prop>.html` | Render | Biến thể `boolean` (giá trị ngược default) |
| `source/<Tên>.dc.html` | Người hoặc canvas | Nguồn của một màn hoặc component |
| `source/canvas.json` | Người hoặc canvas | Nhóm màn, kích thước, tiêu đề, thứ tự |
| `tools/ui.config.json` | Người | Cấu hình render và serve |
| `tools/render.mjs` | Người (hiếm) | Trình dựng; không chứa phong cách |
| `tools/serve.mjs` | Người (hiếm) | Máy chủ tĩnh, cổng lấy từ `PORT` hoặc `ui.config.json` |
| `tools/index.template.html` | Người | Khuôn của index; render thay `/*__MANIFEST__*/null` và `/*__CONFIG__*/null` |
| `assets/tokens.css` | Người | Token dùng chung; giá trị theo `design.md` |
| `assets/*` | Người | Logo, ảnh, CSS dùng chung khác (chuyển động…) |

## Quy ước tên

- Source: PascalCase, không dấu cách, không `--` (`--` dành cho biến thể). Ví dụ `Dashboard`, `SettingsProfile`, `MobilePending`.
- Nhóm theo tiền tố khi có nhiều màn cùng khu vực: `Settings*`, `Mobile*`, `Global*`.
- Mã màn trong `title` của board: một chữ cái nhóm + số (`G1`, `P10`, `S0`, `X1`, `M2`). Index sắp xếp `G1 < G2 < G10`. Component dùng chung không có mã (`"TopBar (dùng chung)"`).
- Tên prop biến thể ngắn, camelCase (`state`, `theme`, `wfState`); option kebab-case (`first-run`, `deliberation-failed`) vì nó nằm trong tên file.

## canvas.json

Định dạng chỉ mục của công cụ Design canvas; render chỉ đọc `pages` và `boards`.

```json
{
  "v": 3,
  "title": "<Tên bộ thiết kế>",
  "pages": [
    { "id": "foundation", "name": "Nền tảng" },
    { "id": "app", "name": "Màn hình" },
    { "id": "states", "name": "Trạng thái & Mobile" }
  ],
  "boards": {
    "Main.dc.html":   { "x": 0, "y": 0, "w": 1280, "h": 1000, "title": "Style guide", "page": "foundation" },
    "TopBar.dc.html": { "x": 0, "y": 1100, "w": 1440, "h": 56, "title": "TopBar (dùng chung)", "page": "foundation" },
    "Home.dc.html":   { "x": 0, "y": 0, "w": 1440, "h": 900, "title": "A1 · Trang chủ", "page": "app", "expand": "fill", "is_interactive": true }
  },
  "order": ["Main.dc.html", "TopBar.dc.html", "Home.dc.html"]
}
```

| Trường board | Dùng cho |
| --- | --- |
| `title` | Tên trong index (thiếu thì lấy `<title>` của source) |
| `page` | Nhóm trong index; id không khớp thì rơi vào nhóm đầu |
| `w`, `h` | Kích thước khung xem (mặc định 1440×900) |
| `expand: "fill"` | Màn co giãn theo khổ: bật Desktop/Tablet/Điện thoại |
| `x`, `y`, `is_interactive` | Chỉ canvas dùng; render bỏ qua |

Quy ước khổ: desktop 1440, tablet 1024, điện thoại 390. Màn mobile riêng đặt `w: 390` và không `fill`.

## ui.config.json

```json
{
  "title": "<Tên bộ thiết kế>",
  "lang": "vi",
  "port": 5178,
  "defaultScreen": "Home",
  "noVariants": ["Main", "TopBar"],
  "sharedCss": ["assets/tokens.css"],
  "assetRewrites": {},
  "banner": []
}
```

| Khóa | Ý nghĩa |
| --- | --- |
| `title` | Tiêu đề index và hậu tố `<title>` của trang |
| `lang` | `lang` của `<html>` trong mọi trang |
| `port` | Cổng mặc định của `serve.mjs` (biến môi trường `PORT` thắng) |
| `defaultScreen` | Màn mở khi index không có hash |
| `noVariants` | Source chỉ render biến thể mặc định |
| `sharedCss` | CSS dùng chung: gắn `<link>` vào mọi trang và đồng bộ bản chép vào helmet của source |
| `assetRewrites` | Đổi chuỗi trong trang khi render, ví dụ URL blob của canvas → `../assets/logo.svg` |
| `banner` | Các dòng chú thích đặt đầu mỗi trang sinh ra (bản quyền, giấy phép); rỗng thì bỏ |

## launch.json

Cho Claude desktop (`preview_start`), thêm vào `.claude/launch.json` ở gốc repo:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "ui-design", "runtimeExecutable": "node", "runtimeArgs": ["docs/ui-design/tools/serve.mjs"], "port": 5178 }
  ]
}
```

Cổng phải trùng `port` trong `ui.config.json`. Hai bộ ui-design trong cùng repo dùng hai cổng khác nhau.

## Liên kết với phần còn lại của repo

- Skill dựng UI theo thiết kế (kiểu `sires-ui-executor`) đọc `design.md`, `pages/` và `source/`. Skill review (kiểu `sires-ui-review`) so trang đã triển khai với `pages/` cùng khổ.
- Token trong `assets/tokens.css` có thể chép sang skill executor (`references/tokens.css`) để agent dùng khi viết code; giữ một nguồn và ghi rõ nguồn nào là chuẩn.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
