# PID-00003 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00003](../../../docs/tickets/issues/PID-00003/index.html) · **Luồng:** `platform` · **Giai đoạn:** PH-01
- **Nhánh:** `platform/ts-service-auth` (đã commit, đã push) · **PR:** [#34](https://github.com/toilatrung/sires/pull/34) · đã merge; sửa sau rà 24/11: [#86](https://github.com/toilatrung/sires/pull/86), [#87](https://github.com/toilatrung/sires/pull/87)
- **Cập nhật:** 25/11/2026 (dòng PR sau merge; kết quả rà 24/11/2026 ở `self-qc.md` Lần 3, PC-04 A7)
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 4/4 xong. Bị chặn: không có.
- AC: 9/9 đạt (8 AC của ticket và NFR-AUTHZ-001-AC01 phần thư viện; test đơn vị và request HTTP thật trên Fastify, client đi qua hai app). NFR-TRANSIT-001-AC01 không áp dụng cho thư viện. Edge case: 11/11 đã giải quyết; 1 điều mới cần lưu ý (x-callers với token chuyển tiếp).
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Khóa ký, phát và kiểm token | Xong | tạo: `libs/ts/platform/src/service-auth/claims.ts`, `keys.ts`, `token.ts`, `token.testkit.ts`, `token.spec.ts`, `index.ts`; sửa: `libs/ts/platform/src/index.ts`, `libs/ts/platform/package.json` (`jose`), `pnpm-workspace.yaml` (catalog `jose: 6.2.17`), `pnpm-lock.yaml` |
| S02 | Guard NestJS và x-callers | Xong | tạo: `service-auth/guard.ts`, `context.ts`, `service-auth.module.ts`, `guard.spec.ts` |
| S03 | Luật actor theo người ký, ngoại lệ aud | Xong | sửa: `service-auth/token.ts` (`checkSignerRules`), `guard.ts` (`@ApprovalEndpoint`); test trong `guard.spec.ts` |
| S04 | Client cho lời gọi đi | Xong | tạo: `service-auth/client.ts`, `client.spec.ts`; sửa: `libs/ts/platform/README.md` |

## 3. Kết quả

`@sires/platform` có xác thực giữa service theo ADR-20 (cách dùng ở `libs/ts/platform/README.md`, luồng ở implement.md):

- `ServiceAuthModule.fromEnv('<service>')` nạp khóa riêng (JWK) và JWKS của môi trường, hoặc `SERVICE_AUTH_DEV_SEED` khi chạy cục bộ.
- `@UseGuards(ServiceAuthGuard)` + `@InternalCallers(...)` + `@ApprovalEndpoint()` trên route nội bộ: `401 invalid_service_token` cho mọi lỗi token và luật người ký, `403 caller_not_allowed` cho `sub` ngoài x-callers hoặc route chưa khai.
- Người gọi (actor, `accountId`, `projectId`, `agentRunId`, `agentScope`) có ở `@ServiceAuth()`, `currentServiceAuth()` và log context.
- `ServiceTokenClient` gắn token cho lời gọi đi; `issueAgentRunToken` cho orchestration.

Lựa chọn hồ sơ giao Dev: thư viện JWT `jose` 6.2.17 (chỉ để kiểm; ký qua interface `ServiceSigner`); lệch đồng hồ 30 s (EC04); client phát token mới cho mỗi lời gọi, không cache; bộ khóa dev chung dẫn xuất từ một seed (notes “cách sinh do Dev chọn”). Chi tiết ở implement.md mục 3.

Kiểm: platform 68/68 test, `nx affected` 19 project đạt, 40 lần chạy lặp không lỗi, tắt từng luật trong 16 luật đều có test bắt (self-qc.md).

## 4. Việc còn lại

Không có trong phạm vi.

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. Xác nhận luật thêm: token agent có `act.agentRunId` khác `agentRunId` của claims bị 401 (self-qc G1).
  2. PID-00005 S03 (bản Python): dùng cùng thuật toán khóa dev (`HMAC-SHA256(seed, "sires-dev-service-key:" + service) mod (n − 1) + 1`, implement.md mục 2) và cùng tên biến `SERVICE_AUTH_PRIVATE_KEY`, `SERVICE_AUTH_PUBLIC_KEYS`, `SERVICE_AUTH_DEV_SEED`, để service TS và Python chạy cục bộ kiểm token của nhau (self-qc G2).
  3. PID-00065, PID-00007, PID-00008: token chuyển tiếp giữ `sub` gốc, nên route x-apr nhận token gateway chuyển tiếp qua orchestration phải có `gateway` trong x-callers, route nhận token Agent Run chuyển tiếp phải có `agent-core` (self-qc G3).
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** không có.
- **Bước tiếp theo:** Dev commit mã và mở PR khi được yêu cầu; PO review, QC độc lập `spec-converge-skill PID-00003`, merge. PID chờ PID này: PID-00006, PID-00017 (cùng PID-00158) và các PID PH-02.
- **Tài liệu đi kèm:** không có.

## Lần 2 — 18/11/2026

Sửa theo [qc-report.md](qc-report.md) Lần 1 và quyết định của PO (comment trên PR #34). Mã ở nhánh `platform/ts-service-auth`, cùng PR #34.

| G | Quyết định PO | Đã làm | Test |
| --- | --- | --- | --- |
| G1 (MEDIUM) | Token agent có `aud` không phải mảng → 401 | `checkSignerRules` từ chối với lý do mới `agent_audience_not_array` (`token.ts:147`) | `guard.spec.ts › aud mảng`: `agentClaims('planning')` → 401, `agentClaims(['planning'])` → 200 |
| G2 (LOW) | Body 401 không nêu lý do | `toInvalidServiceToken` không đặt `detail`; lý do chỉ ở log `warn` (`token.ts:82`) | `guard.spec.ts` (`expect401`): body không có `detail` |
| G3 (LOW) | `title` theo ví dụ hợp đồng | `INVALID_SERVICE_TOKEN_TITLE` “Token nội bộ không hợp lệ”, `CALLER_NOT_ALLOWED_TITLE` “Service không được phép gọi endpoint này” | `expect401` kiểm `title`; `› service ngoài x-callers` kiểm `title` 403 |
| G4 (LOW) | Lỗi parse khóa chỉ nêu tên biến | Bọc parse `SERVICE_AUTH_PRIVATE_KEY` (cả JWK sai) và `SERVICE_AUTH_PUBLIC_KEYS` (`keys.ts`) | `token.spec.ts › nạp khóa từ biến môi trường`: ba giá trị sai, thông báo không chứa giá trị |
| G5 (LOW) | Chỉ đặt một biến khóa → lỗi khởi động | `serviceAuthKeysFromEnv` ném lỗi nêu biến thiếu, kể cả khi có `SERVICE_AUTH_DEV_SEED` | `token.spec.ts › nạp khóa từ biến môi trường` |
| G6 (LOW) | Giữ luật `act.agentRunId = agentRunId` | Không đổi | — |

Kiểm: `nx affected` 19 project đạt; service-auth 26/26; tắt từng sửa đổi (G1, G2, G3 ×2, G4, G5) đều có test lỗi. Chi tiết ở self-qc.md Lần 2. Đề xuất 1 ở mục 6 đã được PO chốt (G6). Phần Python (lệch đồng hồ 30 s, biến `SERVICE_AUTH_*`) PO giao PID-00005, không thuộc PR này.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
