# PID-00007 — Báo cáo QC độc lập

**Kết luận mới nhất:** Còn việc — 0 CRITICAL, 1 HIGH, 1 MEDIUM, 3 LOW (Lần 1, 18/11/2026). QC không tự chạy được test; CI trên `db2655d` đạt

- **Ticket:** [PID-00007](../../../docs/tickets/issues/PID-00007/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 18/11/2026 · spec-converge-skill

Người chạy: agent QC do PO giao (Claude), không mang kết luận của Dev. Mã nguồn: PR #33, nhánh `contracts/asyncapi-python-generation`, commit `db2655d`.

Phạm vi đã đọc: `libs/ts/contracts/scripts/generate.mjs`, `generate.spec.mjs`, `src/messages.check.ts`, `package.json` (target Nx), `libs/py/sires_common/pyproject.toml`, `project.json`, `tests/test_contracts_import.py`, `.gitignore`; đối chiếu `acceptance.html`, `scope.html` (P1–P2, N1–N3, EC01–EC03), spec mục 3–7, ghi chú thiết kế. Đối chiếu thêm `nx.json › targetDefaults`, `infra/docker/node/Dockerfile`, `infra/docker/python/Dockerfile` (đường dựng image có sẵn trên `main`).

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | O1 · EC02 (phần TS chạy riêng được) · image Node có sẵn (`infra/docker/node/Dockerfile`) | contradicts | HIGH | `libs/ts/contracts/package.json`: `build`, `typecheck` phụ thuộc `generate`; `generate` mặc định chạy cả Python và dừng ngay khi không có `uv` (`generate.mjs:94–97`), rồi gọi `uv tool run` tải generator (`generate.mjs:148`, `:158`). `nx.json` cho `build` phụ thuộc `^build`, và 10 service NestJS cùng `libs/ts/platform` phụ thuộc `@sires/contracts`. `infra/docker/node/Dockerfile` dựng trên `node:22-slim` (không có `uv`) bằng `pnpm nx run @sires/${SERVICE}:build` → `contracts:generate` → “Python generation requires uv”: **image của mọi service NestJS không dựng được** (PID-00010, PID-00035). Máy chỉ có Node cũng không build được TS. Suy từ mã (PLAUSIBLE), QC chưa dựng image được vì không có Docker | Tách target: một target sinh TS (`--ts-only`) cho `build`, `typecheck` của `@sires/contracts`; sinh Python ở target riêng (ví dụ `generate-python` hoặc giữ `generate` = cả hai) và chỉ `sires-common:test` (sau này service Python) phụ thuộc nó. Kiểm: `docker build -f infra/docker/node/Dockerfile --build-arg SERVICE=gateway .` đạt trên nhánh |
| G2 | Quy trình hợp đồng (`contract-updating-skill`: PR hợp đồng chỉ chứa hợp đồng) · AC01 | partial | MEDIUM | `src/messages.check.ts:7–17`: danh sách 42 tên message viết tay, kèm `NoMessageUnchecked`. Khi PO thêm hay đổi tên một message trong `events/asyncapi.yaml`, `contracts:typecheck` lỗi cho tới khi sửa file này. PR hợp đồng không được chứa mã, nên CI của chính PR hợp đồng sẽ đỏ | Bỏ danh sách viết tay: kiểm trên `keyof MessagePayloads` (mọi payload là object, không `never`, không `unknown`); số message so với nguồn đã có ở `test_every_message_model` và `generate.spec.mjs`. Giữ ca `agentRun` và `@ts-expect-error` cho AC01 |
| G3 | Tái lập bản sinh | partial | LOW | `generate.mjs:148`, `:158`: `uv tool run --from datamodel-code-generator==0.97.0`, `openapi-python-client==0.28.0` chỉ ghim gói gốc, phụ thuộc bắc cầu không khóa, không có trong `uv.lock`; mỗi máy mới phải có mạng khi generate | Đưa hai generator vào một dependency group của workspace (khóa trong `uv.lock`) và gọi bằng `uv run`; hoặc ghi rõ chấp nhận ở README |
| G4 | Image Python (PID-00010, PID-00035) | partial | LOW | `infra/docker/python/Dockerfile` chép `libs/py` rồi `uv sync`, không chạy generate; checkout sạch không có `sires_common/generated/` (gitignore). Hiện chưa service nào import mã sinh nên chưa lỗi; khi agent-core, knowledge dùng client sinh thì container sẽ `ImportError` | Ghi cho PID-00010: pipeline dựng image chạy generate trước `docker build`, hoặc Dockerfile Python tự sinh |
| G5 | Kiểu cho service dùng client sinh | partial | LOW | `libs/py/sires_common/pyproject.toml`: `mypy` bỏ qua `sires_common.generated` (`follow_imports = "skip"`), nhưng service chạy `mypy` với cấu hình gốc. Chưa kiểm mã sinh qua `mypy --strict` khi service import | Ghi cho PID đầu tiên dùng client sinh (PID-00048, PID-00070): chạy typecheck của service với một import thật |

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00007-AC01 | đạt (có G2) | typecheck | `libs/ts/contracts/src/messages.check.ts › typecheck`; `scripts/generate.spec.mjs › AC01: adding a message…` | QC không chạy; CI `build` trên `db2655d` đạt |
| PID-00007-AC02 | đạt | thật (import, đếm operationId) | `libs/py/sires_common/tests/test_contracts_import.py › test_import`, `› test_import_from_service` | QC không chạy; CI đạt |
| PID-00007-AC03 | đạt | thật (Pydantic) | `test_contracts_import.py › test_message_model` | QC không chạy; CI đạt. Đọc test: payload hợp lệ qua; bỏ từng trường bắt buộc, `attempt` 0 và 4, agent lạ đều lỗi |

Edge case: EC01 có test `generate.spec.mjs › EC01` (lỗi nêu tên file, đầu ra cũ còn nguyên, staging dọn sạch); EC02 có test `› EC02` (thiếu `uv` báo rõ, `--ts-only` chạy được), nhưng xem G1: đường build mặc định không dùng `--ts-only`; EC03: thư mục sinh Python nằm trong `.gitignore`.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run @sires/contracts:generate`, `:typecheck`, `pnpm nx affected -t lint typecheck test build` | không chạy — môi trường QC không có mạng tới npm, PyPI. Tham khảo (không phải QC chạy): CI `build` và `tracks` trên `db2655d` đạt |
| `docker build -f infra/docker/node/Dockerfile --build-arg SERVICE=gateway .` (kiểm G1) | không chạy — không có Docker |
| Đọc `nx.json › targetDefaults`, `apps/*/package.json` | `build`, `typecheck`, `lint`, `test` phụ thuộc `^build`; 10 app NestJS và `libs/ts/platform` phụ thuộc `@sires/contracts` |

### Lệch với Self-QC

- Self-QC kết luận không còn CRITICAL/HIGH. QC thấy G1 (HIGH): self-qc chỉ kiểm trên máy có `uv`, chưa kiểm đường dựng image Node.
- Self-QC không nhắc G2 (danh sách message viết tay chặn PR hợp đồng).

### Việc còn lại, theo thứ tự phụ thuộc

1. G1: tách target sinh TS và Python; `build`, `typecheck` của `@sires/contracts` chỉ cần TS. Kiểm bằng `docker build` image Node của một service, và `pnpm nx run @sires/gateway:build` với `uv` bị bỏ khỏi `PATH`.
2. G2: bỏ danh sách message viết tay trong `messages.check.ts`.
3. Chạy lại lệnh spec mục 6, ghi “Lần 2” ở `self-qc.md`, `report.md`.

### Đề xuất cho PO

- G4, G5 ghi vào hồ sơ PID-00010 và PID-00048, PID-00070 khi làm rõ.
- G3: quyết có khóa generator Python trong `uv.lock` hay không.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
