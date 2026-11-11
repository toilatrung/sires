# PID-00004 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00004](../../../docs/tickets/issues/PID-00004/index.html) · **Luồng:** `platform` · **Giai đoạn:** PH-01
- **Nhánh:** `platform/ts-testing-fakes` (đã commit) · **PR:** chưa mở
- **Cập nhật:** 11/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 3/3 xong. Bị chặn: không có.
- AC: 5/5 đạt (kiểm với Docker thật trong WSL2 và fake trong bộ nhớ). Edge case: 4/4 đã giải quyết; 4 điểm mới cần lưu ý (self-qc.md mục 3).
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Container helper | Xong | tạo: `libs/ts/testing/src/containers/{index,docker,images,postgres,rabbitmq,minio}.ts`, `containers.spec.ts`, `libs/ts/testing/tsconfig.build.json`; sửa: `libs/ts/testing/package.json`, `libs/ts/testing/src/index.ts`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
| S02 | FakeOidcProvider | Xong | tạo: `libs/ts/testing/src/fakes/oidc.fake.ts`, `oidc.fake.spec.ts` |
| S03 | Fake broker, FakeSourceAdapter, LocalKms | Xong | tạo: `libs/ts/testing/src/fakes/{broker.fake,source-adapter.fake,local-kms,index}.ts`, `broker.fake.spec.ts`, `source-kms.spec.ts`; sửa: `libs/ts/testing/src/index.ts` |

## 3. Kết quả

- `@sires/testing` xuất qua `libs/ts/testing/src/index.ts`: `startTestStack`, `startPostgres`, `startRabbitMq`, `startMinio`, `assertDockerAvailable`, `DockerUnavailableError`; `FakeOidcProvider`; `FakeBroker`; `FakeSourceAdapter`, `SourceAdapterError`; `LocalKms`. Package có target `test` (`vitest run`); `dist/` không chứa file spec.
- Container helper khởi động PostgreSQL 16 + pgvector (tự tạo extension `vector`), RabbitMQ, MinIO trên cổng ngẫu nhiên, trả URI kết nối và `stop()` xóa container; không có Docker thì test lỗi với thông báo rõ.
- FakeOidcProvider chạy được với openid-client 6.8.8: discovery, authorization code + PKCE S256, ID token RS256 (`sub`, `name`, `email`) kiểm được bằng `/jwks`, `/userinfo`, refresh xoay vòng có phát hiện dùng lại, RP-initiated logout khớp chính xác URI, chế độ không khả dụng (503 hoặc cắt kết nối). Endpoint bám repo eTroy_OIDC (đọc README và `docs/contracts/oidc/`, không chạy repo). PID-00015 dùng được: xem cách gọi trong `oidc.fake.spec.ts`.
- Fake broker theo topic exchange (routing key = `type`), tiêm trùng và lệch thứ tự xác định theo seed; FakeSourceAdapter theo port kiến trúc 8.7, kịch bản lỗi theo mã `unavailable.code` của `searchSourcesTool`; LocalKms AES-256-GCM có AAD.
- `pnpm nx run-many -t lint typecheck test build -p @sires/testing`: đạt, 13/13 test. Chi tiết và các lệnh còn lại ở self-qc.md.

## 4. Việc còn lại

Không có trong phạm vi. Các điểm chờ PO ở mục 6.

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. **Image MinIO.** `minio/minio` không còn trên Docker Hub (pull báo “repository does not exist”), `quay.io/minio/minio` đòi xác thực (kiểm 11/11/2026). Helper đang dùng `cgr.dev/chainguard/minio:latest` (đổi được bằng tham số hoặc `SIRES_TEST_MINIO_IMAGE`). `infra/local/compose.yaml` vẫn ghi `minio/minio:latest` nên `pnpm local:up` sẽ lỗi ở MinIO. PO chốt nguồn image (và ghim digest như ghi chú “Pin image digests in PH-01” của compose) cho cả compose, helper này và fixture Python của PID-00005; sửa compose thuộc luồng `infra`, cần ticket riêng.
  2. **Lệnh “Kiểm” của slice.** S01–S03 và spec mục 5 ghi `pnpm nx run @sires/platform:test`, nhưng mã của ticket ở `libs/ts/testing` (`@sires/testing:test`). Đề xuất sửa hồ sơ thành `pnpm nx run @sires/testing:test`. Lần này đã chạy cả hai.
  3. **PID-00015.** Ghi vào danh sách “điểm khác stub”: eTroy OIDC không có discovery (`/.well-known/openid-configuration`), stub có; logout của eTroy là `POST /logout` (stub nhận cả GET và POST); stub không thu hồi refresh token khi logout; openid-client v6 với stub http cần `allowInsecureRequests`.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:**
  - S03 ghi “fake broker theo EventEnvelope từ type sinh”, nhưng `@sires/contracts` chưa sinh `EventEnvelope`: `generate.mjs` chỉ sinh OpenAPI, `internal/schemas.yaml` là file dùng chung không sinh riêng, và không spec nội bộ nào `$ref` tới `EventEnvelope`; sinh type từ AsyncAPI là việc của PID-00007 (PID-00004 không phụ thuộc PID-00007). Đã làm `FakeBroker<E extends { id; type }>` generic, test dùng envelope đủ trường theo `internal/schemas.yaml#/EventEnvelope`. Khi PID-00007 xong, consumer truyền type sinh vào `FakeBroker<EventEnvelope>`; có cần đặt type đó làm mặc định trong `@sires/testing` hay không, PO quyết.
  - Image MinIO (đề xuất 1) chưa được PO chốt.
- **Bước tiếp theo:** QC chạy `spec-converge-skill PID-00004`; người điều phối rà nhánh `platform/ts-testing-fakes` rồi mở PR.
- **Tài liệu đi kèm:** không có.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
