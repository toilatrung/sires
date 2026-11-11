# PID-00004 — Triển khai

- **Ticket:** [PID-00004](../../../docs/tickets/issues/PID-00004/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 11/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

`@sires/testing` là thư viện test, không có route hay consumer. Service import từ `@sires/testing` (gốc `libs/ts/testing/src/index.ts`), gồm năm thành phần độc lập dưới đây.

**Container helper (S01).**

1. Điểm vào: `startTestStack()` — `libs/ts/testing/src/containers/index.ts:47`, hoặc từng hàm `startPostgres` (`postgres.ts:36`), `startRabbitMq` (`rabbitmq.ts:31`), `startMinio` (`minio.ts:30`).
2. Kiểm Docker trước: `assertDockerAvailable()` — `docker.ts:23` gọi `getContainerRuntimeClient()` của testcontainers; không có engine thì ném `DockerUnavailableError` (thông báo nêu cần Docker, gợi ý `DOCKER_HOST`), test lỗi chứ không bỏ qua (EC01).
3. Khởi động song song ba container, cổng host ngẫu nhiên (testcontainers ánh xạ cổng động, không cố định 5432/5672/9000 — EC02). Image theo `resolveImage()` — `images.ts:25`: tham số → biến môi trường `SIRES_TEST_{POSTGRES,RABBITMQ,MINIO}_IMAGE` → mặc định. PostgreSQL chạy `CREATE EXTENSION IF NOT EXISTS vector` bằng `psql` trong container (`postgres.ts:46-54`).
4. Một container lỗi khi khởi động → dừng các container đã lên rồi ném lỗi. Trả `TestStack` với URI kết nối (`connectionUri`, `amqpUrl`, `endpoint` + khóa) và `stop()` dừng, xóa mọi container. Ryuk của testcontainers dọn nốt nếu tiến trình test chết giữa chừng.

**FakeOidcProvider (S02).**

1. Điểm vào: `new FakeOidcProvider({ clients, users? }).start()` — `fakes/oidc.fake.ts:113`, `:145`; máy chủ `node:http` ở `127.0.0.1` cổng ngẫu nhiên, `issuer = http://127.0.0.1:<port>`.
2. Định tuyến ở `handle()` — `oidc.fake.ts:198`: `GET /.well-known/openid-configuration`, `GET /jwks`, `GET /authorize`, `POST /token`, `GET /userinfo`, `GET|POST /logout`. Chế độ không khả dụng (`setUnavailable('http_503' | 'reset')`, `:186`) chặn ngay đầu `handle()`: trả 503 `temporarily_unavailable` hoặc cắt kết nối (EC03).
3. `/authorize` (`:256`): client và `redirect_uri` khớp chính xác, sai thì 400 không chuyển hướng; `response_type=code`; scope phải có `openid` và chỉ gồm `openid profile email`; bắt buộc PKCE `S256`; người dùng theo `login_hint` (sub hoặc email) hoặc người đầu danh sách; phát code ngẫu nhiên 32 byte, hạn 300 s, 302 về `redirect_uri?code&state`.
4. `/token` (`:315`): xác thực client (`client_secret_basic`, `client_secret_post`, hoặc `none` cho client công khai). `authorization_code` (`:323`) kiểm code chưa dùng, còn hạn, đúng client và `redirect_uri`, `BASE64URL(SHA256(code_verifier)) = code_challenge` (`:332`); trả `access_token` JWT, `id_token`, `refresh_token` mờ, `expires_in` 900. `refresh_token` (`:348`) xoay vòng trong cùng family.
5. Token ký RS256 bằng khóa RSA 2048 sinh mỗi lần tạo provider (`signJwt`, `:441`), header có `kid`; khóa công khai ở `/jwks`. Claim theo scope (`scopedClaims`, `:460`): `sub` luôn có; `profile` → `name`, `picture`; `email` → `email`, `email_verified`.
6. `/userinfo` (`:386`) nhận Bearer access token (có claim `scope`, chưa hết hạn theo đồng hồ provider). `/logout` (`:397`): `id_token_hint` kiểm chữ ký (cho phép đã hết hạn); `post_logout_redirect_uri` phải nằm trong danh sách khai báo của client, sai → 400 `invalid_request` (EC04); đúng → ghi `provider.logouts`, 302 về URI kèm `state`.

**Fake broker (S03).**

1. `new FakeBroker<E>(faults)` — `fakes/broker.fake.ts:78`; `subscribe(consumer, patterns, handler)` (`:100`) tạo hàng đợi theo consumer, ràng buộc theo mẫu topic (`topicMatches`, `:55`: `*` đúng một từ, `#` không hoặc nhiều từ).
2. `publish(envelope)` (`:118`) định tuyến theo `envelope.type` (routing key = `type`, exchange `sires.events` loại topic), chép sâu vào từng hàng đợi khớp; chưa giao.
3. `flush()` (`:141`) giao lần lượt từng consumer theo thứ tự đăng ký, mỗi lô qua `applyFaults()` (`:180`): nhân bản theo `duplicateIds` hoặc `duplicateRate`, rồi đảo trong từng cửa sổ `reorder.window` (`reverse`, hoặc xáo bằng PRNG có seed). Handler chạy tuần tự, được publish tiếp (giao ở vòng sau của cùng flush, tối đa 1000 vòng). Lỗi handler ghi vào `deliveries` và ném gộp `AggregateError` sau khi giao hết.

**FakeSourceAdapter (S03).** `fakes/source-adapter.fake.ts:73` theo port `SourceAdapter` của kiến trúc 8.7 (`key`, `capabilities()`, `search()`, `getRecord()`, `listAuthorPublications()`). Mọi lời gọi qua `gate()` (`:146`): lỗi tiêm một lần (`failNext`) → kịch bản cố định (`scenario`) → lỗi mặc định (`no_results` khi `getRecord` không thấy); ghi `calls` để đếm attempts. Kết quả chỉ lấy từ `records` truyền vào, lọc theo từ khóa và bộ lọc, phân trang bằng offset.

**LocalKms (S03).** `fakes/local-kms.ts:26`: `encrypt(plaintext, aad?, keyId?)` (`:48`) AES-256-GCM, IV ngẫu nhiên 12 byte; `decrypt(ciphertext, aad?)` (`:59`) đọc `keyId` trong bản mã; sai khóa, sai AAD hay bản mã bị sửa → `LocalKmsError`. `addKey(keyId, key?, makePrimary)` (`:36`) mô phỏng xoay khóa: bản mã cũ vẫn giải được.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `startTestStack` | hàm | `libs/ts/testing/src/containers/index.ts:47` | Khởi động song song PostgreSQL + pgvector, RabbitMQ, MinIO; trả URI và `stop()` | Test tích hợp của mọi service dùng | Cổng ngẫu nhiên; lỗi một container thì dọn các container còn lại | `containers.spec.ts › khởi động và dọn container` |
| `assertDockerAvailable` | hàm | `libs/ts/testing/src/containers/docker.ts:23` | Ném `DockerUnavailableError` khi không có Docker | Quyết định test báo lỗi hay báo đạt giả (EC01) | Không bao giờ bỏ qua test | Thao tác tay (EC01), ghi ở self-qc.md |
| `FakeOidcProvider.exchangeCode` | hàm | `libs/ts/testing/src/fakes/oidc.fake.ts:323` | Đổi code lấy token, kiểm PKCE S256 | AC02, AC03; PID-00015, PID-00038 dựa vào | Code dùng một lần; verifier sai bị từ chối | `oidc.fake.spec.ts › luồng authorization code`, `› refresh xoay vòng và PKCE sai` |
| `FakeOidcProvider.rotateRefreshToken` | thuật toán | `libs/ts/testing/src/fakes/oidc.fake.ts:348` | Xoay refresh token theo family, phát hiện dùng lại | AC03 | Mỗi family một token active; dùng lại → cả family compromised | `oidc.fake.spec.ts › refresh xoay vòng và PKCE sai` |
| `FakeOidcProvider.logout` | hàm | `libs/ts/testing/src/fakes/oidc.fake.ts:397` | RP-initiated logout, khớp chính xác `post_logout_redirect_uri` | EC04 | Không chuyển hướng tới URI chưa khai báo | `oidc.fake.spec.ts › logout sai uri` |
| `FakeBroker.flush`, `applyFaults` | thuật toán | `libs/ts/testing/src/fakes/broker.fake.ts:141`, `:180` | Giao message với trùng và lệch thứ tự xác định | AC04; mọi test consumer và inbox idempotent dùng | Cùng seed, cùng chuỗi publish → cùng chuỗi giao | `broker.fake.spec.ts › tiêm trùng và lệch thứ tự` |
| `FakeSourceAdapter.gate` | hàm | `libs/ts/testing/src/fakes/source-adapter.fake.ts:146` | Áp lỗi tiêm hoặc kịch bản, ghi attempts | AC05; test retry, rate limit của library | Mọi lời gọi đều được ghi | `source-kms.spec.ts › nguồn giả lập và KMS cục bộ` |
| `LocalKms.encrypt`, `decrypt` | class | `libs/ts/testing/src/fakes/local-kms.ts:48`, `:59` | AES-256-GCM với AAD | AC05; test envelope encryption của identity, agent-core, knowledge | Sai AAD, sai khóa, bản mã bị sửa đều thất bại | `source-kms.spec.ts › nguồn giả lập và KMS cục bộ` |

### Thuật toán: chèn lỗi giao message (`applyFaults`)

- **Vào, ra:** lô message của một consumer (thứ tự publish) → danh sách giao, mỗi phần tử có cờ `redelivered`.
- **Các bước:** (1) duyệt từng message; nếu `id` thuộc `duplicateIds` hoặc PRNG < `duplicateRate` thì chèn bản sao (`redelivered: true`) ngay sau bản gốc. (2) Có `reorder` với `window ≥ 2`: cắt danh sách thành các cửa sổ liên tiếp; `reverse` đảo từng cửa sổ, `shuffle` dùng Fisher–Yates với PRNG mulberry32 (seed mặc định 1).
- **Độ phức tạp, chi phí:** O(n) mỗi lô.
- **Trường hợp biên đã xử lý:** `duplicateRate` ngoài [0, 1] hay `window` không phải số nguyên dương → `RangeError`; handler publish vô hạn → dừng sau 1000 vòng.

### Thuật toán: xoay vòng refresh token (`rotateRefreshToken`)

- **Vào, ra:** refresh token mờ + client → token mới cùng family, hoặc `invalid_grant`.
- **Các bước:** băm SHA-256 token (chỉ lưu bản băm); không thấy hoặc khác client → `invalid_grant`; không còn `active` hoặc family đã compromised → đánh dấu cả family compromised, `invalid_grant`; hết hạn → `invalid_grant`; còn lại → đánh dấu `consumed`, phát token mới cùng `familyId`. Phản hồi refresh không có `id_token` (theo hợp đồng refresh của eTroy OIDC).
- **Độ phức tạp, chi phí:** O(số token) khi đánh dấu compromised; không đáng kể trong test.
- **Trường hợp biên đã xử lý:** dùng lại token cũ sau khi đã xoay (AC03) làm token mới của family cũng bị từ chối.

## 3. Quyết định kỹ thuật trong phạm vi

- Thêm target `test` (`vitest run`) và `tsconfig.build.json` loại `*.spec.ts` khỏi `dist/`, giống `libs/ts/platform`.
- Phụ thuộc thêm vào catalog (`pnpm-workspace.yaml`): `testcontainers`, `@testcontainers/{postgresql,rabbitmq,minio}` 12.2.1 (dependencies); `openid-client` 6.8.8, `pg` và `@types/pg` 8.23.1, `amqplib` 2.2.0, `minio` 8.0.7 (devDependencies, chỉ test dùng). Các bản chọn đều phát hành trước 28/10/2026. `@sires/contracts` (`workspace:*`) chỉ dùng `import type` cho `ReferenceMetadata`, `DiscoverySource`, `DiscoverySearchRequest.filters` và mã lỗi `unavailable.code` của `searchSourcesTool`.
- Ký JWT và dựng JWKS bằng `node:crypto`, không thêm `jose`: provider chỉ cần RS256.
- Image PostgreSQL và RabbitMQ trùng `infra/local/compose.yaml` (`pgvector/pgvector:pg16`, `rabbitmq:4-management`). MinIO mặc định `cgr.dev/chainguard/minio:latest` vì `minio/minio` (Docker Hub) và `quay.io/minio/minio` không còn kéo được (kiểm 11/11/2026); đổi được bằng tham số hoặc `SIRES_TEST_MINIO_IMAGE`. Nguồn image cuối cùng chờ PO (report.md mục 6).
- RabbitMQ 4.x không cho tạo queue tạm không exclusive (`transient_nonexcl_queues`); test dùng queue `exclusive`.
- Fake broker generic theo `BrokerMessage { id, type }` vì `EventEnvelope` chưa có trong type sinh (report.md mục 6); test dùng envelope đủ trường theo `internal/schemas.yaml#/EventEnvelope`.
- FakeOidcProvider phục vụ thêm discovery document (eTroy OIDC không có `/.well-known/openid-configuration`) để openid-client dùng `discovery()`; các endpoint còn lại cùng đường dẫn với eTroy (`/authorize`, `/token`, `/userinfo`, `/jwks`, `/logout`). Access token và ID token hạn 900 s; refresh 30 ngày; code 300 s (theo tài liệu hợp đồng của repo eTroy_OIDC). Logout không thu hồi refresh token (hợp đồng eTroy để tùy chọn), chỉ ghi `logouts`. Tùy chọn `now` chỉ dùng cho test hết hạn; client openid-client vẫn kiểm `iat`/`exp` theo đồng hồ thật.
- FakeSourceAdapter ném `SourceAdapterError(code, retryAfterSeconds)` thay vì trả `unavailable`: `unavailable` là dạng trả về của API library, còn port adapter trả `Promise` nên lỗi là reject.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
