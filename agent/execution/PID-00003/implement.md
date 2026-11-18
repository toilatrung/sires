# PID-00003 — Triển khai

- **Ticket:** [PID-00003](../../../docs/tickets/issues/PID-00003/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 18/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Mọi file ở `libs/ts/platform/src/service-auth/`, xuất qua `libs/ts/platform/src/index.ts`.

**Nhận lời gọi nội bộ.** Service import `ServiceAuthModule.fromEnv('<service>')` (hoặc `.forRoot`), đặt `@UseGuards(ServiceAuthGuard)` lên controller nội bộ và khai `@InternalCallers(...)` cho từng route, thêm `@ApprovalEndpoint()` cho route x-apr.

1. Middleware mở một ngăn chứa người gọi cho mỗi request (AsyncLocalStorage) — `context.ts:54`
2. Guard đọc `Authorization: Bearer`, thiếu hoặc sai dạng → `missing` — `guard.ts:60`
3. `verifyServiceToken`: đọc header, `alg` phải là ES256, `kid` phải là tên service có trong bộ khóa công khai → jose kiểm chữ ký, `iss = sires-internal`, `exp` (lệch 30 s) → claims qua Zod theo ServiceTokenClaims → `exp` không xa hơn 300 + 30 s → luật người ký — `token.ts:102`
4. Luật người ký (`checkSignerRules`) — `token.ts:139`:
   - `act.type = agent`: `kid = orchestration`, `sub = agent-core`, có `agentRunId`, `agentScope`, `act.agentRunId = agentRunId`; route x-apr từ chối; `aud` (mảng, hoặc một giá trị coi như mảng một phần tử) phải chứa service này.
   - Token khác: `sub = kid`; `aud` mảng bị từ chối; route x-apr chỉ nhận `act.type = researcher` do gateway ký với `aud` là service này hoặc `orchestration`; route khác `aud` phải đúng service này.
5. Lỗi kiểm token → log `warn` chỉ ghi `reason` (không ghi token) → `ProblemException('invalid_service_token', { detail })` → bộ lọc problem+json của PID-00001 trả 401 — `guard.ts`, `token.ts` (`toInvalidServiceToken`)
6. Token đạt → so `sub` với x-callers của route (method ghi đè controller); không khai hoặc không có trong danh sách → `403 caller_not_allowed` — `guard.ts`
7. Đạt → `ServiceAuthContext` (signer, caller, actor, accountId, projectId, agentRunId, agentScope, audience, token) gắn vào `request.serviceAuth`, ngăn chứa ALS và log context (`account_hash`, `project_id`, `agent_run_id`) — `guard.ts`, `context.ts`

**Gọi đi.** `ServiceTokenClient.fetch(target, url, init, auth?)` hoặc `.authorization(target, auth?)` — `client.ts:31`, `client.ts:50`:

1. `{ forwardAgentRunToken: true }` → trả nguyên token Agent Run đang xử lý nếu `target` có trong `aud`; request không mang token agent → lỗi — `client.ts:83`
2. `{ component }` → token mới `act = { type: system, component }`, `accountId`, `projectId` lấy từ tham số hoặc từ request đang xử lý (job, consumer: EC10; việc riêng trong Agent Run: OQ-110)
3. Mặc định → giữ actor, `accountId`, `projectId` của request đang xử lý; không có request → lỗi đòi `component`; request mang token agent → lỗi đòi bên gọi chọn 1 hoặc 2 (không tự ký `act.type = agent`)
4. Token mới phát bởi `issueServiceToken`: `sub` = service mình, `aud` = `target`, `iat`, `exp = iat + 300` — `token.ts:187`

**Phát token Agent Run** (orchestration, PID-00047, PID-00073): `issueAgentRunToken(signer, { audience[], agentRunId, agentScope, agent, instance, accountId, projectId })` — `token.ts:218`; signer khác orchestration hoặc `audience` rỗng → lỗi.

**Khóa.** `ServiceSigner.sign(bytes)` trả 64 byte `r ‖ s` của ES256; JWS được ráp bằng tay ở `sign()` (`token.ts:241`) để adapter KMS (PID-00035, PID-00153) chỉ cần ký byte. Bản cục bộ `localServiceSigner` (`keys.ts:41`) dùng `node:crypto` với `dsaEncoding: 'ieee-p1363'`. Bộ khóa công khai nạp từ JWKS (`keys.ts:64`); `serviceAuthKeysFromEnv` (`keys.ts:140`) đọc `SERVICE_AUTH_PRIVATE_KEY` + `SERVICE_AUTH_PUBLIC_KEYS`, hoặc `SERVICE_AUTH_DEV_SEED` khi không phải production.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `verifyServiceToken` | hàm | `token.ts:102` | Kiểm chữ ký, iss, exp, hạn ≤ 5 phút, schema, luật người ký | Mọi endpoint nội bộ của mọi service TS đi qua; sai thì một service giả danh service khác | Chỉ khóa của `kid` ký được cho `sub = kid`; hạn ≤ 5 phút | `token.spec.ts` (10 test), `guard.spec.ts` |
| `checkSignerRules` | hàm | `token.ts:139` | Luật H1–H4: token agent, x-apr, aud | Giữ NFR-AUTHZ-001 phần thư viện: agent không phê duyệt được | Chỉ orchestration ký token agent; chỉ Researcher do gateway ký qua được x-apr; token gateway chuyển tiếp chỉ qua được x-apr | `guard.spec.ts › luật token agent`, `› luật x-apr`, `› token chuyển tiếp aud orchestration`, `› aud mảng`, `› aud orchestration không do gateway ký` |
| `ServiceAuthGuard` | class | `guard.ts:60` | Bearer → verify → x-callers → ngữ cảnh request | Điểm vào chung của mọi API nội bộ | Mặc định từ chối (route không khai x-callers → 403) | `guard.spec.ts` (12 test) |
| `ServiceTokenClient` | class | `client.ts:31` | Gắn token cho lời gọi đi | Mọi lời gọi service → service; quyết định actor nào đi tiếp | Không bao giờ tự ký `act.type = agent`; chỉ chuyển tiếp token agent tới service có trong `aud` | `client.spec.ts` (4 test) |
| `issueAgentRunToken` | hàm | `token.ts:218` | Phát token Agent Run aud mảng | Nối với orchestration (PID-00047) và agent-core (PID-00073) | Chỉ signer orchestration; hạn ≤ 5 phút | `token.spec.ts › phát token Agent Run` |
| `deriveDevServiceKeys` | thuật toán | `keys.ts:104` | Bộ khóa dev từ một seed | Mọi service chạy `pnpm local:up` phải chung bộ khóa | Bị từ chối khi `NODE_ENV=production` | `token.spec.ts › JWKS công khai và khóa dev dẫn xuất từ seed`, `› nạp khóa từ biến môi trường` |

### Thuật toán: khóa dev dẫn xuất từ seed

- **Vào, ra:** seed (≥ 16 ký tự), danh sách service → khóa riêng P-256 cho từng service, bộ khóa công khai, hàm tạo signer.
- **Các bước:** `d = (HMAC-SHA256(seed, "sires-dev-service-key:" + service) mod (n − 1)) + 1` với `n` là bậc nhóm P-256; tính điểm công khai bằng `createECDH('prime256v1').setPrivateKey(d)`; dựng JWK `{d, x, y}`.
- **Độ phức tạp, chi phí:** 12 phép nhân điểm lúc khởi động; không đáng kể.
- **Trường hợp biên đã xử lý:** `d` luôn trong `[1, n − 1]`; seed ngắn bị từ chối; production bị từ chối. Ai biết seed thì ký được thay mọi service: chỉ dùng cục bộ.

## 3. Quyết định kỹ thuật trong phạm vi

- Thư viện JWT: `jose` 6.2.17 (đã có trong lockfile qua `openid-client`), chỉ dùng để kiểm (`jwtVerify`, `decodeProtectedHeader`); thêm vào catalog `pnpm-workspace.yaml`. Phần ký tự ráp JWS để `ServiceSigner` chỉ ký byte, hợp với KMS.
- Lệch đồng hồ cho phép 30 s (EC04): áp cho `exp` đã qua và cho giới hạn 5 phút (`exp − now ≤ 330 s`).
- Client phát token mới cho mỗi lời gọi, không dùng lại: ES256 ký dưới 1 ms, không có trạng thái cache phải dọn khi actor đổi.
- Thứ tự trong guard: token trước (401), x-callers sau (403), theo brief “kiểm token trước khi làm gì khác”. Route chưa khai x-callers với token hợp lệ → 403; không có token → 401.
- Khai x-callers, x-apr bằng metadata Nest (`@InternalCallers`, `@ApprovalEndpoint`) đọc bằng `Reflector.getAllAndOverride` (method ghi đè controller).
- Ngữ cảnh người gọi qua AsyncLocalStorage riêng của service-auth (middleware của `ServiceAuthModule`), cùng cách với log context của PID-00001; handler đọc bằng `@ServiceAuth()`.
- `ServiceName`, `ServiceTokenClaims` không có type sinh từ hợp đồng (không operation nào tham chiếu): danh sách service chép từ `internal/schemas.yaml`; `ActorRef`, `AgentName`, `AgentInstance` lấy từ type sinh, kiểm đủ bằng `satisfies Record<…>`.
- Token agent phải có `act.agentRunId` bằng `agentRunId` của claims (ActorRef: `agentRunId` bắt buộc khi `type = agent`). Xem self-qc G2.
- Biến môi trường `SERVICE_AUTH_PRIVATE_KEY`, `SERVICE_AUTH_PUBLIC_KEYS`, `SERVICE_AUTH_DEV_SEED`.
- Inject tường minh (`@Inject(Reflector)`, `@Inject(ServiceTokenClient)` trong test) vì vitest/esbuild không phát `design:paramtypes`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
