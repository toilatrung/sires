# PID-00004 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH, 1 MEDIUM, 6 LOW (Lần 1, 25/11/2026)

- **Ticket:** [PID-00004](../../../docs/tickets/issues/PID-00004/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 25/11/2026 · spec-converge-skill

Người chạy: QC độc lập do PO `toilatrung` giao. Mã nguồn: nhánh `main`, commit `e18a38993b83f4bfe91ed2548fbf9996c53431d2` (worktree riêng, nhánh `qc/pid-00004`). Mã của ticket vào `main` qua PR #20 (merge `4224da0`); sau đó `libs/ts/testing/` không đổi.

Môi trường: Windows 11, Node 24.21.0, pnpm 10.34.9, Docker Engine 29.8.2 trong WSL2 `Ubuntu-24.04` qua `DOCKER_HOST=tcp://localhost:2375`, `NX_DAEMON=false`. Docker đang chạy Testcontainers của phiên khác cùng lúc.

Tóm tắt: năm AC và bốn edge case đạt khi chạy thật trên Docker. Thử 24 đột biến ở các chỗ quan trọng: 17 bị test giết, gồm mọi đột biến chạm AC và EC; 7 sống, đều ở hành vi ngoài AC. Mười Output O1–O10 có đúng đường dẫn. Khoảng trống còn lại là độ phủ test của hành vi phụ, một chi tiết chuẩn logout, kiểu `EventEnvelope` sinh và hồ sơ của Dev chưa cập nhật. Không có khoảng trống chặn nghiệm thu hay chặn cổng ra PH-01.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | P2 (authorization code + PKCE) · O3, O8 · `implement.md` mục 2 | partial | LOW | `libs/ts/testing/src/fakes/oidc.fake.ts:325-335`, `:390`; `libs/ts/testing/src/fakes/oidc.fake.spec.ts:230-263` | Hành vi đúng khi QC gọi thử: dùng lại code → 400 `invalid_grant`; code quá 300 s → 400 `invalid_grant`; `/userinfo` với ID token → 401. Nhưng không test nào giữ các hành vi này: các đột biến M19 (bỏ `record.used = true`), M26 (bỏ kiểm hạn code), M21 (bỏ kiểm `redirect_uri` ở `/token`), M20 (`/userinfo` nhận ID token) đều sống. `implement.md` ghi bất biến “Code dùng một lần” và gán cho test AC02, AC03, điều này không đúng. Việc: thêm assert vào `oidc.fake.spec.ts` (dùng lại code, code hết hạn, `redirect_uri` lệch, ID token ở `/userinfo`) |
| G2 | P2 (RP-initiated logout) · O3 | partial | LOW | `libs/ts/testing/src/fakes/oidc.fake.ts:400-409` | Khi có cả `client_id` và `id_token_hint`, provider không kiểm `client_id` có khớp `aud` của ID token không; OIDC RP-Initiated Logout 1.0 mục 2 bắt OP kiểm điều này. QC thử: `id_token_hint` của client A, `client_id=client-b`, URI đã khai báo của B → 302 về URI của B, `logouts` ghi `clientId` là B và `sub` là người dùng của A. EC04 vẫn đạt. Việc: trả 400 `invalid_request` khi hai giá trị lệch nhau, thêm test |
| G3 | P1 · O2, O7 · `implement.md` mục 1 (container helper, bước 4) | partial | LOW | `libs/ts/testing/src/containers/index.ts:57-60` | Khi một container lỗi lúc khởi động, mã dọn các container đã lên, nhưng không có test (M18 sống). `implement.md` mục 2 gán bất biến này cho test `khởi động và dọn container`, test đó không phủ nhánh lỗi. Việc: test `startTestStack` với image không tồn tại cho một container, kiểm hai container còn lại đã bị xóa |
| G4 | P3 · S03 “Làm” (fake broker theo EventEnvelope từ type sinh) · O4, O9 | partial | MEDIUM | `libs/ts/testing/src/fakes/broker.fake.spec.ts:8-18`; `libs/ts/testing/src/fakes/broker.fake.ts:13-16`, `:78`, `:118-124` | `@sires/contracts` đã sinh `components['schemas']['EventEnvelope']` (`libs/ts/platform/src/outbox/envelope.ts:13` đang dùng). QC typecheck `new FakeBroker<EventEnvelope>()` bằng file tạm (đã xóa): đạt. Nhưng test vẫn dùng `TestEnvelope` tự khai và kiểu mặc định của generic vẫn là `BrokerMessage`. Việc chép sâu khi `publish` cũng không có test (M11 sống). Việc: chuyển test sang type sinh, đặt kiểu mặc định theo quyết định của PO (Đề xuất 2), thêm assert chép sâu |
| G5 | `report.md` mục 6, đề xuất 1 (PO đã chốt 11/11/2026) | partial | LOW | `libs/ts/testing/src/containers/images.ts:6-8` | Chú thích còn ghi “the PO decides the final source”. PO đã chốt `cgr.dev/chainguard/minio` (nhật ký 11/11/2026 trong `docs/docs_context.md`; `infra/local/compose.yaml:32-33`; fixture Python cũng dùng image này). Việc: sửa chú thích |
| G6 | Quy tắc 1.4.7 (catalog do luồng infra giữ) · spec mục 7 | contradicts | LOW | `pnpm-workspace.yaml` (PR #20) | PR #20 thêm mục vào catalog của luồng infra. `check-tracks.mjs --stdin` trên 23 file của PR #20 báo `infra, platform, repo` và cảnh báo PR chạm 2 luồng. `self-qc.md` ghi “người điều phối cho phép”, nhưng `report.md` mục 5 không ghi lời đồng ý của PO. Mã đã merge và không cần sửa. PR #30, #34 của luồng platform cũng làm như vậy. Việc: PO ghi nhận ngoại lệ hoặc làm rõ quy tắc (Đề xuất 3) |
| G7 | `report.md`, `implement.md` (hồ sơ kết quả của Dev) | partial | LOW | `agent/execution/PID-00004/report.md:6`, `:45`, `:49-51`; `agent/execution/PID-00004/implement.md:42`, `:44` | `report.md` ghi “PR: chưa mở” trong khi mã đã vào `main` qua PR #20. Ghi “Image MinIO chưa được PO chốt”, nhưng PO đã chốt. Ghi “`@sires/contracts` chưa sinh `EventEnvelope`”, nhưng type đã có. `implement.md` gán bất biến cho những test không phủ chúng (G1, G3). Việc: Dev ghi “Lần 2” trong `report.md` và sửa `implement.md` mục 2 cho đúng test |

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00004-AC01 | đạt | Docker thật (Testcontainers, `pgvector/pgvector:pg16`, `rabbitmq:4-management`, `cgr.dev/chainguard/minio:latest`) | `libs/ts/testing/src/containers/containers.spec.ts › khởi động và dọn container (PID-00004-AC01)` | Đạt, 14,1 s. PostgreSQL `server_version_num` 16, `vector` ≥ 0.8, truy vấn `<->` = 2; RabbitMQ gửi và nhận được; MinIO ghi và đọc được; sau `stop()`, `inspect` trả 404. Đột biến M16 (không tạo extension `vector`) và M17 (`stop()` không dọn) bị giết. Sau mọi lần chạy, `docker ps -a` không còn container pgvector, rabbitmq, minio |
| PID-00004-AC02 | đạt | stub (FakeOidcProvider trong tiến trình, openid-client 6.8.8) | `libs/ts/testing/src/fakes/oidc.fake.spec.ts › luồng authorization code (PID-00004-AC02)` | Đạt. Discovery, code + PKCE S256; ID token có `sub`, `name`, `email`; chữ ký RS256 kiểm được bằng khóa ở `/jwks`. M05 (`/jwks` công bố khóa khác) và M06 (mất claim `name`) bị giết |
| PID-00004-AC03 | đạt | stub | `libs/ts/testing/src/fakes/oidc.fake.spec.ts › refresh xoay vòng và PKCE sai (PID-00004-AC03)` | Đạt. M01 (không kiểm verifier), M02 (refresh dùng lại được), M03 (không đánh dấu family compromised), M22 (`/authorize` không bắt PKCE) bị giết. Ngoài AC: QC thử thấy verifier sai không tiêu code, verifier đúng sau đó vẫn đổi được (400 rồi 200); RFC 7636 không cấm điều này, nên không tính là khoảng trống |
| PID-00004-AC04 | đạt | stub (trong bộ nhớ) | `libs/ts/testing/src/fakes/broker.fake.spec.ts › tiêm trùng và lệch thứ tự (PID-00004-AC04)` | Đạt. M08 (bỏ `duplicateIds`), M09 (xáo không theo seed), M10 (bỏ lệch thứ tự) bị giết |
| PID-00004-AC05 | đạt | stub (trong bộ nhớ) | `libs/ts/testing/src/fakes/source-kms.spec.ts › nguồn giả lập và KMS cục bộ (PID-00004-AC05)` | Đạt. M12 (bỏ kịch bản lỗi), M13 (mất `retryAfterSeconds`), M14 (KMS bỏ AAD) bị giết |
| EC01 | đạt | thao tác tay | `DOCKER_HOST=tcp://localhost:2999 npx vitest run src/containers` | Hai test lỗi với `DockerUnavailableError: Docker is required for @sires/testing containers but no Docker engine is reachable…`, exit 1; không bỏ qua test, không báo đạt giả |
| EC02 | đạt | Docker thật | `libs/ts/testing/src/containers/containers.spec.ts › cổng ngẫu nhiên (PID-00004 EC02)` | Đạt, 6,5 s. Hai PostgreSQL chạy song song có cổng khác nhau, khác 5432, dữ liệu không lẫn. Các lần chạy cũng không đụng Testcontainers của phiên khác trên cùng Docker |
| EC03 | đạt | stub | `libs/ts/testing/src/fakes/oidc.fake.spec.ts › không khả dụng (PID-00004 EC03)` | Đạt. M07 (`setUnavailable` không có tác dụng) bị giết |
| EC04 | đạt | stub | `libs/ts/testing/src/fakes/oidc.fake.spec.ts › logout sai uri (PID-00004 EC04)` | Đạt. M04 (không kiểm `post_logout_redirect_uri`) bị giết. Xem thêm G2 |

S02 “Xong khi: PID-00015 dùng được provider này”: SPK-02 (`apps/gateway/spikes/spk-02/flow.spec.ts`) dùng `FakeOidcProvider` từ `@sires/testing`, 4/4 đạt. S03 “Ba fake xuất qua `libs/ts/testing/src/index.ts`”: đạt (`src/index.ts:8-9`, `src/fakes/index.ts`).

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00004 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| `pnpm install --frozen-lockfile` | Đạt |
| `pnpm nx run-many -t lint typecheck build -p @sires/testing --skip-nx-cache` | Đạt cả 3 target, kèm `@sires/contracts:generate-ts` và `@sires/contracts:build` |
| `pnpm nx run @sires/testing:test --skip-nx-cache` | 4 file, 13/13 test đạt, 25,9 s |
| `npx vitest run --reporter=verbose` (trong `libs/ts/testing`) | 13/13 đạt; tên test khớp `specs/acceptance.html` và `specs/scope.html`; sau khi chạy không còn container của test |
| `DOCKER_HOST=tcp://localhost:2999 npx vitest run src/containers` (EC01) | 2 test lỗi với `DockerUnavailableError`, exit 1 (đúng mong đợi) |
| `pnpm nx run @sires/platform:test --skip-nx-cache` (hồ sơ mục 8; dùng `startPostgres`, `startRabbitMq`) | 171/172 đạt. Một test lỗi: `src/telemetry/telemetry.spec.ts › span và log cùng mã yêu cầu`, hết thời gian 5000 ms; file này không dùng `@sires/testing`, máy đang tải cao. Chạy lại riêng file: 6/6 đạt |
| `pnpm --filter @sires/gateway exec vitest run --dir spikes/spk-02` | 4/4 đạt (SPK-02 của PID-00015 trên FakeOidcProvider) |
| `pnpm nx run sires-common:test` (hồ sơ mục 8) | Không chạy được: `uv sync --all-packages --locked` đạt, nhưng `@sires/contracts:generate-python` lỗi `Failed to spawn: openapi-python-client … An Application Control policy has blocked this file. (os error 4551)`. PID-00004 không đổi mã Python. CI chạy cho push lên `main` tại `e18a389` (run 45457915591): job `python` và `typescript` đạt |
| `pnpm nx affected -t lint typecheck test build` | Không chạy: nhánh QC trùng `origin/main` nên tập affected rỗng. Đã chạy trực tiếp các project liên quan ở các dòng trên |
| `git diff --name-only 4224da0^1 4224da0 \| node scripts/development/check-tracks.mjs --stdin` | `tracks touched: infra, platform, repo`; cảnh báo PR chạm 2 luồng (G6) |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |
| Thử đột biến bằng script tạm của QC (đổi đúng một chuỗi trong mã, chạy một file spec, khôi phục bằng nội dung gốc; cuối cùng `git status` sạch) | 24 đột biến và 1 đối chứng. Bị giết (17): M01–M10, M12–M14, M16, M17, M22, M25. Sống (7): M11 chép sâu khi publish (G4); M15 IV cố định của LocalKms (AC không đòi, không tính khoảng trống); M18 dọn khi một container lỗi (G3); M19, M20, M21, M26 (G1). Đối chứng M27 sống, đúng mong đợi |
| Gọi thử FakeOidcProvider ngoài AC (script tạm của QC, dùng `dist`) | Dùng lại code → 400; verifier sai rồi verifier đúng → 400 rồi 200; `/userinfo` với ID token → 401; refresh token của A do B gửi → 400; code quá 300 s → 400; logout lệch `client_id`/`aud` → 302 (G2) |
| Typecheck `FakeBroker<components['schemas']['EventEnvelope']>` bằng file tạm trong `libs/ts/testing/src` (đã xóa) | `tsc --noEmit` đạt (G4) |
| `check-ui.mjs`, preview | Không áp dụng: ticket không có màn hình |

### Lệch với Self-QC

- `implement.md` mục 2 gán bất biến “Code dùng một lần” cho test AC02, AC03, và gán bất biến “lỗi một container thì dọn các container còn lại” cho test `khởi động và dọn container`. QC thấy mã có hai hành vi này nhưng không test nào giữ: đột biến M19, M18 sống (G1, G3).
- `report.md` ghi “PR: chưa mở”, “Image MinIO chưa được PO chốt” và “`@sires/contracts` chưa sinh `EventEnvelope`”. Trên `main` hiện tại cả ba đã khác: mã vào qua PR #20, PO đã chốt image MinIO ngày 11/11/2026, type `EventEnvelope` đã được sinh (G4, G5, G7).
- `self-qc.md` không có mục 5 “Tự đối chiếu”. Dev làm xong ngày 11/11/2026, trước khi PO chốt DEC-58 ngày 17/11/2026, nên không tính là khoảng trống.
- Các kết quả còn lại khớp với `self-qc.md`: 13/13 test đạt, EC01 lỗi với thông báo rõ, container được dọn, ranh giới chạm `infra` vì catalog.

### Việc còn lại, theo thứ tự phụ thuộc

1. PO ghi nhận hoặc làm rõ việc ticket thêm mục catalog vào `pnpm-workspace.yaml`. Không cần sửa mã (G6, quy tắc 1.4.7).
2. PO chốt có đặt `EventEnvelope` sinh làm kiểu mặc định của `FakeBroker` không. Sau đó Dev chuyển `broker.fake.spec.ts` sang type sinh và thêm assert chép sâu (G4, S03).
3. Dev từ chối logout khi `client_id` lệch `aud` của `id_token_hint`, thêm test (G2, P2).
4. Dev thêm assert vào `oidc.fake.spec.ts`: dùng lại code, code hết hạn, `redirect_uri` lệch ở `/token`, `/userinfo` từ chối ID token (G1, P2).
5. Dev thêm test dọn container khi `startTestStack` lỗi một phần (G3, P1).
6. Dev sửa chú thích `containers/images.ts:6-8` theo quyết định image MinIO ngày 11/11/2026 (G5).
7. Dev ghi “Lần 2” trong `report.md` và sửa `implement.md` mục 2 theo các mục trên (G7).

Không việc nào chặn nghiệm thu PID-00004 hay cổng ra PH-01. Các việc 3–7 có thể gom vào một PR nhỏ của luồng platform.

### Đề xuất cho PO

1. **Lệnh “Kiểm” trong hồ sơ.** S01–S03, spec mục 5 (B1–B5), mục 6 và ticket mục 8 còn 11 dòng ghi `pnpm nx run @sires/platform:test`, trong khi test của ticket nằm ở `@sires/testing`. Đề xuất sửa thành `pnpm nx run @sires/testing:test` (Dev đã đề xuất ở `report.md` mục 6, chưa sửa).
2. **Kiểu mặc định của `FakeBroker`.** Chốt có đặt `components['schemas']['EventEnvelope']` làm mặc định không (Dev để “Còn mở”; G4).
3. **Quy tắc 1.4.7.** Ghi rõ ticket của luồng khác có được thêm mục vào pnpm catalog trong cùng PR không, hay phải tách PR cho luồng infra. PR #20, #30, #34 đều thêm trong cùng PR (G6).
4. **Ghim digest image.** Helper dùng tag trôi (`pgvector/pgvector:pg16`, `rabbitmq:4-management`, `cgr.dev/chainguard/minio:latest`), giống `infra/local/compose.yaml`, nơi vẫn còn ghi chú “Pin image digests in PH-01” (`infra/local/compose.yaml:5`). Nếu đây là điều kiện của PH-01 thì cần ticket cho luồng infra và platform; việc này không thuộc AC của PID-00004.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
