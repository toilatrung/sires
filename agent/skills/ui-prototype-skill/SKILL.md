---
name: ui-prototype-skill
description: Set up or extend a static UI prototype folder (ui-design) with the same layout as SIRes docs/ui-design — design sources in source/*.dc.html plus canvas.json, a render script that turns them into static pages/ and a browsable index.html with variants and viewport sizes, a local server, shared assets, README.md and design.md. Use when asked to "tạo thư mục ui-design", "dựng bộ prototype giao diện", "cấu hình folder thiết kế UI giống SIRes", add a screen or variant to such a folder, or wire its render/serve tooling. Style-neutral: it prescribes folders, files, formats and workflow, never colors, fonts or visual style.
---

# UI prototype skill

Skill này hướng dẫn dựng một thư mục prototype giao diện có cùng **cấu trúc và quy trình** với `docs/ui-design` của SIRes. Nó không quy định phong cách. Màu, font, bo góc, khoảng cách, chuyển động là việc của người quyết định thiết kế (PO hoặc designer) và được ghi vào `design.md` của thư mục mới. Đừng chép token Cream của SIRes sang dự án khác trừ khi được yêu cầu rõ.

Đường dẫn tính từ gốc repo. Skill nằm ở `agent/skills/ui-prototype-skill/`.

## 1. Kết quả cần có

```
<ui-design>/
├── README.md                  # trạng thái duyệt, bảng cấu trúc, bảng màn hình, ghi chú thiết kế
├── design.md                  # luật thiết kế (token, trạng thái, component, bố cục, câu chữ, a11y, cấm, tệp)
├── index.html                 # SINH TỰ ĐỘNG: trình xem mọi màn, biến thể, khổ màn hình
├── pages/                     # SINH TỰ ĐỘNG: mỗi màn × biến thể là một HTML tĩnh
├── source/
│   ├── canvas.json            # chỉ mục: nhóm màn (pages), kích thước và nhóm của từng board
│   ├── Main.dc.html           # style guide / token sheet (không biến thể)
│   ├── TopBar.dc.html         # shell dùng chung (không biến thể), import vào các màn
│   └── <Screen>.dc.html       # mỗi màn hoặc component một file
├── tools/
│   ├── ui.config.json         # cấu hình cho render và serve
│   ├── render.mjs             # source/ → pages/ + index.html
│   ├── serve.mjs              # máy chủ xem cục bộ
│   └── index.template.html    # khuôn của index.html
└── assets/
    ├── tokens.css             # token dùng chung (giá trị do dự án quyết định)
    └── <logo, css dùng chung khác>
```

Chi tiết vai trò từng file và quy ước đặt tên: [references/structure.md](references/structure.md). Định dạng nguồn `.dc.html`: [references/dc-format.md](references/dc-format.md). Khung `design.md` và `README.md`: [references/docs-outline.md](references/docs-outline.md).

## 2. Dựng thư mục mới

1. Hỏi hoặc xác định: thư mục đích (mặc định `docs/ui-design`), tên bộ thiết kế, cổng máy chủ, ngôn ngữ giao diện. Nếu đích nằm trong `docs/` của repo có quy tắc quyền ghi (như SIRes R-01–R-07), chỉ tạo khi người quyết định yêu cầu.
2. Sinh khung từ template:

   ```
   node agent/skills/ui-prototype-skill/scripts/scaffold.mjs <thư-mục-đích> --title "<Tên bộ thiết kế>" [--port 5178] [--lang vi] [--force]
   ```

   Script chép `templates/ui-design/`, thay placeholder `__UI_TITLE__`, `__UI_PORT__`, `__UI_LANG__`, trỏ lại liên kết `LICENSES.md` trong footer tới file `LICENSES.md` gần nhất phía trên thư mục đích, và từ chối ghi vào thư mục đã có file trừ khi có `--force`. Nó không chạy render. Template mang ghi chú giấy phép của repo SIRes (quy tắc `add-license.mjs`); khi dùng cho dự án khác, thay bằng ghi chú của dự án đó và đặt `banner` trong `ui.config.json` nếu muốn trang sinh ra có chú thích bản quyền.
3. Dựng lần đầu và xem:

   ```
   node <thư-mục-đích>/tools/render.mjs
   node <thư-mục-đích>/tools/serve.mjs
   ```

   Mở `http://localhost:<port>/`. Khi dùng Claude desktop, thêm cấu hình vào `.claude/launch.json` (mẫu ở [references/structure.md](references/structure.md#launchjson)) rồi `preview_start`.
4. Điền `design.md` và `assets/tokens.css` theo phong cách đã được chốt. Phần nào chưa chốt thì để placeholder trong ngoặc vuông và ghi thành câu hỏi mở, không tự chọn.
5. Thay màn mẫu (`Home.dc.html`) bằng màn thật; cập nhật `canvas.json` và bảng màn hình trong `README.md`.

Nếu không chạy được script (môi trường khác), tạo thủ công đúng cây ở mục 1 bằng các file trong `templates/ui-design/`.

## 3. Thêm hoặc sửa một màn

1. Tạo `source/<Tên>.dc.html` theo [references/dc-format.md](references/dc-format.md). Tên PascalCase, trùng với key trong `canvas.json`.
2. Khai báo biến thể trong `data-props`: `enum` sinh một trang cho mỗi option khác default, `boolean` sinh một trang với giá trị ngược default. Trạng thái trống, đang tải, lỗi, khôi phục, chỉ đọc nên là biến thể của cùng màn, không phải file riêng.
3. Dùng `<dc-import name="TopBar" …>` cho shell chung; liên kết giữa các màn viết `href="<Tên>.dc.html"` (render tự đổi thành `.html`).
4. Thêm board vào `canvas.json`: `"<Tên>.dc.html": { "title": "<Mã> · <Tên màn>", "page": "<nhóm>", "w": 1440, "h": 1000, "expand": "fill" }` và thêm vào `order`. `expand: "fill"` bật nút Desktop/Tablet/Điện thoại trong index; bỏ đi cho component kích thước cố định.
5. Shell, style guide, bảng trạng thái không cần biến thể: thêm tên vào `noVariants` trong `tools/ui.config.json`.
6. Chạy `node <ui-design>/tools/render.mjs`, mở index kiểm tra, cập nhật bảng màn hình trong `README.md` và `design.md` nếu quy tắc đổi.

## 4. Quy tắc giữ cấu trúc

- **Không sửa tay `pages/` và `index.html`.** Sửa `source/`, `tools/index.template.html` hoặc `assets/` rồi render lại. Render xóa mọi `pages/*.html` cũ trước khi ghi.
- **Một nguồn sự thật cho CSS dùng chung.** File liệt kê trong `sharedCss` của `ui.config.json` được render (1) gắn bằng `<link>` vào mọi trang, (2) chép nguyên văn vào khối `<style data-ui-shared="<file>">` trong `<helmet>` của từng source để công cụ canvas (không đọc được `../assets`) vẫn hiển thị đúng. Chỉ sửa file trong `assets/`; không sửa khối đã chép.
- **Dữ liệu mẫu nhất quán** giữa các màn (cùng mã, cùng số đếm, cùng trạng thái) và đặt trong `renderVals()`, không rải trong template.
- **Mã màn** (G1, P3, S0, X1, M1…) đặt ở đầu `title` của board; index sắp xếp theo chữ cái rồi số.
- **Không đưa phong cách vào tooling.** `render.mjs`, `serve.mjs` không chứa màu hay font của sản phẩm. Chrome của `index.template.html` để trung tính (biến CSS ở `:root`), dự án đổi nếu muốn.
- Mỗi lần đổi luật thiết kế: cập nhật `design.md` (ghi phiên bản, ngày, người duyệt) và bảng trong `README.md` cùng lượt.

## 5. Kiểm tra trước khi báo xong

1. `node <ui-design>/tools/render.mjs` chạy không lỗi; số trang = tổng (1 + số biến thể) của mọi source.
2. Mở index: mọi màn có trong danh sách, chọn biến thể đổi được trang, nút khổ màn hình chỉ bật với board `fill`, “Mở riêng” mở đúng file.
3. Trong từng trang: không còn `{{…}}`, `<sc-for>`, `<sc-if>`, `<dc-import>`, không còn `href="….dc.html"` (dòng chú thích “Generated … from source/<Tên>.dc.html” là bình thường); không có `id` trùng.
4. `README.md` liệt kê đủ file trong `source/`; `canvas.json` có board cho mọi source (thiếu thì màn rơi vào nhóm đầu, kích thước 1440×900).
5. Trong repo SIRes: đặt `banner` trong `ui.config.json` bằng ba dòng ghi chú giấy phép (như đầu `docs/ui-design/tools/render.mjs`) để trang sinh ra có ghi chú — `add-license.mjs` chỉ bỏ qua `docs/ui-design/pages`, nên `pages/` của một bộ ui-design khác sẽ bị `--check` báo thiếu nếu `banner` rỗng. Chạy `node scripts/docs/add-license.mjs` cho file mới và `--check`; nếu đích nằm trong `docs/`, ghi nhật ký vào `docs/docs_context.md` (R-05).
6. Báo cáo: thư mục đã tạo, số source và trang, phần phong cách còn để placeholder, bước chưa kiểm tra.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
