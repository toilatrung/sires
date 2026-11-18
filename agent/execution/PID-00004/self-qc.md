# PID-00004 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00004](../../../docs/tickets/issues/PID-00004/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 11/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Môi trường: Windows 11, Node 24.21.0, pnpm 10.34.9, Docker Engine 29.8.2 trong WSL2 gọi qua `DOCKER_HOST=tcp://localhost:2375`, `NX_DAEMON=false`. Ryuk của testcontainers chạy bình thường, không cần `TESTCONTAINERS_HOST_OVERRIDE`.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run-many -t lint typecheck test build -p @sires/testing --skip-nx-cache` | Đạt cả 4 target. Test: 4 file, 13 test đạt (containers 2, oidc 5, broker 3, source-kms 3); container mất khoảng 13 s khi image đã có sẵn |
| `pnpm nx run @sires/testing:test` (trong lệnh trên) | 13 đạt, 0 lỗi |
| `pnpm nx run @sires/platform:test` (lệnh ở hồ sơ mục 8) | 1 đạt, 0 lỗi (không đổi mã platform) |
| `pnpm nx run sires-common:test` (lệnh ở hồ sơ mục 8) | Lần đầu lỗi: `pytest` chưa có vì chưa chạy `uv sync --all-packages`. Sau `uv sync --all-packages`: 1 đạt |
| `pnpm nx affected -t lint typecheck test build` | 19 project (đổi `pnpm-workspace.yaml` làm mọi project bị ảnh hưởng). Mọi task đạt trừ 4 task `typecheck` Python: `sires-common`, `agent-core`, `knowledge`, `eval` — lỗi môi trường `Failed to spawn: mypy … An Application Control policy has blocked this file (os error 4551)`: Windows chặn `mypy.exe` trong `.venv`. Chạy lại cùng kiểm tra bằng `uv run python -m mypy src` trong từng thư mục: cả 4 “Success: no issues found”. Ticket không đổi mã Python |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu thông báo giấy phép (sau khi xóa cache `.pytest_cache`, `.mypy_cache`, `.ruff_cache` do chính các lệnh trên tạo, đều nằm trong `.gitignore`) |
| `scripts/development/check-tracks.mjs --stdin` trên file đã đổi (so với `origin/main`, cộng file chưa theo dõi) | `tracks touched: infra, platform, repo`; cảnh báo 2 luồng (infra, platform). `infra` là `pnpm-workspace.yaml`, `pnpm-lock.yaml` (thêm phụ thuộc, người điều phối cho phép); `repo` là `agent/execution/PID-00004/` |
| `check-ui.mjs`, preview | Không có màn hình |
| Thao tác tay EC01: `DOCKER_HOST=tcp://localhost:2999 npx vitest run src/containers -t "khởi động"` | Test **lỗi** (không bỏ qua, không đạt giả) với `DockerUnavailableError: Docker is required for @sires/testing containers but no Docker engine is reachable. Start Docker (Linux/WSL2) or set DOCKER_HOST (e.g. tcp://localhost:2375 for Docker inside WSL2). Cause: Could not find a working container runtime strategy` |
| Dọn container | Sau mỗi lần chạy, `GET /containers/json?all=1` không còn container PostgreSQL, RabbitMQ, MinIO nào của phiên test; test AC01, EC02 còn tự kiểm `inspect` trả 404 |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00004-AC01 | `libs/ts/testing/src/containers/containers.spec.ts › khởi động và dọn container (PID-00004-AC01)` | Đạt: PostgreSQL `server_version_num` 16xxxx, `vector` ≥ 0.8, truy vấn `<->` đúng; RabbitMQ gửi và nhận qua AMQP; MinIO tạo bucket, ghi, đọc; sau `stop()` ba container không còn |
| PID-00004-AC02 | `libs/ts/testing/src/fakes/oidc.fake.spec.ts › luồng authorization code (PID-00004-AC02)` | Đạt: openid-client 6.8.8 `discovery` + authorization code + PKCE; ID token có `sub`, `name`, `email`, chữ ký RS256 kiểm được bằng khóa ở `/jwks`, bản bị sửa thì không qua |
| PID-00004-AC03 | `libs/ts/testing/src/fakes/oidc.fake.spec.ts › refresh xoay vòng và PKCE sai (PID-00004-AC03)` | Đạt: refresh token đã dùng → `invalid_grant` (và token mới của family cũng bị từ chối); `code_verifier` sai → `invalid_grant`; thiếu PKCE ở `/authorize` → `invalid_request`, không phát code |
| PID-00004-AC04 | `libs/ts/testing/src/fakes/broker.fake.spec.ts › tiêm trùng và lệch thứ tự (PID-00004-AC04)` | Đạt: kịch bản tường minh cho đúng chuỗi giao mong đợi; kịch bản seed 42 chạy hai lần cho cùng kết quả, có bản trùng và lệch thứ tự, consumer idempotent áp dụng đúng 20 lần |
| PID-00004-AC05 | `libs/ts/testing/src/fakes/source-kms.spec.ts › nguồn giả lập và KMS cục bộ (PID-00004-AC05)` | Đạt: kịch bản `rate_limited` → `SourceAdapterError` mã `rate_limited`, `retryAfterSeconds` 30, đếm 2 attempts; LocalKms giải mã đúng bản đã mã hóa, sai AAD, sai khóa, bản mã bị sửa đều lỗi |

Test thêm (không thuộc AC, giữ hành vi trong phạm vi): `oidc.fake.spec.ts › hết hạn token theo đồng hồ của provider`; `broker.fake.spec.ts › định tuyến theo type như topic exchange`, `› lỗi handler được ghi và ném lại sau khi giao hết`; `source-kms.spec.ts › kịch bản tiêm lỗi một lần rồi trả kết quả lặp lại được`, `› LocalKms xoay khóa…`. Tất cả đạt.

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | Đã giải quyết | `assertDockerAvailable()` ném `DockerUnavailableError` trước khi khởi động; kiểm bằng thao tác tay ở mục 1 (test lỗi với thông báo rõ) |
| EC02 | Đã giải quyết | Cổng host do testcontainers cấp ngẫu nhiên; `containers.spec.ts › cổng ngẫu nhiên (PID-00004 EC02)` chạy hai PostgreSQL song song: cổng khác nhau, khác 5432, dữ liệu không lẫn. Vitest chạy các file test song song trong cùng lần chạy, không xung đột cổng |
| EC03 | Đã giải quyết | `setUnavailable('http_503')`: discovery lỗi, `/authorize` trả 503 `temporarily_unavailable`; `setUnavailable('reset')`: kết nối bị cắt; `setAvailable()` đăng nhập lại được — `oidc.fake.spec.ts › không khả dụng (PID-00004 EC03)` |
| EC04 | Đã giải quyết | `post_logout_redirect_uri` không khai báo → 400 `invalid_request`, không ghi logout; URI khai báo → 302 kèm `state` — `oidc.fake.spec.ts › logout sai uri (PID-00004 EC04)` |
| Mới | Cần lưu ý | Docker Hub `minio/minio` không còn (pull báo “repository does not exist”), `quay.io/minio/minio` đòi xác thực: helper dùng tạm `cgr.dev/chainguard/minio:latest`; `infra/local/compose.yaml` (`minio/minio:latest`) cũng không kéo được. PO chốt nguồn image (report.md mục 6) |
| Mới | Cần lưu ý | RabbitMQ 4.x (`rabbitmq:4-management`, bản 4.4) từ chối queue tạm không exclusive (`transient_nonexcl_queues`), lỗi làm đóng cả kết nối AMQP. Test của luồng khác phải dùng queue `exclusive`, durable hoặc quorum |
| Mới | Cần lưu ý | openid-client v6 chỉ cho HTTPS; với FakeOidcProvider (http://127.0.0.1) client phải bật `allowInsecureRequests` (chỉ trong test). PID-00015 cần biết |
| Mới | Cần lưu ý | `EventEnvelope` chưa có trong type sinh của `@sires/contracts` (PID-00007 mới sinh từ AsyncAPI); fake broker để generic (report.md mục 6) |

## 4. Tự kiểm

Đánh `[x]` điều đã kiểm và đúng; điều không áp dụng ghi “không áp dụng”; điều sai ghi rõ và không đánh dấu.

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên. Mục “Kiểm” của slice ghi `pnpm nx run @sires/platform:test` (đã chạy, đạt); test của ticket nằm ở `@sires/testing:test` nên chạy thêm lệnh này.
- Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện: không áp dụng (thư viện test).
- Chuyển trạng thái khớp PRD 18.2: không áp dụng.
- Context cách ly theo project và task: không áp dụng.
- [x] Không gọi model; không có API key thật. Khóa ký OIDC và khóa KMS sinh trong bộ nhớ cho từng lần chạy; giá trị trong test là chuỗi giả (`test-secret-not-real`, `sk-test-000…`).
- [x] Không import mã, không đọc database của service khác; chỉ dùng `import type` từ `@sires/contracts` (lib dùng chung, `type:lib`).
- Sự kiện ghi qua outbox trong cùng giao dịch: không áp dụng (fake broker giúp test bên nghe xử lý trùng).
- Migration: không áp dụng.
- Giao diện: không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`. Ngoài `libs/ts/testing/` và `agent/execution/PID-00004/` chỉ đổi `pnpm-workspace.yaml` (catalog) và `pnpm-lock.yaml` để thêm phụ thuộc.
- [x] Không làm việc ngoài phạm vi; không có yêu cầu thêm (report.md mục 5).
- [x] Không còn mã gỡ lỗi (`console.log`), không có TODO; test mới có tên theo AC, EC.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
