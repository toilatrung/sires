# PID-00034 — Triển khai

- **Ticket:** [PID-00034](../../../docs/tickets/issues/PID-00034/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 21/11/2026

## 1. Luồng đã triển khai

1. `pnpm --filter @sires/e2e e2e` nạp `e2e/playwright.config.ts`: Chromium,
   hai project `vi`/`en`, URL từ `E2E_BASE_URL`, hai worker, HTML và JUnit.
   Không có webServer mock; cần web thật đang chạy. Smoke mở `/`, kiểm `/dashboard`,
   title và browser locale. Lỗi truy cập ghi rõ URL.
2. `generateFixtures(seed, profile)` ở `e2e/fixtures/generate.ts:19` sinh snapshot
   chuẩn hoặc quy mô. ID, timestamp, PDF và nội dung không phụ thuộc trạng thái máy.
   Snapshot dùng type của PublicApi từ `@sires/contracts`; không gọi service hay model.
3. `createLoadPlan` ở `e2e/fixtures/load.ts:24` lập lời gọi công khai có account,
   method, path, header, payload và capture. ID mới tham chiếu phản hồi API qua
   placeholder; không giả định ID fixture là ID mà server cấp.
4. `loadFixtures` ở `e2e/fixtures/load.ts:74` kiểm URL, từ chối nạp thật, xuất JSONL
   qua callback. `e2e/fixtures/cli.ts` nối generator với stdout. Không đọc key từ env,
   không mở mạng, không ghi DB. Lịch sử scale không được đưa vào API dưới dạng snapshot.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Vai trò và bất biến | Test |
| --- | --- | --- | --- | --- |
| `generateFixtures` | Hàm | `e2e/fixtures/generate.ts:19` | Cùng seed, profile → cùng dữ liệu; A/B riêng, P1/P2 của A; tham chiếu project không lẫn | `fixtures.spec.ts`, TS-00-03/04 |
| `SCALE` | Số liệu | `e2e/fixtures/generate.ts:11` | Các kích thước PRD 16.4; 200 Task ổn định trên 50 Plan Version | TS-00-04 |
| `samplePdf` | Hàm | `e2e/fixtures/documents.ts:6` | PDF gốc tự tạo có text hoặc chỉ có image, offset xref tính theo byte | TS-00-03 |
| `createLoadPlan` | Hàm | `e2e/fixtures/load.ts:24` | Operation có thật trong API công khai; CSRF cho lệnh ghi; key là tham chiếu env; duyệt reference theo lô tối đa 200 | TS-00-05/06 |
| `loadFixtures` | Hàm | `e2e/fixtures/load.ts:74` | Dry-run mặc định, không mạng; không thể nạp production; URL không có credentials/query/fragment | TS-00-05/07 |

### Thuật toán: định danh và bộ dữ liệu quy mô

- Vào: seed dạng chuỗi/số và profile `standard` hoặc `scale`.
- SHA-256 trên seed và khóa entity; cắt hash thành UUID có version/variant hợp lệ.
  Thời điểm fixture cố định. Khóa entity có project/account để tách dữ liệu.
- Tài liệu quy mô có nội dung khác nhau để 2.000 Source Document không bị gộp bởi
  cùng content hash. Metadata và BibTeX key cũng riêng.
- Mỗi project có 50 Plan Version × 200 định nghĩa Task với taskId ổn định;
  2.000 workflow; 20.000 Agent Run; 500 reference; 10.000 evidence;
  2.000 artifact version; 200 file và 2.000 revision. Thư viện của A có 5.000 reference.
- Chi phí O(tổng số record); generator scale vật hóa toàn bộ snapshot, không dùng
  để chứng minh hiệu năng hoặc provider hợp lệ. Bộ KPI có nhãn do PO cấp riêng.

## 3. Quyết định kỹ thuật trong phạm vi

- Nhóm `TS-00-*` là kiểm khung kỹ thuật; không nhận các hành trình PRD đã nghiệm thu.
- Hai worker hạn chế bộ nhớ khi tạo snapshot lớn và chạy CLI con.
- Type-only import từ `@sires/contracts`; TypeScript cho phép import đuôi `.ts`
  để Node 22+ chạy CLI bằng strip-types, không thêm runtime build.
- Kết nối hợp lệ dự kiến chỉ giữ tên biến env; key sai là chuỗi tổng hợp công khai.
- Chưa thực thi nạp thật vì ngoài phạm vi PID-00034. A/B được xác thực OIDC trước
  ở PID cổng, không tạo API account hoặc giả lập OIDC trong ticket này.
- Lockfile chỉ đổi importer `e2e` khi thêm contracts và YAML dùng trong test đối chiếu.
  Không sửa mã infra; công cụ phân loại root lockfile là infra nên phát cảnh báo hai luồng.
- Chromium hệ thống hỗ trợ qua `E2E_CHROMIUM_EXECUTABLE` để chạy kiểm Linux/Docker.

### YC1 — sửa kiểm tra platform, Lần 2

`libs/ts/platform/src/errors/errors.spec.ts` tách ca body 2 MB thành test riêng.
Test dùng `app.inject()` qua Fastify thật và global `ProblemJsonFilter`, kiểm status 413,
content-type problem+json, mã trong catalog, type và correlationId. Không mock parser,
filter hoặc response. Các ca lỗi khác vẫn đi qua HTTP thật bằng `fetch`.

Fastify có thể đóng socket khi còn body quá lớn chưa đọc, làm `fetch` nhận ECONNRESET
trên Windows trước khi đọc response. Kiểm ánh xạ lỗi 413 qua inject loại bỏ phụ thuộc
vào thời điểm đóng socket. Không sửa logic runtime, giới hạn body hoặc mã lỗi API.

Kiểm Docker/Python trên máy này cần `DOCKER_HOST=tcp://127.0.0.1:2375` và
`TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`. Chỉ đặt trong tiến trình
chạy lệnh kiểm, không đổi biến môi trường user hoặc cấu hình Docker.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).
