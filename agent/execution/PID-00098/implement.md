# PID-00098 — Triển khai

- **Ticket:** [PID-00098](../../../docs/tickets/issues/PID-00098/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng. Đường dẫn dưới `apps/web/src/features/library/` trừ khi ghi khác.

## 1. Luồng đã triển khai

Khu vực đăng ký ba route (`/discover`, `/library`, `/library/:referenceId`), i18n `library` và mock của khu vực qua `index.tsx`. Mọi lời gọi đi qua client API của shell, mọi lệnh có `Idempotency-Key` đi qua `useShell().idempotency.run`. Màn nghe SSE qua `useEvents` và tín hiệu cần tải lại qua `useStreamSignal`.

**Tìm và nhập từ Discover (S02–S04):**

1. Form tìm (`Discover.tsx:177` `submit`): kiểm truy vấn rỗng và năm (EC01, EC02). Tab Tiêu đề và Từ khóa thêm `filters`, năm chỉ gửi khi nguồn khai `supportedFilters`.
2. `start` (`Discover.tsx:155`) gọi `startDiscoverySearch` hoặc `startAuthorSearch`. Khóa idempotency gắn theo thân yêu cầu, nên bấm lại sau 5xx dùng lại khóa cũ, còn truy vấn khác thì có khóa mới. Mã workflow ghi vào `?search=` để khôi phục (EC08).
3. Đang tìm: thẻ `LongOperation` của shell có nút Hủy (`cancel`, `Discover.tsx:197`; nếu nhận 409 thì đọc lại workflow).
4. Sự kiện `workflow.status_changed` (`Discover.tsx:124`):
   - Succeeded: tải `listDiscoveredResults`.
   - Failed: `readWorkflow` lấy `lastError`.
   - Waiting for User: `listPrompts` rồi hiện thẻ `PromptCard` (H11).
5. Kết quả (`ResultRow`, `Discover.tsx:383`):
   - Dòng thường luôn có nhãn viền đứt `UnreviewedLabel`.
   - Dòng trùng có `DuplicateLabel`: gọi `getReference` để ra nhãn theo `approvalStatus`, ô chọn vô hiệu.
   - Chọn và loại gọi `setDiscoveredResultStatus`, cập nhật lạc quan; lỗi thì trả dòng về trạng thái cũ.
6. Gửi lô (`sendBatch`, `Discover.tsx:223`): `importDiscoveredResults` với tối đa 50 mã. `finishBatch` đọc `lastError` và tải lại kết quả. `BatchSummary` chia mục thành đã tạo, trùng và lỗi; nút “Thử lại các mục lỗi” tạo lô mới với khóa mới.
7. Nhập thủ công (`ManualImport.tsx`):
   - DOI (`sendDois:36`): mỗi DOI một `createReferenceManually` với khóa riêng.
   - BibTeX (`sendBibtex:64`): một lần gọi cho cả văn bản.
   - PDF (`sendPdf:83`): kiểm loại và cỡ ≤ 50 MB trên máy, rồi gửi `FormData`.
   - Nháp DOI và BibTeX nằm trong kho nháp của shell.

**Trusted Library và duyệt (S06, S07):**

1. `LibraryScreen` (`Library.tsx:21`): bộ lọc đổi query của `listReferences` (mặc định chỉ Trusted). Màn có các trạng thái trống, lọc rỗng, đang tải (skeleton), lỗi tại phần và tải thêm theo `nextCursor`. Sự kiện `reference.*` thì tải lại.
2. `PendingPanel` (`Library.tsx:175`) đọc `listReferences` lọc `Pending Approval`; mục có `duplicateWarnings` không có ô chọn. `decide` (`Library.tsx:206`) gửi một `decideReferences` cho cả lô kèm `metadataVersion` đã xem. Mục trả `skipped` ở lại panel kèm lý do; mục `trusted` hoặc `rejected` rời panel và bảng được tải lại.

**Trang Reference (S08, S09):**

1. `ReferenceScreen` (`Reference.tsx:32`) đọc `getReference` (404 thì hiện NotFound của shell) và `getReferenceUsage`. Sự kiện của chính reference này thì tải lại. Thông báo của thao tác gần nhất giữ ở đây; view có `key` theo mã reference nên form đang mở không mất khi tải lại.
2. `ReferenceView` (`Reference.tsx:82`):
   - Hiện hai chip riêng, câu giải thích theo cặp trạng thái (`explanation:22`), và hộp lỗi indexing có “Thử lại indexing” và “Tải PDF khác”.
   - Nút thao tác hiện theo trạng thái. `act` (`:105`) chạy thao tác, báo lỗi kèm mã và đọc lại khi nhận 409.
   - Sửa metadata (`saveMetadata`): gửi `If-Match` và `metadata` đầy đủ. Khi 412: báo, đọc lại và giữ nội dung đang nhập. Nháp nằm ở kho nháp của shell (EC27).
3. Các dialog:
   - Thu hồi (`RevokeDialog:356`): nêu số project và số evidence trước nút xác nhận; lý do bắt buộc.
   - Thêm vào project (`AddToProjectDialog:385`): project đã có reference thì vô hiệu; 422 hiện lý do.
   - Gộp (`MergeDialog:432`), xóa (409 hiện nơi đang dùng).

**Mock của khu vực (S01):** `__mocks__/index.ts` override 23 operation path 10 trên kho `__mocks__/store.ts`.

- Bước nền như tìm xong, nhập xong, index xong chạy qua `store.later`: dev tự chạy sau `delayMs`, test gọi `advance()`. Mỗi bước phát sự kiện qua `emit` (YC1) lên mock `/events`.
- `reset(scenario)` dựng kịch bản cho test: kết quả, lỗi nguồn, mục lỗi, gián đoạn, prompt tác giả, DOI không phân giải.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `ResultRow`, `UnreviewedLabel`, `DuplicateLabel` | component | `Discover.tsx:383`, `:423`; `common.tsx:74` | Vẽ dòng kết quả | AC chính PID-00098-AC01 | Discovered Result không bao giờ mang chip Trusted, chip indexing, BibTeX key hay viền liền | `discover.spec.tsx › kết quả không giống Trusted` |
| `start` | hàm | `Discover.tsx:155` | Bắt đầu lần tìm | Điểm nối workflow discovery; idempotency | Một khóa cho mỗi thân yêu cầu; không tự gửi lại | `› nguồn không phản hồi`, `› nguồn yêu cầu xác minh` |
| `BatchSummary` | component | `Discover.tsx:443` | Tóm tắt lô | AC LIB-IMPORT-001 | Mục trùng không tạo reference; mọi mục tạo ra ở Pending Approval | `› tóm tắt lô có mục lỗi`, `› mục trùng trong lô` |
| `PendingPanel.decide` | hàm | `Library.tsx:206` | Gửi quyết định duyệt theo lô | Thao tác APR-04 do Researcher | Mục nghi trùng không vào lô; gửi `metadataVersion` đã xem; mục `skipped` ở lại | `library.spec.tsx › duyệt lô 20`, `› mục nghi trùng ngoài lô`, `› duyệt một phần lỗi` |
| `saveMetadata` | hàm | `Reference.tsx:130` | Sửa metadata | Ghi dữ liệu dùng cho citation | `If-Match`; không gửi `bibtexKey`; 412 giữ nội dung | `reference.spec.tsx › sửa tiêu đề giữ key`, `› sửa xung đột phiên bản` |
| `RevokeDialog` | component | `Reference.tsx:356` | Xác nhận thu hồi | Thao tác khó đảo ngược, ảnh hưởng evidence | Hậu quả nêu trước nút xác nhận; lý do bắt buộc | `› thu hồi nêu ảnh hưởng hai project` |
| `createLibraryStore` | kho mock | `__mocks__/store.ts` | Dữ liệu và workflow của khu vực | Nền của mọi test và `dev:mock` | Một nguồn cho 23 operation; sự kiện phát đúng thứ tự | toàn bộ 4 file spec |
| `readUpload` | thuật toán | `__mocks__/index.ts:34` | Đọc tên và cỡ phần `file` của multipart | Hai operation tải tệp | — | `import.spec.tsx › PDF hợp lệ gửi multipart`, `reference.spec.tsx › tải PDF lên rồi Indexed` |

### Thuật toán: `readUpload`

- **Vào, ra:** request `multipart/form-data` → `{ name, size }` của phần `name="file"`, hoặc `undefined`.
- **Các bước:**
  1. Lấy boundary từ `Content-Type`.
  2. Đọc byte và tìm từng delimiter `--boundary`.
  3. Đọc header của phần (UTF-8, để tên tiếng Việt đúng).
  4. Cỡ là khoảng từ sau `\r\n\r\n` tới `\r\n--boundary` kế tiếp.
- **Độ phức tạp, chi phí:** O(n·m), m là độ dài delimiter (khoảng 40); chỉ chạy trong mock.
- **Trường hợp biên đã xử lý:** không có boundary, không có phần `file`, boundary trong ngoặc kép.

## 3. Quyết định kỹ thuật trong phạm vi

- Khóa idempotency của lần tìm gắn theo thân yêu cầu (`startDiscoverySearch:<JSON>`). Đáp ứng H7 (mỗi lần Tìm một khóa) và EC03 (bấm lại sau lỗi dùng cùng khóa), không gửi một khóa cho hai thân khác nhau.
- Lỗi và gợi ý của ô nhập đặt ngoài `<label>` và nối bằng `aria-describedby`, để tên truy cập của ô giữ đúng nhãn khi có lỗi.
- `ReferenceView` có `key` theo mã reference, không theo `rowVersion`. Thông báo thao tác giữ ở `ReferenceScreen`, để tóm tắt sau thu hồi và form sửa không mất khi trang tải lại.
- Test chạy shell thật trên router bộ nhớ với mock server của PID-00013 (`test-utils.tsx`). Operation của khu vực khác được override từ cùng kho (H4). `advance()` chạy bước nền, để sự kiện không tới màn hình trước phản hồi 202.
- Trường BibTeX key của dữ liệu mẫu đặt tên `cite`: gitleaks đọc `key: '…'` là khóa API, như ở PID-00013.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
