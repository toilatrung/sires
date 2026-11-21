# PID-00007 — Báo cáo QC độc lập

**Kết luận mới nhất:** Đạt — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 4 LOW (Lần 2, 18/11/2026). G1, G2 đã đóng; G3–G6 là đề xuất cho PO, không chặn merge. QC không tự chạy được test; CI trên `9a7136a` đạt

- **Ticket:** [PID-00007](../../../docs/tickets/issues/PID-00007/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 18/11/2026 · spec-converge-skill

Người chạy: agent QC do PO giao, không mang kết luận của Dev. Mã nguồn: PR #33, nhánh `contracts/asyncapi-python-generation`, commit `db2655d`.

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

## Lần 2 — 18/11/2026 · spec-converge-skill

Người chạy: agent QC do PO giao, không mang kết luận của Dev. Mã nguồn: PR #33, nhánh `contracts/asyncapi-python-generation`, commit `9a7136a` (Dev ghi lượt sửa QC Lần 1 ở `report.md` và `self-qc.md` mục “Lần 3”, trạng thái `Xong — chờ QC`; mã sửa ở `9bca2ff`). Nhánh đã chứa `origin/main` (`b370462`).

Phạm vi đã đọc: trạng thái hiện tại của `libs/ts/contracts/package.json` (target Nx), `scripts/generate.mjs`, `scripts/generate.spec.mjs`, `src/messages.check.ts`, `src/index.ts`, `tsconfig.json`, `README.md`; `libs/py/sires_common/project.json`; `nx.json › targetDefaults`; `apps/*/package.json`, `libs/ts/*/package.json` (phụ thuộc `@sires/contracts`); `infra/docker/node/Dockerfile` (không có `.dockerignore`); `.github/workflows/ci.yml`; `eslint.config.mjs`. Đối chiếu `acceptance.html`, `scope.html` (EC01–EC03) và qc-report Lần 1.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | O1 · EC02 · image Node | — | đóng | Lần theo đồ thị Nx: `@sires/<service>:build` → `^build` (`nx.json`) → `@sires/platform:build`, `@sires/testing:build`, `@sires/contracts:build` → `generate-ts` (`libs/ts/contracts/package.json`: `build`, `typecheck` chỉ `dependsOn: ["generate-ts"]`) → `generate.mjs --ts-only` → `mode = 'ts'`, bỏ qua kiểm `uv` (`generate.mjs:94`) và cả nhánh gọi `uv tool run` (`:144`). `generate-python` chỉ còn là phụ thuộc của `sires-common:test` (`project.json:30`) và của target gom `generate` (`nx:noop`); không project TS nào phụ thuộc `sires-common` hay `generate`. `infra/docker/node/Dockerfile` chỉ chạy `nx run @sires/${SERVICE}:build`, `COPY . .` có `docs/api-design` cho `generate-ts`. CI `9a7136a` xác nhận thứ tự: `contracts:generate-ts` chạy trước `contracts:build`, `generate-python` chỉ chạy trước `sires-common:test`. Test `generate.spec.mjs › EC02` sinh TS với `PATH` rỗng đạt (CI). QC chưa tự dựng image (không có Docker); Dev khai đã dựng được, chưa kiểm lại | Không còn. Nên dựng thử image `gateway` khi làm PID-00010 |
| G2 | `contract-updating-skill` · AC01 | — | đóng | `src/messages.check.ts:8`: `type MessageNames = keyof MessagePayloads`; bỏ danh sách 42 tên và `EveryMessagePresent`, `NoMessageUnchecked` (không còn chỗ nào dùng). Vẫn kiểm mọi payload là object, không `never`, không `unknown` (`:11–16`), giữ ca `agentRun` và `@ts-expect-error` thiếu `attempt` (`:18–28`). Đủ message do bộ sinh bảo đảm: `MessagePayloads` dựng từ chính danh sách `components.messages` của nguồn (`generate.mjs:133–136`). `generate.spec.mjs › AC01` thêm message vào spec tạm, sinh lại, rồi compile chính `index.ts`, `messages.check.ts` hiện tại bằng TypeScript `strict`, kỳ vọng 0 lỗi; CI đạt | Không còn |
| G3 | Tái lập bản sinh | partial | LOW | Mã không đổi (`generate.mjs:148`, `:158` vẫn `uv tool run` chỉ ghim gói gốc). README contracts ghi rõ giới hạn và để PO quyết | PO quyết có khóa toolchain trong `uv.lock` không. Không chặn PR |
| G4 | Image Python (PID-00010) | partial | LOW | `infra/docker/python/Dockerfile` chưa đổi (đúng: ngoài luồng `contracts`); README ghi phải chạy `generate-python` trước `docker build` | Ghi vào hồ sơ PID-00010 |
| G5 | Kiểu cho service dùng client sinh | partial | LOW | Không đổi; README ghi việc kiểm `mypy` với import thật | Ghi vào hồ sơ PID-00048, PID-00070 |
| G6 | EC01 (không để kết quả nửa chừng), khi chạy qua Nx | partial | LOW | Mới do tách target: `nx run @sires/contracts:generate` nay là hai tác vụ độc lập, mỗi tác vụ publish riêng (`package.json` › `generate-ts`, `generate-python`; `generate.mjs:177`). Lỗi chỉ ở phía Python (ví dụ cảnh báo của `openapi-python-client` với `--fail-on-warning`) để `src/generated` TS đã mới mà `sires_common/generated` còn bản cũ; mỗi thư mục vẫn trọn vẹn, nên EC01 theo từng đầu ra vẫn đạt. Gọi thẳng `node scripts/generate.mjs` (không cờ) vẫn publish cả hai cùng lượt. Lỗi cú pháp spec (đúng ca EC01) làm cả hai target cùng dừng. README đã nêu hành vi này | Chấp nhận được; chỉ để PO biết. Nếu cần hai ngôn ngữ luôn cùng phiên bản, dùng lệnh CLI không cờ |

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00007-AC01 | đạt | typecheck | `libs/ts/contracts/src/messages.check.ts › typecheck`; `scripts/generate.spec.mjs › AC01: adding a message…` (nay compile cả `messages.check.ts` thật) | QC không chạy. CI `build` trên `9a7136a`: `contracts:typecheck` đạt, `contracts:test` 3/3 đạt |
| PID-00007-AC02 | đạt | thật (import, đếm operationId) | `libs/py/sires_common/tests/test_contracts_import.py › test_import`, `› test_import_from_service` | QC không chạy. CI: `sires-common:test` 79 đạt, 2 cảnh báo; `generate-python` sinh 9 API nội bộ, 42 message |
| PID-00007-AC03 | đạt | thật (Pydantic) | `test_contracts_import.py › test_message_model` | QC không chạy. CI đạt (cùng lượt 79 test). Test không đổi từ Lần 1 |

Edge case: EC01 đạt theo từng đầu ra (xem G6); EC02 nay đúng cả đường build mặc định (G1); EC03: hai thư mục sinh vẫn trong `.gitignore` (dòng 46–47).

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run @sires/gateway:build` khi bỏ `uv` khỏi `PATH`, `pnpm nx run @sires/contracts:generate`, `pnpm nx affected -t lint typecheck test build` | không chạy — môi trường QC không có mạng tới npm, PyPI nên không cài được `node_modules`. Tham khảo (không phải QC chạy): CI `build` (job `134675889154`) và `tracks` (job `134675888906`) trên `9a7136a` đều `success`; log `build`: 15 project và 2 tác vụ phụ thuộc (`generate-ts`, `generate-python`) đạt |
| `docker build -f infra/docker/node/Dockerfile --build-arg SERVICE=gateway .` | không chạy — không có Docker |
| `node scripts/docs/add-license.mjs --check` | đạt: 0 file thiếu thông báo giấy phép |
| `node scripts/docs/update-index.mjs --check` | đạt: khớp 159 PID, taskboard, `docs/index.html` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00007 --result` | đạt: kết quả đủ, 0 cảnh báo, trạng thái `Xong — chờ QC` |
| `node scripts/development/check-tracks.mjs --base origin/main` | cảnh báo: chạm `contracts`, `infra`, `platform`, `repo` — như Lần 1, do ticket dùng chung sửa `libs/py/sires_common`, `.gitignore`, `uv.lock`; không có file `docs/` hay `apps/` |

### Lệch với Self-QC

- Không lệch về kết luận: QC cũng thấy G1, G2 đã sửa.
- Self-QC khai đã chạy `gateway:build` không có `uv` và dựng image Node đạt; QC không tái hiện được hai lệnh này (lý do ở trên), chỉ xác nhận bằng đồ thị target trong mã và log CI.
- Self-QC không nêu G6 (đánh đổi do tách target), dù README đã mô tả đúng hành vi.

### Việc còn lại, theo thứ tự phụ thuộc

Không còn việc cho Dev trong PR này.

### Đề xuất cho PO

- Có thể merge PR #33 và nghiệm thu PID-00007 (không còn CRITICAL, HIGH, MEDIUM).
- G4 vào hồ sơ PID-00010 (kèm dựng thử image Node `gateway` để chốt G1 bằng lệnh thật); G5 vào PID-00048, PID-00070.
- G3: quyết có khóa generator Python trong `uv.lock` hay không. G6: chỉ ghi nhận.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
