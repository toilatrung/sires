# PID-00010 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH, 2 MEDIUM, 4 LOW (Lần 1, 20/11/2026). AC02, AC03 đạt (bằng chứng CI, helm 3.19.0). AC01 đạt với agent-core chạy trong container thật; phần NestJS QC chỉ kiểm thay thế trên host vì máy QC không có image `node:22-slim` và không được pull. Nên sửa G1 (khối giấy phép của 9 file mới) trước khi merge vì việc nhỏ

- **Ticket:** [PID-00010](../../../docs/tickets/issues/PID-00010/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 20/11/2026 · spec-converge-skill

Người chạy: agent QC độc lập do PO giao, không mang kết luận của Dev. Mã nguồn: PR #42, nhánh `infra/pid-00010-docker-helm`, commit `fbdc425` (`fbdc425992fd180e37926a56df76e66bd09fb685`), gốc là `origin/main` `cd25a65` (đúng nhánh đích theo DEC-59: PID-00010 thuộc PH-01).

Phạm vi đã đọc: `infra/docker/node/Dockerfile`, `infra/docker/python/Dockerfile`, hai `Dockerfile.dockerignore`; `infra/helm/sires-service/` (`Chart.yaml`, `values.yaml`, `templates/_helpers.tpl`, `deployment.yaml`, `service.yaml`, `serviceaccount.yaml`, `migration.yaml`); `scripts/development/check-charts.mjs`; `.github/workflows/ci.yml`; `package.json`, `pnpm-workspace.yaml`; `infra/README.md`; 12 file `apps/*/deploy/values.yaml` (chỉ đọc). Đối chiếu trang ticket (mục 1–8, H1), `specs/acceptance.html`, `specs/scope.html` (P1–P4, N1–N4, EC01–EC03), `specs/index.html` mục 2–7 (O1–O6, quy tắc 4.4, lỗi 4.7, B1–B4), slice S01–S03, `designs/notes.html`, kiến trúc 11.2–11.3, quy tắc 1.4.

Máy QC không có `helm`. Phần Helm dựa trên đọc template và bằng chứng CI thật của PR (run `44667986097`, ghi rõ ở bảng lệnh), không phải chạy cục bộ.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | Nguyên tắc giấy phép (`AGENT.md` “file mới chạy `add-license.mjs`”; `LICENSES.md`) | partial | MEDIUM | 9 file mới của PR chỉ có một dòng `SPDX-License-Identifier`, thiếu hai dòng “SIRes — Copyright © 2026 …” và “Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; …”: `infra/helm/sires-service/templates/_helpers.tpl:1`, `templates/migration.yaml:8`, `templates/serviceaccount.yaml:1`, `infra/docker/node/Dockerfile.dockerignore:1`, `infra/docker/python/Dockerfile.dockerignore:1`, `scripts/development/check-charts.mjs:1`; chân trang `agent/execution/PID-00010/report.md:43`, `implement.md:21`, `self-qc.md:42` thiếu câu “Sole decision-maker … Non-commercial use only …” so với khung `PID-Template`. File có sẵn cùng thư mục mang đủ khối 3 dòng (`templates/deployment.yaml:1–3`, `infra/docker/node/Dockerfile:1–3`). QC quét mọi file Git theo dõi: chỉ 9 file này có SPDX mà thiếu khối đầy đủ. `add-license.mjs --check` vẫn đạt vì chỉ tìm mã SPDX (`scripts/docs/add-license.mjs:5–6`: file đã có SPDX thì bỏ qua) | Bổ sung hai dòng còn thiếu ngay tại chỗ dòng SPDX hiện có (giữ vị trí trong nhánh `if` của `migration.yaml`, giữ cú pháp `{{/* */}}` của `_helpers.tpl`); chân trang ba file md theo khung `agent/execution/PID-Template/` |
| G2 | O4 (spec mục 3; ticket “Đầu ra”; brief) · S02 | partial | LOW | Spec O4 ghi `infra/helm/sires-service/templates/migration-job.yaml (tạo mới)`; mã tạo `infra/helm/sires-service/templates/migration.yaml:1–29`. `report.md`, `implement.md` không ghi lệch tên. Chức năng đủ (AC02 đạt) | Đổi tên thành `migration-job.yaml` theo O4, hoặc ghi lệch vào `report.md` mục 6 để PO chấp nhận tên mới |
| G3 | Quy tắc 1.4.7 (phiên bản dùng chung khai báo một chỗ, pnpm catalog do luồng infra giữ) | partial | LOW | `package.json:30` `"yaml": "2.9.0"` ghim trực tiếp, trong khi mọi devDependency gốc khác dùng `catalog:` (`package.json:22–29`) và `pnpm-workspace.yaml:10–11` ghi “One version per shared dependency (rule 1.4.7)” | Thêm `yaml: 2.9.0` vào `catalog:` trong `pnpm-workspace.yaml`, đổi `package.json` thành `"yaml": "catalog:"`, chạy lại `pnpm install` (không sửa tay `pnpm-lock.yaml`) |
| G4 | PID-00010-AC02 (“sandbox-runner thì không có”) · PID-00010-AC03 (“mọi `apps/<service>/deploy/values.yaml`”) · S02, S03 | partial | LOW | `scripts/development/check-charts.mjs:82` chỉ kiểm “có Job ⇔ `config.migration?.enabled`” theo values của service: nhánh “có Job” (`:83–90`) chỉ chạy nhờ `apps/agent-core/deploy/values.yaml` (luồng agent-core giữ) đang bật migration; luồng đó đổi values thì AC02 mất phép thử dương mà script vẫn đạt. Không có khẳng định riêng “sandbox-runner không có Job”. `:48–53` mọi lượt `helm lint`, `helm template` đều thêm `--set-string secretName=fixture-secret,migration.secretName=…`, nên values thật chưa được render nguyên trạng (nhánh `secretName: ""`) | Thêm phép thử cố định không phụ thuộc values của luồng khác: bật migration với `command` mẫu → có Job, hook `pre-install,pre-upgrade`; values sandbox-runner → không có Job; thêm một lượt lint, render mỗi values nguyên trạng |
| G5 | Output O1–O6 (phần thêm ngoài danh sách) | unrequested | LOW | `infra/docker/node/Dockerfile.dockerignore`, `infra/docker/python/Dockerfile.dockerignore` (lý do ở `implement.md:16`: loại cache, secret cục bộ, file sinh khỏi context); `.github/workflows/ci.yml:30–32` thêm `permissions: actions: read` cho job `build`, không ghi lý do (quyền chỉ đọc, `nrwl/nx-set-shas` cần để tìm lần chạy đạt gần nhất khi push vào `main`; PR #43 thêm đúng khối này); `infra/README.md:16–20` (hướng dẫn chạy script) | Chỉ để PO biết, không đề xuất xoá. Dev ghi lý do của `actions: read` vào `implement.md` khi cập nhật |
| G6 | `AGENT.md` mục Git (ruleset `protect-main-develop`: commit phải có chữ ký trước khi mở PR) | contradicts | MEDIUM | Ba commit `bfe9528`, `0ec58d0`, `fbdc425` của PR: `gh api repos/toilatrung/sires/commits/<sha>` trả `verification.verified=false`, `reason=unsigned`. Ruleset có `required_signatures`. Không chạm mã hay AC | Dev cài khóa ký SSH hoặc GPG trước commit lần sau; không viết lại lịch sử đã push. PO merge bằng squash (GitHub ký commit squash) |

Ngoài G6 (quy trình Git), không có `contradicts` trong mã. Không vi phạm ranh giới: `check-tracks` chỉ báo `infra` (và `repo` cho `agent/execution/`); không sửa `docs/`, `apps/*/deploy/values.yaml` (N1), file sinh tự động hay migration đã có. Không có key tĩnh trong chart; mỗi service có ServiceAccount riêng (quy tắc 4.4 về workload identity, xem “Đề xuất cho PO” mục 4).

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00010-AC01 | đạt với agent-core; NestJS đạt ở mức thay thế, chưa kiểm trong container | thao tác tay: container thật (agent-core, thêm knowledge); host (NestJS) | `scripts/development/check-charts.mjs › kiểm image` (`--images agent-core`) | `--images agent-core`: build từ `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` có sẵn, `OK image agent-core: /health 200, PID 1 non-root`, cổng 8101 theo values. QC build thêm knowledge cùng Dockerfile (`PACKAGE=sires-knowledge`, `PORT=8102`): `/health` 200, `Uid: 1000`. Image Python: `User=1000:1000`, venv không có pytest, ruff, mypy, testcontainers (httpx, pyyaml là phụ thuộc runtime của `sires-common`, `uvicorn[standard]`). `--images gateway`: không chạy — máy QC không có `node:22-slim`, PO không cho pull. Thay thế: 10/10 service NestJS (`gateway`, `identity`, `workspace`, `planning`, `orchestration`, `library`, `research`, `manuscript`, `audit`, `sandbox-runner`) qua đúng bước của Dockerfile trên host (`nx build` → `pnpm --filter @sires/<svc> deploy --legacy --prod` → `PORT=<values> node dist/main.js`): `/health` 200 cả 10, không có vitest, typescript, `@nestjs/cli`, `@nestjs/testing` trong store. Non-root phía Node chỉ kiểm tĩnh: `infra/docker/node/Dockerfile:20` `USER node` (UID 1000), chart ép `runAsNonRoot`, `runAsUser: 1000` (`_helpers.tpl:3–5`) |
| PID-00010-AC02 | đạt | CI (helm template), đọc template | `scripts/development/check-charts.mjs › job migration` | CI run `44667986097`: `OK Helm agent-core` (Job có hook `pre-install,pre-upgrade`, argv từ values, cùng image, Secret riêng, non-root), `OK Helm sandbox-runner` (không có Job). Template: `migration.yaml:13–15` hook trước install/upgrade nên Job chạy xong trước khi Deployment đổi; `:1` tắt được bằng `migration.enabled`. QC chạy lệnh migration của agent-core trong image bằng UID 1000: `uv run --no-sync alembic -c apps/agent-core/alembic.ini history`, `heads` → thoát 0, `0001 (head)`; `upgrade head` không chạy (cần database). Độ chắc của phép thử: G4 |
| PID-00010-AC03 | đạt | CI (helm lint, helm template) | `scripts/development/check-charts.mjs › render mọi service` | CI run `44667986097`, helm v3.19.0: 12/12 `OK Helm <service>` (lint, template; replicas ≥ 2, `RollingUpdate`, readiness và liveness `/health` đúng cổng values, resources requests/limits cpu, memory, `runAsNonRoot`, `allowPrivilegeEscalation: false`, ServiceAccount, `envFrom` Secret). Cục bộ không chạy — không có helm. Values chỉ được render kèm Secret giả (G4) |

Edge case: EC01 đạt (không project nào có `drizzle-kit`, kể cả 10 bản deploy `--prod`; `migration.command` là argv từ values, `migration.yaml:26–27`; lệnh migration của agent-core chạy được non-root trong image). EC02 đạt (`migration.yaml:2–4` `fail "migration.command is required when migration.enabled is true"`; CI in `OK Helm từ chối migration thiếu command`, `check-charts.mjs:93–96`). EC03 đạt (QC chạy không có helm: `Không tìm thấy helm trong PATH.`, thoát 1; CI cài helm v3.19.0 bằng `azure/setup-helm@v4` trước bước kiểm, `ci.yml:54–59`). Không có màn hình nên không chạy `sires-ui-review`.

Bước CI mới (`ci.yml:49–59`): bước “Detect chart changes” chạy `git diff --name-only $NX_BASE $NX_HEAD -- infra ':(glob)apps/*/deploy/**' scripts/development/check-charts.mjs`; có thay đổi thì cài helm v3.19.0 và chạy `node scripts/development/check-charts.mjs` (chỉ chế độ chart, không build image). Đúng S03 “gắn vào `ci.yml` khi sửa `infra/` hoặc `apps/*/deploy/`”, “thoát lỗi khi chart sai” (`check-charts.mjs:152–154`).

### Lệnh đã chạy

Máy QC: Windows 11, Node 24.21.0, pnpm 10.34.9, Docker 29.8.2 trong WSL `Ubuntu-24.04`; worktree tách ở commit `fbdc425`. Không có helm, không pull image, không tải công cụ.

| Lệnh | Kết quả |
| --- | --- |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00010 --result` | KẾT QUẢ ĐỦ, 0 cảnh báo; trạng thái `Xong — chờ QC` |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: infra, repo` (`repo` là `agent/execution/`, không tính), thoát 0 |
| `node scripts/docs/add-license.mjs --check` (trước và sau khi ghi file này) | `0 file chưa có thông báo giấy phép.` (không bắt được G1). Lượt sau khi chạy Nx báo 10 file trong `.pytest_cache`, `.ruff_cache`, `.mypy_cache` do test của QC sinh ra (Git bỏ qua); xoá các cache này rồi chạy lại: 0 file |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard khớp) |
| `pnpm install --frozen-lockfile` | Đạt (cảnh báo bỏ build script `cpu-features`, `protobufjs`, `ssh2`) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --head=HEAD --parallel=3` | 19 project và 2 tác vụ phụ thuộc; lỗi 3 tác vụ, đều do máy QC, không do PR: `@sires/platform:test` quá 5 s ở `telemetry.spec.ts` khi máy đang build Docker song song (chạy lại riêng `pnpm nx run @sires/platform:test --skip-nx-cache`: 68/68 đạt); `sires-common:test` `ModuleNotFoundError` do đường dẫn file sinh trong scratchpad dài 260 ký tự (giới hạn MAX_PATH Windows); `agent-core:test` `test_migrate_command` bị Smart App Control chặn `alembic.exe` trong `.venv`. PR không sửa mã các project này (bị ảnh hưởng chỉ vì `package.json` đổi) |
| CI PR #42, run `44667986097` (bằng chứng CI, không phải chạy cục bộ) | `tracks` đạt; `build` đạt: “Detect chart changes” đặt `check=true`, `azure/setup-helm@v4` cài v3.19.0, `check-charts.mjs` in 12 dòng `OK Helm …` và `OK Helm từ chối migration thiếu command`; `nx affected` đạt 19 project và 2 tác vụ phụ thuộc |
| `node scripts/development/check-charts.mjs` (không có helm) | `Không tìm thấy helm trong PATH.`, thoát 1 (EC03) |
| `node scripts/development/check-charts.mjs --foo`; `--images knowledge` | In cách dùng, thoát 1 |
| `node scripts/development/check-charts.mjs --images agent-core` | `OK image agent-core: /health 200, PID 1 non-root`, thoát 0 (khoảng 31 s) |
| `node scripts/development/check-charts.mjs --images` (gồm gateway) | Không chạy — cần `node:22-slim`, không có cục bộ, không được pull |
| `docker build -f infra/docker/python/Dockerfile --build-arg PACKAGE=sires-knowledge --build-arg MODULE=knowledge.main` rồi chạy với `PORT=8102` | `/health` 200, `Uid: 1000 1000 1000 1000` |
| `docker run --user 1000:1000 <image agent-core> uv run --no-sync alembic -c apps/agent-core/alembic.ini history` / `heads` | Thoát 0: `<base> -> 0001 (head)`; `0001 (head)` |
| `pnpm --filter @sires/<svc> deploy --legacy --prod` + `PORT=<values> node dist/main.js` cho 10 service NestJS (thay thế cho build image Node) | 10/10 `/health` 200; không có dependency dev, không có `drizzle-kit` |
| `pnpm exec eslint scripts/development/check-charts.mjs` | Đạt |
| `pnpm exec prettier --check` trên blob LF của `check-charts.mjs`, `ci.yml`, `infra/helm/sires-service/values.yaml` | Hai file đầu đạt; `values.yaml` muốn đổi `""` thành `''`. CI không chạy Prettier, YAML khác trong repo cũng không theo, nên không tính khoảng trống (cảnh báo khi chạy trên worktree là do CRLF) |
| `git diff --check cd25a65..HEAD` | Sạch |
| `helm lint`, `helm template` cục bộ | Không chạy — máy không có helm, không được tải; dùng bằng chứng CI ở trên |

Image QC dựng (`sires/pid00010-check-agent-core:local`, `sires/qc-pid00010-knowledge:local`) đã xoá sau khi kiểm.

### Lệch với Self-QC

- `report.md:6` ghi “PR: chưa mở”, `report.md:30` “Chờ chạy workflow trên GitHub”, `self-qc.md:37` “Chưa có lượt GitHub Actions thực tế”. Thực tế PR #42 đã mở, run `44667986097` đạt cả `tracks` và `build`, bước kiểm chart chạy thật. Dev cập nhật khi ghi lần sau.
- Self-QC mục 1 ghi kiểm giấy phép đạt. Đúng là `--check` đạt, nhưng 9 file mới thiếu khối thông báo đầy đủ (G1); `--check` không phát hiện được.
- Self-QC mục 2 ghi AC01 đạt với image gateway. QC không tái lập được trong container (thiếu `node:22-slim`), chỉ xác nhận bằng cách thay thế trên host; không thấy lỗi.
- Self-QC mục 1 ghi Nx đạt 19 project trên bản sao sạch. QC chạy trên worktree: 16 project đạt ngay, 3 tác vụ lỗi do môi trường máy QC (xem bảng lệnh); CI đạt 19/19.
- Self-QC mục 5 không nêu G2–G5.

### Việc còn lại, theo thứ tự phụ thuộc

1. Bổ sung khối giấy phép đầy đủ cho 9 file mới và chân trang md (G1).
2. Đổi tên `templates/migration.yaml` thành `migration-job.yaml` theo O4, hoặc ghi lệch vào `report.md` mục 6 để PO chấp nhận (G2).
3. Đưa `yaml` vào pnpm catalog (G3).
4. Thêm phép thử cố định cho AC02 (bật migration với command mẫu, sandbox-runner không có Job) và lượt render values nguyên trạng (G4).
5. Ghi lý do `permissions: actions: read` vào `implement.md`; cập nhật `report.md` (PR #42, kết quả CI) và `self-qc.md` mục 5 (G5, mục “Lệch với Self-QC”).
6. Cài khóa ký commit trước lần commit sau (G6).

Dev làm các việc trên bằng `spec-execution-skill PID-00010` (đọc lần mới nhất, ghi “Lần 2” trong `report.md`). Không còn CRITICAL, HIGH nên PO có thể merge. QC khuyên làm G1 trước khi merge; G2–G5 có thể để lần sau. Merge bằng squash vì commit chưa ký (G6); `infra/`, `.github/workflows/`, `package.json` chỉ có một code owner là tác giả PR, nên điều kiện code owner review của ruleset chỉ qua được bằng PO bypass.

### Đề xuất cho PO

1. **AC01 phía NestJS trong container:** QC chưa xác nhận được vì máy không có `node:22-slim`. Nếu PO cần bằng chứng container trước khi nghiệm thu: cho phép pull `node:22-slim` để QC chạy `node scripts/development/check-charts.mjs --images gateway`, hoặc yêu cầu Dev đính log lệnh này vào `self-qc.md`. Về lâu dài, bước “build image của service bị ảnh hưởng” ở kiến trúc 11.3 (PID-00009) sẽ kiểm việc này trong CI.
2. **O4:** quyết chấp nhận tên `migration.yaml` hay giữ `migration-job.yaml` (G2). Chỉ hồ sơ PID-00010 nhắc tên file này.
3. **`add-license.mjs --check` chỉ tìm mã SPDX**, nên file chỉ có một dòng SPDX vẫn qua CI (G1). Đề xuất một ticket luồng infra để `--check` đòi đủ khối ba dòng.
4. **Workload identity (spec 4.4):** chart đã có ServiceAccount riêng cho mỗi service nhưng chưa có khóa gắn annotation cho ServiceAccount; khóa này phụ thuộc nhà cloud (AQ-12 chưa chốt). Nên ghi vào phạm vi PID-00035 (áp lên cụm thật, N3). Tương tự, chart cố định `automountServiceAccountToken: false` và `runAsUser: 1000`, không có khóa ghi đè; nếu controller sandbox-runner cần gọi Kubernetes API hay image sandbox dùng UID khác thì phải thêm khóa ở chart khi làm ticket sandbox hoặc KEDA (PID-00057).
5. **Image Python không có mô hình hợp đồng sinh:** `infra/docker/python/Dockerfile.dockerignore:12` loại `sires_common/generated`, thư mục này cũng không commit và Dockerfile không sinh lại. Hiện chưa mã runtime nào import nên chưa lỗi. Khi agent-core hay knowledge dùng mô hình sinh (PID-00008) thì image sẽ thiếu module: cần ticket cho bước sinh trong build image.
6. **PR #43 (PID-00011)** thêm cùng khối `permissions` và chèn bước Terraform ngay sau `nrwl/nx-set-shas@v4`, đúng chỗ PR này chèn bước Helm. Không xung đột ý định (hai bước độc lập) nhưng PR merge sau sẽ xung đột văn bản ở `ci.yml` và phải rebase. PID-00009 S11 đã dự kiến chuyển bước kiểm chart thành job riêng.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
