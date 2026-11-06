# PID-NNNNN — Self-QC của Dev

**Kết luận:** Đạt | Chưa đạt — <lý do>

- **Ticket:** [PID-NNNNN](../../../docs/tickets/issues/PID-NNNNN/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** dd/mm/yyyy

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build` | <kết quả thật> |
| `pnpm nx run <project>:test` | <n đạt, n lỗi> |
| `node scripts/docs/add-license.mjs --check` | <kết quả cho file của ticket> |
| `scripts/development/check-tracks.mjs` trên file đã đổi | <luồng nào> |
| `check-ui.mjs`, preview (khi có màn hình) | <kết quả; ảnh chụp đi kèm; hoặc “không có màn hình”> |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-NNNNN-AC01 | `<file › tên test>` | <đạt, lỗi, chưa có test> |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | <đã giải quyết, cần lưu ý, chưa xử lý> | <…> |
| Mới | <…> | <edge case phát hiện khi làm, không có trong `scope.html`; hoặc “không có”> |

## 4. Tự kiểm

Đánh `[x]` điều đã kiểm và đúng; điều không áp dụng ghi “không áp dụng”; điều sai ghi rõ và không đánh dấu.

- [ ] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- [ ] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện.
- [ ] Chuyển trạng thái khớp PRD 18.2 (Task: T-01–T-19 ở 9.8); ghi actor và provenance khi PRD yêu cầu.
- [ ] Context cách ly theo project và task; dữ liệu trong phạm vi tài khoản và project.
- [ ] Gọi model qua Model Gateway; API key không xuất hiện trong log, trace hay thông báo lỗi.
- [ ] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design`.
- [ ] Sự kiện ghi qua outbox trong cùng giao dịch; bên nghe xử lý trùng không sai.
- [ ] Migration là file mới; schema khớp `docs/database/ddl/`; không sửa migration đã có.
- [ ] Giao diện theo `docs/ui-design/design.md`; có trạng thái trống, đang tải, lỗi, chạy lâu.
- [ ] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`.
- [ ] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5.
- [ ] Không còn mã gỡ lỗi (`console.log`, `print`), TODO không có chủ; test mới có tên theo AC, EC.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
