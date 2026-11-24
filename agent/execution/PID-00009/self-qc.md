# PID-00009 — Self-QC

**Kết luận:** Đạt — Lần 10 (25/11/2026): G19 đã sửa theo PC-04 A12. Thêm trường vào schema `library` làm đổi hash của 12/17 task kiểm, gồm consumer TS và `sires-common:test`; hoàn lại thì cache trúng 12/12. Không còn CRITICAL hay HIGH; còn G20, G21 (LOW, luồng contracts), G16 (LOW, chờ PO) và các mục MEDIUM của QC. Lần 9 (24/11/2026): AC01 đạt. T3 với cache `main` xong trong 182 giây trên PR thử #96, đóng G5. Lần 8 (24/11/2026): T5 đạt trên `main`; sửa G18 (EC06 cho project không phụ thuộc project nào) và số giây job skipped; phát hiện G19.

## 1. Lệnh và kết quả

- `check-pid.mjs PID-00009` đạt kiểm hồ sơ với 0 cảnh báo.
- `actionlint` kiểm workflow thành công. `ruff check infra/ci` đạt.
- `uv sync --all-packages --locked` thành công.
- Nx TypeScript dừng do `EPERM` khi generator đổi tên đầu ra; 14 test của contracts đạt trong lần chạy.
- Nx Python lint và typecheck đạt; agent-core 15 test, knowledge 1 test đạt. Task sinh contracts Python lỗi `EPERM`, dẫn tới sires-common:test chưa chạy.
- `add-license.mjs --check` dừng khi đọc .pytest_cache. Kiểm giấy phép riêng các file mới theo từng định dạng.
- Schemathesis và AsyncAPI chạy bộ tự kiểm thành công trên máy Dev.
- Redocly 2.11.1 lint cả ba nhóm thành công. Bundle mới khớp file đã commit khi chuẩn hóa xuống dòng.
- Fixture Gitleaks thoát 1, báo đúng file và dòng và che chuỗi giả. Fixture Trivy xác nhận cảnh báo High chưa có bản sửa chỉ được liệt kê, High có bản sửa chặn.
- Build image đại diện `gateway` và `knowledge` trong Ubuntu 24.04 thành công. Lượt build gateway đầu tiên cho thấy lỗi EXDEV khi Docker nhận thư mục contracts sinh cục bộ. Lượt sau đạt khi thư mục đó được bỏ khỏi context.
- Đã kiểm marker giấy phép của file code và tài liệu thay đổi. `update-index.mjs --check` và `git diff --check` đạt.
- Kiểm lưu/khôi phục tên tệp SQLite của cache Nx với fixture trong Ubuntu đạt. Chưa đo cache hit giữa runner GitHub.

## 2. AC và bằng chứng

| AC | Kiểm | Kết quả |
| --- | --- | --- |
| PID-00009-AC01 | T3 thời gian GitHub | Chưa chạy. Develop thiếu 91 commit từ main. |
| PID-00009-AC02 | T6 Schemathesis | Fixture đúng đạt; fixture sai báo GET /invalid và trường value. Đạt cục bộ. |
| PID-00009-AC03 | T7 Gitleaks | Đã kiểm phát hiện, file, dòng và che log với fixture cục bộ. Chưa chạy PR thử. |
| PID-00009-AC04 | T1 docs-only | Phân loại cục bộ đúng; chưa chạy PR thử. |
| PID-00009-AC05 | T2 sires-common | Nx chọn đúng bốn project Python và ma trận chỉ agent-core, knowledge. Chưa chạy PR thử. |
| PID-00009-AC06 | T4/T5 chạy toàn bộ và cache | T4 tại HEAD đạt trên GitHub; chưa có bằng chứng cache hit của T5. |
| PID-00009-AC07 | T1/T5 concurrency | Có cấu hình theo PR và push. Chưa chạy cặp lần chạy. |
| PID-00009-AC08 | T1/T4 job summary | T4 tại HEAD đạt; còn cần T1 để xác nhận cả job skipped. |

## 3. Edge case

| EC | Cách kiểm và trạng thái |
| --- | --- |
| EC01 | Có cấu hình cache Nx tiếp tục khi lỗi; chờ chạy Actions. |
| EC02, EC03 | Workflow qua actionlint; chờ T1 và kết quả job tổng. |
| EC04 | uv.lock chọn full. |
| EC05 | Cạnh Nx của sires-common đến agent-core, knowledge, eval được kiểm qua danh sách ảnh hưởng. |
| EC06 | Khai báo ba input Python; chưa có phép đo cache thực tế. |
| EC07 | Tham chiếu Git không tồn tại cho kết quả full. |
| EC08 | Schema nội bộ kích hoạt hợp đồng và các consumer TS. |
| EC09 | Job tài liệu chạy checkout riêng; local vướng cache pytest. |
| EC10 | PR nhánh đích khác được phân loại full. |
| EC11 | Develop thiếu 91 commit từ main. |
| EC12, EC13 | Có cấu hình ngoại lệ và che log; chờ T7. |
| EC14 | Dockerfile Python chọn đúng hai service. |
| EC15 | Cờ Helm và Terraform có mã phân loại; job chờ S11/S12. |
| EC16 | Job tổng coi cancelled là lỗi; chưa mô phỏng timeout trên Actions. |
| EC17 | Có đường chạy fixture khi không có target service. |
| EC18 | Fixture báo operation sai hoặc trường aggregate thiếu; chờ CI. |
| EC19 | Lần 3: Trivy đọc cả hai lock file. Chính sách thoát 0 và 9 phát hiện Low/Medium chỉ được liệt kê. |
| EC20 | Bundle khớp bản commit sau khi chuẩn hóa xuống dòng. Chưa thử bản bundle lệch trên PR. |
| EC21 | Sync khóa hiện tại chạy được; chưa thử lock lệch trên PR. |
| EC22 | Gateway kèm lock file chỉ tính gateway; Helm vẫn tính infra. |

## 4. Ranh giới

Các file nghiệp vụ của service và hợp đồng ở docs giữ theo upstream. Thay đổi có sẵn `analytics: false` trong nx.json được giữ lại.

## 5. Tự đối chiếu

| Mã | Mức | Phát hiện |
| --- | --- | --- |
| G01 | HIGH | Thiếu bằng chứng từ T1–T5 và T7; AC01, AC03–AC08 chưa nghiệm thu trên GitHub. |
| G02 | HIGH | S11 và S12 thiếu đầu ra của PID-00010 và PID-00011 trên origin/main. |
| G03 | MEDIUM | Kiểm toàn bộ Nx trên Windows bị gián đoạn do trình sinh hợp đồng hiện tại gặp EPERM. |
| G04 | HIGH | Đã xử lý trên hai lock file cục bộ. Còn xác nhận kết quả trên GitHub Actions. |

---

## Lần 4 — 21/11/2026

- Helm lint/render đạt cho 12 service trên main tại ae1ac60. Đã kiểm lại trường hợp thiếu lệnh migration.
- Terraform fmt, init với backend tắt và validate đạt cho sáu module và hai root.
- Actionlint, frozen install, kiểm chỉ mục tài liệu và phân loại thay đổi Helm/Terraform/Python đạt.
- G01 còn mở: cần kết quả GitHub Actions PR #57 và develop hiện thiếu 109 commit. G02 đã xử lý: hai ticket phụ thuộc đã merge và hai job CI đã tích hợp.

## Lần 5 — 22/11/2026

- Rerun [44931193323](https://github.com/toilatrung/sires/actions/runs/44931193323), attempt 2, đã đạt trên commit HEAD `51befc7`.
- G01 thu hẹp: T4 đã có bằng chứng; còn T1–T3, T5, T7 và điều kiện EC11 (`develop` phải được đồng bộ từ `main`).

## Lần 6 — 22/11/2026 · Nghiệm thu và sửa theo review #57

- G2–G4 của QC đã sửa: công cụ đo lọc phản hồi API, Dockerfile.dockerignore chọn đúng image, values-only không chạy code/image. Workflow lọc dùng cùng danh sách affected với classifier. Frozen install sau sửa importer sample-service đạt.
- T1 #73 đạt với các job không liên quan skipped; run đầu 45024755723 bị hủy bởi push thứ hai, run 45024781831 đạt sau 43s.
- T2 #74, run 45024785948 đạt sau 99s: đúng 4 project Python và 2 image; TS skipped.
- T3 #75, run 45024813714: cold 141s, warm cache PR attempt 2 là 60s. Log Nx xác nhận cache 8/8 task trên runner mới. Đây chưa phải cache main theo AC01.
- T7 #76, run 45024821794: đúng kỳ vọng secrets/build fail, fixture dòng 3, Secret REDACTED; assert trên log xác nhận không có nguyên token giả.
- T4 `d8c7076`, run 45024841054 attempt 2 đạt sau rerun phần lỗi. Attempt đầu gặp test outbox sai thứ tự; ghi đầy đủ ở report và artifact, không coi lần đầu là đạt.
- Cả bốn PR thử đã đóng và xóa nhánh. Không sửa `docs/`, không merge #57, không đổi develop. Phần hậu merge T5/cache main giữ mở theo lựa chọn PO.
- Chi tiết từng job và thời gian: [acceptance-20261122.json](acceptance-20261122.json).
- Bổ sung sửa measure để tìm được PR đã đóng/xóa nhánh; summary ghi cả log và GITHUB_STEP_SUMMARY. Kiểm lần cuối và CI trên commit báo cáo được xác nhận trong phiên sau push.

## Lần 7 — 22/11/2026 · Gitleaks trên báo cáo

CI của commit báo cáo `add5003` nhận nhầm nhãn trạng thái trong `qc-report.md:18`. Allowlist chỉ khớp chính xác giá trị `skipped/concurrency`; Gitleaks 8.24.3 quét lịch sử PR đạt và fixture token giả vẫn bị chặn với mã thoát 1. Không có ngoại lệ theo toàn bộ file/commit và không tắt quét lịch sử. Chi tiết ở report Lần 7.

## Lần 8 — 24/11/2026 · T5, EC06, tự đối chiếu

Người chạy: phiên do PO `toilatrung` giao. Nhánh `infra/pid-00009-t5-cache-main` từ `origin/main` `0153261`. Chi tiết số đo ở `report.md` Lần 8.

### Lệnh và kết quả

| Lệnh | Kết quả thật |
| --- | --- |
| `gh run list --branch main --event push`, API `runs/<id>`, `runs/<id>/jobs`, `gh run view --job <id> --log` | 6 lần push sau #57 (45033510448, 45036410342, 45040139870, 45203674571, 45416191365, 45416543323): cả 6 `success` ở attempt 1, 25 job, `tracks` skipped; log Nx đọc từ cache 0/63, 61/63, 62/63, 29/63, 59/63, 59/63 task TS |
| `node infra/ci/measure.mjs toilatrung/sires` | Thoát 0: “PR vào develop chỉ đổi tài liệu: 2/20 lần”, “Push toàn bộ vào main: 6/20 lần”; không in p95 |
| `git rev-list --count origin/develop..origin/main` | 2 (#88, #89) → dừng T3 theo EC11 |
| `pnpm install --frozen-lockfile` | Đạt (36 giây) |
| Hash task bằng API Nx 22.7.12 (`createTaskHasher`, script tạm ngoài repo) | Trước sửa: đổi `pyproject.toml` gốc không đổi hash `sires-common:lint`, `typecheck`. Sau sửa: `pyproject.toml`, `uv.lock`, `.python-version`, `eslint.config.mjs` đều đổi hash 12/12 task kiểm; sửa `apps/gateway/src/main.ts` chỉ đổi hash task của `gateway`. Thêm schema vào `docs/api-design/components/schemas/library.yaml`: chỉ đổi hash `generate-ts` (G19) |
| `pnpm exec nx run-many -t lint -p @sires/contracts @sires/testing` | Đạt: 2 project, 2 task phụ thuộc (`generate-ts`, `contracts:build`) |
| `pnpm exec nx run @sires/contracts:lint`, trước và sau khi đổi `pyproject.toml` gốc | `nx.json` cũ: vẫn đọc từ cache. `nx.json` mới: chạy lại; hoàn lại file thì đọc từ cache (1/1) |
| `gh api runs/45416543323/attempts/1/jobs --jq '<biểu thức mới của build>'` và run 45024785948 | Job skipped in 0 thay cho −1 |
| Parse `ci.yml` bằng gói `yaml`, `nx.json` bằng `JSON.parse` | Hợp lệ |
| `check-pid.mjs PID-00009` | ĐỦ để thực thi, 1 cảnh báo (có `qc-report.md`, đã đọc Lần 4, 5) |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard 159 task) |
| `git diff --check origin/main` | Sạch |
| `ci-changes.mjs --event pull_request --target main --stdin` với file của nhánh | `mode: full`, 20 project |
| Không chạy | `pnpm nx affected -t lint typecheck test build` đầy đủ và task Python cục bộ: Windows chặn `python.exe` trong `.venv`; CI của PR vào `main` chạy toàn bộ thay. `actionlint`: không có trên máy, không tải image mới. T3: bị chặn (EC11) |

### AC

| AC | Kết quả | Bằng chứng |
| --- | --- | --- |
| PID-00009-AC01 | Chưa kết luận | T3 với cache `main` chưa chạy: `develop` thiếu #88, #89 (EC11). Tham khảo: 141 giây không cache, 60 giây cache PR (#75) |
| PID-00009-AC02 | Đạt (bộ tự kiểm T6) | `contract-test` đạt ở cả 6 lần push `main` |
| PID-00009-AC03 | Đạt | T7 (Lần 6); `secrets` đạt ở 6 lần push `main` |
| PID-00009-AC04 | Đạt trên mã CI `develop` cũ | T1 45024781831; chưa chạy lại trên `develop` mới (G7 của QC) |
| PID-00009-AC05 | Đạt trên mã CI `develop` cũ | T2 45024785948; chưa chạy lại (G7) |
| PID-00009-AC06 | Đạt theo input đã khai; còn G19 | T4 (Lần 6), T5 6 lần: mọi job, mọi project; task không đổi input đọc từ cache, task đổi input chạy lại; G18 đã sửa |
| PID-00009-AC07 | Đạt | PR: 45024755723 cancelled khi có push 2 (Lần 6). Push `main`: 45416191365 và 45416543323 chồng nhau 99 giây, cả hai chạy hết |
| PID-00009-AC08 | Đạt; phần sửa chưa chạy trên Actions | Log `build` của 6 lần push in bảng 25 job, có `tracks` skipped; số giây −1 của job skipped sửa thành 0 trong nhánh này |

### Edge case thay đổi trong Lần 8

| EC | Trạng thái |
| --- | --- |
| EC06 | Đã giải quyết: `nx.json` khai `inputs` cho `lint`, `typecheck`, `test`; kiểm bằng hash và chạy thật (bảng lệnh) |
| EC11 | Đang chặn T3: `develop..main` = 2; cần PO đồng bộ |
| EC15 | Không đổi: cần PO làm rõ smoke image khi chỉ đổi chart (G16 của QC) |
| Mới — mã hợp đồng sinh ra | Chưa xử lý: G19 |
| Mới — job skipped ra số giây âm | Đã sửa trong `ci.yml` (G8 của QC) |

### Ranh giới

File đổi: `.github/workflows/ci.yml`, `nx.json` (luồng infra) và `agent/execution/PID-00009/` (repo). Không có `docs/`, không có file của luồng khác. `check-tracks.mjs --stdin` với bốn file: `infra, repo`, không cảnh báo.

### Tự đối chiếu (spec-converge-skill, chế độ Dev tự QC)

Đánh số tiếp sau G17 của `qc-report.md` để không trùng.

| Mã | Mức | Phát hiện | Trạng thái |
| --- | --- | --- | --- |
| G5 (QC) | HIGH | AC01 chưa có T3 với cache `main` | Còn mở — bị chặn bởi EC11, cần PO đồng bộ `develop` |
| G6 (QC) | HIGH | T5 trên `main` | Đóng — 6 lần push, xem `report.md` Lần 8 |
| G7 (QC) | MEDIUM | T1–T3 chạy trên mã CI `develop` cũ | Còn mở — chạy lại cùng đợt T3 |
| G8 (QC) | MEDIUM | Bảng job có job skipped; số giây âm | Một phần — bảng có job skipped trong log `build` của lần push; số giây âm đã sửa, chờ CI xác nhận |
| G9 (QC) | MEDIUM | Phép thử tay của slice | Một phần — EC06 đã kiểm; các phép thử khác chưa chạy |
| G10, G12 (QC) | MEDIUM | Checkout đầu nhánh PR; lần chạy toàn bộ đỏ ngẫu nhiên | Còn mở; 6/6 lần push `main` đạt ngay lần đầu |
| G18 | HIGH | `sires-common:lint`, `typecheck` và `@sires/contracts:*` không nhận `pyproject.toml`, `uv.lock`, `.python-version`, `eslint.config.mjs` gốc (trái EC06) | Đã sửa trong `nx.json`, đã kiểm |
| G19 | HIGH | `docs/api-design/**/*.yaml` và mã sinh ra không nằm trong hash của `@sires/contracts:typecheck`, `build`, `test`, các service TS và `sires-common:test`; PR làm hỏng consumer qua hợp đồng có thể xanh nhờ cache | Còn mở — cần PO chọn phương án (a) luồng contracts, platform hoặc (b) luồng infra (`report.md` Lần 8) |

## Lần 9 — 24/11/2026 · T3 với cache `main`, tự đối chiếu

Người chạy: phiên do PO `toilatrung` giao. Số đo chi tiết ở `report.md` Lần 9.

### Lệnh và kết quả

| Lệnh | Kết quả thật |
| --- | --- |
| `git rev-list --count origin/develop..origin/main` sau khi PO merge #92 | 0 (`develop` `c11bba3`, `main` `80a6626`) |
| Tạo worktree tạm ngoài repo từ `origin/develop`, thêm một dòng chú thích vào `apps/gateway/src/main.ts`, `git commit -S`, push, `gh pr create --base develop` | PR thử #96, commit `5237827` (`G`, chữ ký hợp lệ). Blob giữ LF |
| `gh api repos/…/actions/runs/45442437182` và `/jobs` | `success`, attempt 1, 16:53:57Z → 16:56:59Z = 182 giây; 9 job đạt, 5 job skipped |
| `gh run view 45442437182 --job <typescript> --log` | `Cache hit for restore-key: nx-ts-Linux-main-4578236…`; `… for 4 out of 8 tasks.` |
| `gh run view … --job <build> --log` | Bảng 14 job; số giây của job skipped là −1 và −16 (mã `develop`) |
| `git fetch` sau khi đo | `main` `f28424c` (#95, chỉ đổi `docs/`, merge 16:53:35Z); `develop..main` = 1 |
| `gh pr close 96 --delete-branch`, `git push origin --delete`, `git worktree remove` | Đóng PR, không merge; nhánh đã xóa trên `origin` và ở máy |
| Job `typescript` của run 45420184190 (CI của #91) | 63/63 task TS, 13/13 task Python chạy mới, 0 đọc từ cache (hash mới vì `nx.json` đổi); 25 job đạt |
| Log job `typescript` của run 45441635225 (push `main` của #94) | `@sires/orchestration:test` đỏ: dump tham chiếu hỏng ký tự UTF-8; không có `Cache saved` (`save-always: false`) |
| `node infra/ci/measure.mjs toilatrung/sires` | Thoát 0: “PR vào develop chỉ đổi tài liệu: 2/20 lần”, “Push toàn bộ vào main: 10/20 lần”; không in p95 |
| `git merge -S origin/main` vào nhánh #91 | Không xung đột; `nx.json`, `ci.yml` không bị `main` đổi |
| Không chạy | T1, T2 trên mã CI mới của `develop`: sau khi đo, `develop` lại thiếu #95 (EC11). Lần không cache của T3: dùng số tham khảo 141 giây (Lần 6) |

### AC thay đổi trong Lần 9

| AC | Kết quả | Bằng chứng |
| --- | --- | --- |
| PID-00009-AC01 | Đạt | Run 45442437182 của #96: 182 giây, dưới 10 phút, cache Nx lấy từ `main` (4/8 task). Lúc chạy `main` có thêm #95, chỉ đổi `docs/` (`report.md` Lần 9) |
| PID-00009-AC07 | Đạt (thêm bằng chứng) | 3 lần push `main` (#86, #94, #95) chồng nhau, cả ba chạy hết, không lần nào `cancelled` |
| PID-00009-AC08 | Đạt; phần sửa chưa chạy trên Actions | Log `build` của T3 có bảng đủ 14 job gồm 5 job skipped; số giây âm sửa trong #91, chưa merge |
| AC02–AC06 | Như Lần 8 | AC06 còn G19 |

### Tự đối chiếu (spec-converge-skill, chế độ Dev tự QC)

| Mã | Mức | Phát hiện | Trạng thái |
| --- | --- | --- | --- |
| G5 (QC) | HIGH | AC01 chưa có T3 với cache `main` | Đóng — #96, 182 giây |
| G7 (QC) | MEDIUM | T1–T3 chạy trên mã CI `develop` cũ | Một phần — T3 đã chạy mã mới (lệnh lọc `run-many --projects`); T1, T2 chờ PO đồng bộ `develop` (thiếu #95) |
| G8 (QC) | MEDIUM | Bảng job có job skipped; số giây âm | Một phần — bảng log `build` của T3 có 5 job skipped; số âm (−1, −16) sửa ở #91, chưa merge |
| G12 (QC) | MEDIUM | Lần chạy toàn bộ đỏ ngẫu nhiên | Còn mở — thêm lần push `main` của #94 đỏ vì `@sires/orchestration:test` (UTF-8 trong dump); lần sau đạt với cùng mã. Ngoài mã PID này |
| G19 | HIGH | Như Lần 8 | Còn mở — cần PO |
| G16 (QC) | LOW | EC15/S11 | Cần PO, chưa có trả lời |

## Lần 10 — 25/11/2026 · Sửa G19 (PC-04 A12), tự đối chiếu

Người chạy: phiên do PO `toilatrung` giao. Chi tiết ở `report.md` Lần 10.

### Lệnh và kết quả

| Lệnh | Kết quả thật |
| --- | --- |
| `git merge -S origin/main` (`62c0d03`) | Không xung đột; `main` không đổi `nx.json`, `ci.yml` |
| `pnpm exec nx run-many -t build --projects=tag:lang:ts` | Đạt, 16 task (2 từ cache) |
| `node libs/ts/contracts/scripts/generate.mjs --python-only` trên Windows | Lỗi: Application Control chặn `openapi-python-client` |
| Cùng lệnh trong container Linux (`uv:0.13.7-python3.12-trixie-slim` và `node:22`, `pnpm install --filter @sires/contracts`) | Đạt: 9 API nội bộ, 42 message, 572 file |
| Hash 17 task bằng API Nx, ba cấu hình `nx.json`, trước và sau khi thêm `pid9Probe` vào `ReferenceMetadata` | Hiện tại: 0 task đổi; chỉ `targetDefaults`: 8; `namedInputs.default`: 12, gồm `sires-common:test` và `platform`, `planning`, `audit:test` |
| Hoàn lại YAML, `nx run @sires/contracts:build --skip-nx-cache`, sinh lại Python | Bản chốt: 16/17 task về hash cũ; `sires-common:test` khác vì đầu ra Python không giống nhau giữa các lần sinh |
| Sinh Python hai lần không cố định seed, rồi hai lần với `PYTHONHASHSEED=0` | 34 file khác (thứ tự dòng import); với seed: 0 file khác |
| `nx run-many -t lint typecheck test build -p @sires/gateway @sires/library`: hai lần không đổi gì, thêm trường, rồi hoàn lại | 12/12, 12/12 từ cache; 2/12 (10 task chạy lại); 12/12 |
| Cùng thay đổi YAML với `nx.json` cũ | `@sires/contracts:build` `[local cache]`, `dist` thiếu trường mới (tái hiện G19) |
| `pnpm exec prettier --check` bản `nx.json` đã stage | Đạt |
| CI #91 run 45465050271 attempt 1 (`c0d1f4d`) | 25 job đạt, 172 giây; 63 task TS, 13 task Python chạy mới (hash mới) |
| `gh run rerun 45465050271`: attempt 2 | 25 job đạt, 160 giây; 63/63 TS, 13/13 Python đọc từ cache `nx-*-Linux-91/merge-c982f4e…` |
| Không chạy | `@sires/contracts:test` trên Windows (`check-drift.spec` cần `openapi-python-client`) |

### AC thay đổi trong Lần 10

| AC | Kết quả | Bằng chứng |
| --- | --- | --- |
| PID-00009-AC06 | Đạt | Task có input đổi chạy lại, kể cả khi thứ đổi là mã sinh ra từ `docs/api-design` (G19 đã sửa); task không đổi input đọc từ cache: 12/12 trên máy, 63/63 TS và 13/13 Python ở attempt 2 của CI #91 |
| AC01–AC05, AC07, AC08 | Như Lần 9 | AC04, AC05 trên mã CI `develop` cũ (G7, không chặn theo YC Lần 10) |

### Ranh giới

File đổi: `nx.json` (luồng infra) và `agent/execution/PID-00009/` (repo). Không có `docs/`, không có file của luồng contracts hay platform. File thử (YAML, các biến thể `nx.json`) đã hoàn lại; mã sinh ra nằm trong `.gitignore`.

### Tự đối chiếu (spec-converge-skill, chế độ Dev tự QC)

| Mã | Mức | Phát hiện | Trạng thái |
| --- | --- | --- | --- |
| G19 | HIGH | Mã hợp đồng sinh ra không nằm trong hash của task dùng nó | Đóng — `namedInputs.default` (PC-04 A12), đã kiểm bằng hash và lần chạy thật |
| G20 | LOW | Đầu ra `openapi-python-client` không giống nhau giữa các lần sinh (thứ tự import) | Mở — luồng contracts; không làm sai cache |
| G21 | LOW | `@sires/contracts:test` đọc `docs/api-design` thật nhưng không khai trong `inputs` | Mở — luồng contracts; job `contracts` chạy `check-drift` không cache mỗi khi `docs/api-design` đổi |
| G16 (QC) | LOW | EC15/S11 | Còn mở — chờ PO, không chặn |
| G7, G8, G9, G10, G12 (QC) | MEDIUM | Như Lần 9 | G7: phiên điều phối chạy lại T1, T2 sau khi đồng bộ `develop`. G8: số âm sửa ở #91, chờ lần chạy có job skipped. G12: lỗi ngẫu nhiên của Lần 9 đã sửa ở #100 |

Không còn CRITICAL hay HIGH.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. See [LICENSES.md](../../../LICENSES.md).
