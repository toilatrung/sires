# Định dạng nguồn `.dc.html`

Đây là định dạng component của công cụ Design canvas. `tools/render.mjs` chỉ hỗ trợ tập con mô tả dưới đây; viết ngoài tập con này thì trang render sai mà không báo lỗi.

## Khung file

```html
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Trang chủ</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style data-ui-shared="assets/tokens.css">/* render tự chép, không sửa */</style>
<style>
  /* CSS riêng của màn, nếu cần */
</style>
</helmet>
<div class="screen">
  <dc-import name="TopBar" active="home" hint-size="100%,56px"></dc-import>
  <h1>{{heading}}</h1>
  <sc-if value="{{isEmpty}}"><p>{{emptyText}}</p></sc-if>
  <ul>
    <sc-for list="{{items}}" as="it" hint-placeholder-count="3">
      <li><a href="{{it.href}}">{{it.name}}</a></li>
    </sc-for>
  </ul>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"state":{"editor":"enum","options":["normal","empty","loading"],"default":"normal"},"$preview":{"width":1440,"height":900}}'>
class Component extends DCLogic {
  renderVals() {
    const s = this.props.state ?? 'normal';
    return { heading: 'Trang chủ', isEmpty: s === 'empty', emptyText: 'Chưa có mục nào.', items: s === 'empty' ? [] : [ { name: 'Mục A', href: 'Detail.dc.html' } ] };
  }
}
</script>
</body>
</html>
```

`<script src="./support.js">` là runtime của canvas; render bỏ qua nó. Giữ nguyên nếu dùng canvas, bỏ được nếu chỉ dựng bằng render.

## Các phần render đọc

| Phần | Bắt buộc | Render làm gì |
| --- | --- | --- |
| `<title>` | Nên có | Tiêu đề trang và tên dự phòng trong index |
| `<x-dc>…</x-dc>` | Có | Toàn bộ template |
| `<helmet>…</helmet>` | Không | Gom vào `<head>` của trang (mỗi helmet một lần dù component import nhiều lần) |
| `<script type="text/x-dc" data-dc-script data-props='…'>` | Có | `data-props`: JSON khai báo prop; thân script phải định nghĩa `class Component extends DCLogic` có `renderVals()` |

## Cú pháp template

| Cú pháp | Ý nghĩa |
| --- | --- |
| `{{path}}` | Chèn giá trị đã escape HTML. `path` là `a.b.c`, số, `'chuỗi'`, `true`, `false`, `null`. Không có biểu thức (`a + b`, `!a`, gọi hàm) — tính sẵn trong `renderVals()` |
| `attr="{{path}}"` | Cả thuộc tính là một hole: `true` → thuộc tính rỗng (`disabled`), `false`/`null` → bỏ thuộc tính |
| `<sc-for list="{{arr}}" as="x">` | Lặp; trong thân có `x` và `$index`. `hint-*` chỉ cho canvas |
| `<sc-if value="{{cond}}">` | Hiện khi truthy. Không có else: dùng hai `sc-if` với hai cờ |
| `<dc-import name="Tên" prop-a="…">` | Render `source/Tên.dc.html` với prop; `prop-a` → `propA`; giá trị có thể là hole. `hint-*` bị bỏ |
| `href="Tên.dc.html"` | Đổi thành `Tên.html` trong trang sinh ra |

Lồng các thẻ cấu trúc được; thẻ phải đóng đúng cặp.

## data-props

```json
{
  "state": { "editor": "enum", "options": ["normal", "empty", "loading"], "default": "normal" },
  "dark":  { "editor": "boolean", "default": false },
  "active": { "editor": "string", "default": "home" },
  "$preview": { "width": 1440, "height": 900 }
}
```

- `enum`: mỗi option khác default thành một trang `<Tên>--state-empty.html`.
- `boolean`: thêm một trang `<Tên>--dark.html` với giá trị ngược default.
- Kiểu khác (`string`, `number`…): chỉ lấy `default`, không sinh biến thể.
- Khóa bắt đầu bằng `$` là metadata của canvas, render bỏ qua.
- JSON nằm trong thuộc tính nháy đơn: viết `&#39;` cho dấu nháy đơn, `&amp;` cho `&`.

## Component class

- `this.props` là default + prop của biến thể (hoặc prop truyền qua `dc-import`).
- `renderVals()` trả object phẳng hoặc lồng; mọi giá trị template cần phải có ở đây, kể cả chuỗi giao diện và màu theo trạng thái nếu bạn để style inline.
- Có `this.state`, `setState`, `forceUpdate` cho canvas tương tác; render tĩnh chỉ gọi `renderVals()` một lần.
- Không dùng `window`, `document`, `fetch`: render chạy trong Node.

## Khối CSS dùng chung

Mỗi file trong `sharedCss` có một khối `<style data-ui-shared="<đường dẫn>">` trong helmet. Render ghi đè khối đó bằng nội dung file hiện tại (thêm vào đầu helmet nếu chưa có), rồi bỏ nó khỏi trang sinh ra vì trang đã có `<link>`. Vì vậy source luôn tự đứng được trên canvas và trang không chứa hai bản CSS.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
