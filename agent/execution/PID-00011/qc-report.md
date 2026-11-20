# PID-00011 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH; còn 2 MEDIUM, 4 LOW (Lần 1, 20/11/2026)

- **Ticket:** [PID-00011](../../../docs/tickets/issues/PID-00011/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 20/11/2026 · spec-converge-skill

Người chạy: QC độc lập do PO giao (không dùng kết luận của Dev). Mã nguồn: nhánh `infra/pid-00011-terraform-modules` (PR #43 → `main`), commit `2a1470b`.

Phạm vi đã soi: `infra/terraform/` (6 module, `envs/staging`, `envs/production`, README), `.github/workflows/ci.yml`, `.gitignore`, `agent/execution/PID-00011/`. Đối chiếu với `docs/tickets/issues/PID-00011/` (ticket, `specs/acceptance.html`, `specs/scope.html`, `specs/index.html` mục 2–7, slice S01, S02, `designs/notes.html`), `docs/database/ddl/`, kiến trúc mục 11 và AQ-12, DLR-02, `AGENT.md`.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | `AGENT.md:67` (ruleset `protect-main-develop`: commit phải có chữ ký trước khi mở PR) | contradicts | MEDIUM | Ba commit `3212f11`, `40bcba0`, `2a1470b` của PR: `gh api repos/toilatrung/sires/commits/<sha>` trả `verification.verified=false`, `reason=unsigned`. Ruleset có `required_signatures`. Không chạm mã hay AC nên không xếp CRITICAL; merge kiểu `merge`, `rebase` bị chặn, squash (GitHub ký commit squash) hoặc PO bypass thì vào được | Dev cài khóa ký SSH hoặc GPG cho mọi commit từ Lần 2. Không ký lại commit đã push (phải force-push) trừ khi PO yêu cầu; PO chọn cách merge |
| G2 | S02 “Gắn `terraform fmt -check`, `terraform validate` vào CI khi sửa `infra/terraform/`” · B2 | unrequested | MEDIUM | `.github/workflows/ci.yml:30-32` thêm `permissions: contents: read, actions: read` cho job `build`; `implement.md:9-15` và `report.md` mục 5 không nêu lý do. Bước Terraform không cần quyền này: repo đang public và run push trên `main` 44554001453 (trước PR, chỉ có `contents: read`) vẫn để `nrwl/nx-set-shas` tìm được base `989d65f`. PR #42 (PID-00010) thêm đúng khối này | Dev ghi lý do ở `implement.md` mục 3 hoặc bỏ khối; PO quyết, và chỉ để một trong PR #42, #43 thêm khối này |
| G3 | Căn cứ quyết định (ticket “Căn cứ”: DEC-56, AQ-12, DLR-02; kiến trúc 11, PO 08/11/2026) | contradicts | LOW | `infra/terraform/README.md:5` ghi “Staging hiện chạy ở Home Lab theo DEC-56”. DEC-56 nói SIRes tự vận hành trên cloud do đội vận hành, không nói Home Lab; Home Lab là quyết định PO 08/11/2026 (`docs/architecture/sections/11-deployment-and-operations.html:23`, OQ-108, DLR-09). Đoạn cũ `README.md:3` “staging dựng khi có trả lời” nay lệch với dòng 5 | Sửa căn cứ dòng 5 thành PO 08/11/2026 (OQ-108, DLR-09) và chỉnh câu ở dòng 3 cho khớp |
| G4 | `AGENT.md:53` (file mới chạy `node scripts/docs/add-license.mjs`) | partial | LOW | 27 file mới dùng ghi chú giấy phép tự viết, rút gọn: header `.tf`, `.tfvars.example` (vd `infra/terraform/modules/kms/variables.tf:2-3`) thiếu “commercial use in any form is prohibited” và “— see LICENSES.md”; footer README module (vd `infra/terraform/modules/kms/README.md:10`) và `report.md:40`, `implement.md:20`, `self-qc.md:39` thiếu “Sole decision-maker… Non-commercial use only; commercial use in any form is prohibited.” `--check` vẫn đạt vì script chỉ dò mã `LicenseRef-eTroy-NC-1.0` (`scripts/docs/add-license.mjs:98`). Trên `main` không file nào dùng dạng rút gọn này | Thay bằng văn bản chuẩn của `scripts/docs/add-license.mjs:20-24` (`.tf`), footer chuẩn `:63-65` (`.md`); `.tfvars.example` chép nguyên văn ba dòng chuẩn vì script không nhận đuôi `.example` |
| G5 | PID-00011-AC02 (“When đọc biến, Then … các extension theo DDL”) · O1 | partial | LOW | `infra/terraform/modules/postgres/variables.tf:10-25` chỉ khai extension riêng (`vector` cho knowledge); ba extension chung viết cứng trong output `infra/terraform/modules/postgres/outputs.tf:15`. Output `databases` đủ và đúng DDL, nhưng đọc riêng biến thì không thấy `pgcrypto`, `unaccent`, `pg_trgm` | Tùy chọn: đưa thành biến `common_extensions` mặc định theo `docs/database/ddl/00-common.sql:15-17`, hoặc PO chấp nhận cách hiện tại |
| G6 | DEC-58; khung `agent/execution/PID-Template/report.md`, `self-qc.md` | partial | LOW | `agent/execution/PID-00011/report.md:6` còn “**PR:** chưa mở” trong khi PR #43 đã mở (taskboard đọc dòng này); `report.md:27` “Chờ GitHub Actions” trong khi CI đã đạt; `report.md:33-35` mục 6 thiếu các dòng của khung. `self-qc.md:28-34` không có mục 4 “Tự kiểm” và mục 5 không có bảng G như `PID-Template/self-qc.md:51-57`, nên G1, G2, G4 không được ghi | Dev cập nhật khi chạy Lần 2: dòng PR, mục 4, mục 6 của `report.md`; mục 4 và bảng G mục 5 của `self-qc.md` |

Không có `missing`. Không có CRITICAL, HIGH.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00011-AC01 | đạt | CI GitHub Actions (Terraform 1.13.5) và đọc mã; không chạy cục bộ | `.github/workflows/ci.yml:59-67` › bước “Validate Terraform configuration” | Run 44669629417 (PR #43, head `2a1470b`): `terraform fmt -check -recursive -diff` không in diff; `init -backend=false` và `validate` đạt 6/6 module (“Success! The configuration is valid.”), không cài provider nào. Grep `provider`, `resource`, `data`, `required_providers`, `backend`, `cloud` và tên nhà cloud (aws, azurerm, google, …) trong `infra/terraform/`: không có |
| PID-00011-AC02 | đạt (G5 LOW) | đọc mã | `infra/terraform/modules/postgres/variables.tf:10-30`, `outputs.tf:10-18` | 11 khóa mặc định khớp 11 file DDL service trong `docs/database/ddl/`; tên `sires_<service>` (gạch ngang đổi gạch dưới) khớp header DDL, vd `agent-core.sql:5` `sires_agent_core`; extension chung khớp `00-common.sql:15-17`, `vector` khớp `knowledge.sql:10`. Validation tên: chữ thường, số, gạch ngang, tối đa 57 ký tự (6 + 57 = 63, giới hạn định danh PostgreSQL); không có gạch dưới nên không trùng sau chuẩn hóa |
| PID-00011-AC03 | đạt | CI GitHub Actions và đọc mã | `.github/workflows/ci.yml:64-67` › `validate` cho `envs/staging`, `envs/production` | Run 44669629417: hai root `init` nạp 6 module từ `../../modules/…` và `validate` đạt 2/2. `diff` cho thấy `main.tf`, `variables.tf` hai môi trường giống hệt; `terraform.tfvars.example` chỉ có tên `example-*`; `git ls-files` không có `*.tfvars`, `*.tfstate` |
| EC01 | đạt | thao tác tay | `git check-ignore -v` | `terraform.tfvars`, `*.auto.tfvars`, `*.tfvars.json`, `*.tfstate`, `*.tfstate.backup`, `.terraform/` bị bỏ qua (`.gitignore:16-20`); hai `terraform.tfvars.example` được Git nhận; `.terraform.lock.hcl` không bị bỏ qua (đúng khuyến nghị commit lock file) |
| EC02 | không kích hoạt được lúc này | đọc mã | README từng module | AQ-12 chưa trả lời; README mỗi module ghi “Phần cấp phát tài nguyên chờ quyết định AQ-12” (vd `infra/terraform/modules/kms/README.md:5`); không có tài nguyên riêng nhà cloud |

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00011 --result` | `PID-00011: KẾT QUẢ ĐỦ (0 cảnh báo)`, thoát 0 |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: infra, repo`, không cảnh báo (`repo` không tính), thoát 0 |
| `node scripts/docs/add-license.mjs --check` | Trước và sau khi ghi file này: `0 file chưa có thông báo giấy phép`, thoát 0 (xem G4 về nội dung) |
| `node scripts/docs/update-index.mjs --check` | Trước và sau khi ghi file này: 159 PID khớp, taskboard khớp, `docs/index.html` khớp; thoát 0 |
| `pnpm install --frozen-lockfile` (trong worktree QC) | Xong trong 31,6 giây, thoát 0 |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --head=HEAD` (`NX_DAEMON=false`) | `No tasks were run`, thoát 0 (PR không chạm project Nx) |
| `git diff --check origin/main...HEAD` | Sạch |
| `terraform fmt -check`, `terraform validate` cục bộ | Không chạy — không có `terraform` trên Windows lẫn WSL, không có image Terraform trong Docker cục bộ (`docker images`), không được tải binary. Thay bằng bằng chứng CI dưới đây và đọc HCL: biến khai báo đều được dùng, mọi lời gọi module truyền đúng tên biến, mọi output tham chiếu output có thật, không có `provider`/`resource`/`data`/`backend` |
| `gh pr checks 43` (bằng chứng CI, không phải chạy cục bộ) | `build` đạt (23 giây), `tracks` đạt (8 giây) |
| `gh run view 44669629417 --log` (bằng chứng CI) | Bước “Detect Terraform changes” với `NX_BASE=cd25a65` bật `check=true`; `hashicorp/setup-terraform@v3` cài 1.13.5; `fmt -check` không lỗi; 8 lần “Success! The configuration is valid.” (6 module, staging, production); `nx affected`: `No tasks were run` |
| `gh run view 44554001453 --log` (push `main`, trước PR) | `nrwl/nx-set-shas` có base `989d65f` khi job chỉ có `contents: read` (căn cứ G2) |
| `gh api repos/toilatrung/sires/commits/<sha>` cho 3 commit | Cả ba `verified=false`, `reason=unsigned` (G1) |
| `git check-ignore -v`, `diff` hai môi trường, grep provider và tên nhà cloud | Như bảng AC |

Lưu ý: `terraform fmt` chỉ xử lý `.tf`, `.tfvars`, `.tftest.hcl`, nên CI không kiểm `terraform.tfvars.example`; QC đọc tay, căn dấu `=` đúng kiểu `fmt`.

### Lệch với Self-QC

- `self-qc.md:7-11` ghi `terraform fmt`, `init`, `validate` đạt khi chạy cục bộ. QC không chạy được cục bộ; run CI 44669629417 cho cùng kết quả, nên không lệch về kết quả.
- `self-qc.md:34` ghi “Không còn khoảng trống HIGH hoặc CRITICAL”. QC đồng ý không có CRITICAL, HIGH, nhưng self-QC không ghi bảng G và bỏ sót G1 (commit chưa ký), G2 (`actions: read` không rõ lý do), G4 (ghi chú giấy phép rút gọn).
- `self-qc.md:11` ghi kiểm giấy phép “đạt”. Đúng với `--check`, nhưng `--check` chỉ dò mã giấy phép; nội dung không theo văn bản chuẩn (G4).
- `report.md:6` “PR: chưa mở” và `report.md:27` “Chờ GitHub Actions” đã cũ: PR #43 đã mở, CI đạt (G6).
- `implement.md:9` nói tên đầu vào được kiểm để tránh trùng sau chuẩn hóa: QC xác nhận đúng (regex không cho gạch dưới).

### Việc còn lại, theo thứ tự phụ thuộc

1. Cài khóa ký cho commit từ Lần 2; PO chọn cách merge cho các commit chưa ký đã push (G1, `AGENT.md:67`).
2. Ghi lý do hoặc bỏ `permissions: actions: read` ở job `build`, thống nhất với PR #42 (G2, S02).
3. Sửa căn cứ Home Lab và câu cũ về staging trong `infra/terraform/README.md` (G3).
4. Thay ghi chú giấy phép bằng văn bản chuẩn trong 27 file mới (G4).
5. Tùy chọn: biến `common_extensions` cho module postgres (G5, PID-00011-AC02).
6. Cập nhật `report.md` (dòng PR, mục 4, mục 6) và `self-qc.md` (mục 4, bảng G mục 5) ở Lần 2 (G6).

Không việc nào chặn merge. Dev làm các việc trên bằng `spec-execution-skill PID-00011` (Lần 2), trên PR này hoặc PR sau, theo quyết định của PO.

### Đề xuất cho PO

1. **Merge:** không còn CRITICAL, HIGH. Vì commit chưa ký (G1), chỉ merge bằng squash (GitHub ký commit squash). `infra/`, `.github/workflows/` chỉ có một code owner là tác giả PR, nên điều kiện code owner review của ruleset chỉ qua được bằng PO bypass. Khi squash, viết lại thông điệp thay cho thông điệp tự điền.
2. **Xung đột với PR #42 (PID-00010) ở `.github/workflows/ci.yml`:** hai PR cùng thêm khối `permissions` (dòng 30-32) và cùng chèn bước ngay sau `nrwl/nx-set-shas@v4` (dòng 48). PR merge sau phải rebase, và vì `strict_required_status_checks_policy` nên CI phải chạy lại. Không thấy xung đột ý định. Bước “Detect chart changes” của PR #42 lọc `-- infra` nên cũng chạy khi chỉ sửa `infra/terraform/`; điều này vô hại.
3. **Kiến trúc 11.3 (PO 12/11/2026):** PR vào `main` và push vào `main` phải chạy toàn bộ. Bước Terraform hiện chỉ chạy khi `infra/terraform/` đổi, và không chạy khi chỉ sửa bước Terraform trong `ci.yml`. Điều này khớp CI hiện tại (`nx affected`), nhưng khi PID-00009 hoặc PID-00035 hiện thực quy tắc “`main` chạy toàn bộ” thì cần tính cả bước này. Theo mô tả PR #43, đây là đầu vào của PID-00009 S12; đề xuất PO ghi rõ vào spec PID-00009.
4. **Giao diện module hiện tối thiểu** (tên, phiên bản, số node, tập tên). AC của PID-00011 không đòi thêm. Một số yếu tố trung lập nhà cloud của kiến trúc 11.2 chưa có trong giao diện: node pool `app` và `sandbox` (gVisor), ≥ 3 zone, PostgreSQL HA và PITR, pooler, quorum queue, workload identity theo service. Ngoài ra `docs/database/ddl/00-common.sql:13` nói các vai trò `sires_<svc>_owner/_app/_system/_purge` “do hạ tầng tạo trước”, nhưng không ticket nào nêu rõ việc này: AC của PID-00134 chỉ đòi “tương đương production”, PID-00153 chỉ ghi “theo 11.2”. Đề xuất PO xác nhận các phần này thuộc PID-00134 hoặc PID-00153 và thêm AC ở đó để không bị bỏ sót.
5. **Repo đang public** (`gh repo view`), trong khi kiến trúc 11.3 ghi “Repo GitHub private”. Việc này nằm ngoài ticket, chỉ nêu để PO biết vì nó ảnh hưởng tới đánh giá quyền token CI (G2).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
