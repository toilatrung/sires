# PID-00009 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể merge PR #91 và nghiệm thu PID-00009 — 0 CRITICAL, 0 HIGH. G19 sửa đúng PC-04 A12; QC tự kiểm bằng API hash của Nx: thêm schema thì hash consumer đổi, hoàn lại thì về như cũ, không đổi gì thì đọc cache. AC01–AC08 đạt (AC04, AC05 trên mã CI `develop` cũ, G7 PO cho không chặn). Còn MEDIUM: G7, G9 (chờ PO), G21 (luồng contracts); LOW: G8, G10, G12, G13–G17 (G16 chờ PO), G20, G22, G23. Trước merge cập nhật nhánh theo `main` (chậm 4 commit, gộp sạch) và chờ CI xanh (Lần 6, 25/11/2026)

- **Ticket:** [PID-00009](../../../docs/tickets/issues/PID-00009/index.html)
- **PR:** https://github.com/toilatrung/sires/pull/57 (Lần 1–5); https://github.com/toilatrung/sires/pull/91 (Lần 6)
- **Mã nguồn:** `infra/pid-00009-ci`, commit `aac981070e0f666d657b664b2b0aea33886f8db8` (Lần 1–5); `infra/pid-00009-t5-cache-main`, commit `548e5e241844c352176d952641a160f6e6ce28b1` (Lần 6).
- **Kết quả Dev:** `report.md`, `implement.md`, `self-qc.md`.

## Lần 1 — 22/11/2026 · spec-converge-skill

QC độc lập trên worktree riêng; không sửa mã hoặc `docs/`, không đăng review lên GitHub.

### Khoảng trống

| Mã | Nguồn | Loại | Mức | Bằng chứng | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | AC01, AC03–AC08; acceptance.html T1–T5, T7 | partial | HIGH | `agent/execution/PID-00009/report.md:46`; `self-qc.md:5`. T4 tại HEAD thành công nhưng chưa có bằng chứng nghiệm thu T1–T3, T7 và cache/concurrency T5. | Chạy PR thử đúng loại; ghi warm/cold timing T3, secret failure T7, skipped/concurrency T1 và lựa chọn project T2. T5 là kiểm sau merge theo spec; không yêu cầu chờ đủ 20 mẫu OQ-112. |
| G2 | S10 bước 3; lệnh tính OQ-112 | partial | MEDIUM | `infra/ci/measure.mjs:5`. Chạy `node infra/ci/measure.mjs` trên repo hiện tại thoát 1, `spawnSync gh ENOBUFS`: trang đầu 100 workflow runs vượt bộ đệm mặc định 1 MiB của execFileSync. | Lọc trường trả về bằng gh --jq trước khi đọc, tăng maxBuffer có giới hạn hợp lý hoặc đọc luồng; kiểm lại trên lịch sử hiện tại. |
| G3 | S07 build image khi đầu vào Docker thay đổi | partial | MEDIUM | `scripts/development/ci-changes.mjs:65`. Input `infra/docker/python/Dockerfile.dockerignore` cho `mode=filtered`, `affected=''`, `has_images=false`, `docker=false`. Cả hai Dockerfile.dockerignore thực tế có trong repo. | Coi Dockerfile.dockerignore là đầu vào image cùng ngôn ngữ; xác nhận Node chọn mọi image Node, Python chọn agent-core và knowledge. Nếu bỏ sót, thay đổi context làm build hỏng có thể qua CI. |
| G4 | scope.html EC15 | contradicts | MEDIUM | `scripts/development/ci-changes.mjs:43`, `:65`, `:67`. Input chỉ `apps/gateway/deploy/values.yaml` cho `affected=@sires/gateway`, `ts=true`, `has_images=true`. EC15 yêu cầu TS, Python và image skipped khi chỉ sửa values/chart/Terraform. | Loại thay đổi chỉ phục vụ deploy khỏi tập thay đổi Nx cho job code và khỏi lựa chọn image theo EC15. Đồng bộ cách chọn project trong workflow (hiện tính lại nx affected theo base/head) để hỗn hợp code/values cũng nhất quán. |

### AC

| AC | Trạng thái | Mức kiểm | Bằng chứng |
| --- | --- | --- | --- |
| AC01 | Chưa xác nhận | GitHub Actions | Chưa có T3 warm/cold timing theo S10. |
| AC02 | Đạt bộ tự kiểm | Loopback fixture, CI | OpenAPI selftest local thoát 0: mẫu đúng đạt, mẫu sai được phát hiện tại GET /invalid; job contract-test T4 thành công. |
| AC03 | Một phần | Mã và CI | Job secrets T4 thành công; chưa chạy PR thử T7 chứa secret mẫu trong lần QC này. |
| AC04 | Một phần | Script local | docs/tickets/index.html chọn affected rỗng, các cờ job liên quan false; chưa có T1 Actions. |
| AC05 | Một phần | Nx graph/script local | sires-common chọn đúng sires-common, agent-core, eval, knowledge; TS false, đúng hai image Python; chưa có T2 Actions. |
| AC06 | Một phần | T4 Actions | Mọi job T4 thành công; chưa xác nhận cache hit giữa runner trong T5. |
| AC07 | Một phần | Cấu hình | Concurrency theo PR; push main không hủy. Chưa mô phỏng hai push liên tiếp. |
| AC08 | Một phần | Mã và T4 | Có bước tổng hợp thời gian; chưa xác minh summary T1 bao gồm skipped. |

### Lệnh đã chạy

- `pnpm install --frozen-lockfile`: đạt.
- `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00009 --result`: đủ hồ sơ, 0 cảnh báo; không thay thế nghiệm thu.
- `gh pr view 57` và `gh run view 44933495024 --json jobs`: T4 trên đúng HEAD thành công, gồm images, Helm, Terraform, contract-test, asyncapi-payload và build. Run: https://github.com/toilatrung/sires/actions/runs/44933495024.
- `ci-changes.mjs --event pull_request --target develop --stdin` với docs-only, sires-common, schema identity: chọn đúng nhóm tương ứng. `pnpm nx show projects --affected --files=docs/api-design/internal/identity.yaml --json` cũng chọn các consumer TS, không có lỗi lệch danh sách ở trường hợp này.
- Các input Dockerfile.dockerignore và values-only tái hiện G3, G4.
- Input chart-only chọn `chart=true`, `has_images=false`. Theo workflow, download artifact và smoke image sẽ skipped; chỉ lint/render chạy. EC15 yêu cầu image skipped nhưng S11 bước 4 yêu cầu dùng image cùng run; cần PO làm rõ hai yêu cầu này trước khi coi smoke chart-only là tiêu chí bắt buộc.
- `uv run --locked --all-packages python infra/ci/asyncapi_selftest.py`: đạt khi đặt `PYTHONIOENCODING=utf-8` cho console Windows. Lần đầu chỉ lỗi in tiếng Việt với cp1252 sau khi các assert đã chạy.
- `uv run --locked python infra/ci/openapi_selftest.py`: đạt với UTF-8 console; mẫu sai bị từ chối đúng dự kiến.
- `node infra/ci/measure.mjs`: lỗi G2 ngay trang đầu API. Không thu được số mẫu/p95.
- Không chạy lại toàn bộ lint/test/build và Docker/Helm/Terraform local; T4 trên GitHub cung cấp bằng chứng các job này trên đúng HEAD. Không tạo PR thử hoặc thay đổi nhánh develop trong lượt review.

### Lệch với Self-QC

Xác nhận nhận định chưa nghiệm thu đầy đủ của Dev. Bổ sung G2–G4 bằng tái hiện trực tiếp; Self-QC chưa ghi các vấn đề này. Bộ lọc schema và Python được kiểm lại thành công, không chỉ dựa vào lời khai Dev.

### Việc còn lại

1. Sửa G2–G4; kiểm lại bộ lọc và lệnh đo.
2. Hoàn tất các phép thử trước merge thuộc G1; theo dõi T5 sau merge đúng thứ tự trong acceptance.html.
3. PO làm rõ EC15/S11 về image smoke trong run chỉ đổi chart. Không sửa spec trong lần QC này.

## Lần 2 — 22/11/2026 · Sửa theo yêu cầu PO

Nền mã cập nhật lên HEAD PR `42fded8dfac67f9eeaf4521f65e3139c8956d615`; bản sửa ở worktree `D:/sires-pr57-review`, nhánh local `fix/pr57-review`. Chưa commit/push hoặc chạy GitHub Actions cho bản sửa.

### Kết quả sửa

- G2: API của `measure.mjs` dùng `gh --jq` để chỉ nhận các trường cần thiết, giới hạn bộ đệm 16 MiB. Chạy lại trên dữ liệu GitHub thật thoát 0; cả hai nhóm in `0/20 lần`, không in p95 khi chưa đủ mẫu.
- G3: cả `Dockerfile` và `Dockerfile.dockerignore` chọn image theo ngôn ngữ. Python chọn agent-core, knowledge; Node chọn đúng 10 service Node.
- G4: chỉ đổi `apps/*/deploy/values.yaml` không đi vào tập file chọn project code và không trực tiếp chọn image. Workflow TS/Python dùng danh sách `affected` của classifier qua `nx run-many`, tránh tính lại trên toàn bộ diff. Đổi code gateway cùng values identity chỉ chọn code/image gateway và vẫn bật Helm.
- HEAD mới có thêm lỗi importer `libs/ts/sample-service` trong `pnpm-lock.yaml`: trỏ vitest 3.2.7 trong khi catalog/snapshot dùng 4.1.12. Tái tạo lockfile bằng pnpm chỉ đổi một dòng importer; frozen install sau đó đạt.
- README CI được cập nhật theo hành vi lọc mới. Không sửa `docs/`.

### Kiểm tra bản sửa

| Kiểm tra | Kết quả |
| --- | --- |
| 8 trường hợp classifier, chạy CLI thật với assert | Đạt: Python dockerignore, Node dockerignore, values-only, code gateway + values identity, sires-common, docs-only, schema identity, full main |
| Đồ thị task `nx run-many`, cùng tham số workflow | Đạt: gateway có lint/typecheck/test/build và dependency build, không có identity; Python có lint cho cả sires-common, agent-core, knowledge, eval |
| Parse YAML workflow và assert nguồn AFFECTED | Đạt cho TS và Python |
| `node infra/ci/measure.mjs` | Thoát 0 trên GitHub thật, 0/20 mẫu cho mỗi loại |
| `pnpm install --frozen-lockfile` | Đạt sau sửa lockfile |
| `pnpm exec eslint scripts/development/ci-changes.mjs infra/ci/measure.mjs` | Đạt |
| `node --check` cho hai script | Đạt |
| `node scripts/docs/add-license.mjs --check` | Đạt, 0 file thiếu. Cache Hypothesis do bộ tự kiểm lần trước tạo được chuyển vào `.nx/` trước khi kiểm |
| `node scripts/docs/update-index.mjs --check` | Đạt |
| `git diff --check` | Đạt |

G1 vẫn mở: kiểm cục bộ không thay thế T1–T3/T7 trên Actions và T5 sau merge. Xung đột EC15/S11 về smoke image khi chỉ đổi chart vẫn cần quyết định PO như đã ghi ở Lần 1.

## Lần 3 — 22/11/2026 · Bằng chứng nghiệm thu bổ sung

- T1: run 45024781831 thành công, 43s, các job không liên quan skipped; 45024755723 cancelled do push mới.
- T2: run 45024785948 thành công, 99s, đúng 4 project Python/2 image, TS skipped.
- T3: run 45024813714 cold 141s; rerun warm cache PR 60s, 8/8 task cache hit. Không thay bằng chứng cache main theo AC01.
- T7: run 45024821794 thất bại đúng kỳ vọng, secrets/build fail, nêu fixture dòng 3 và REDACTED, không có nguyên token giả trong log.
- T4: run 45024841054 trên code `d8c7076` đạt ở attempt 2, sau rerun Python/build. Test outbox `test_envelope_and_rollback` lỗi thứ tự ở attempt 1; cần platform xử lý test không ổn định.
- [Bằng chứng từng job](acceptance-20261122.json) và [báo cáo số đo](report.md). T1/T2/T3/T7 chạy trên baseline develop `518fc4e`, T4 chạy bản sửa. Các PR thử #73–#76 đã đóng/xóa nhánh.
- PO chọn “Chỉ đẩy bản sửa; để T5 sau merge”. Không kết luận đã nghiệm thu trọn vẹn AC01/AC06/AC07 phần main trước khi có T5 và cache main. Không merge trong phiên này.

## Lần 4 — 22/11/2026 · spec-converge-skill (QC độc lập)

> **Ghi chú:** các mục Lần 1–3 ở trên do Dev ghi (commit `add5003`, tác giả Nguyễn Xuân Việt Anh), không phải QC độc lập; theo DEC-58 Dev ghi `self-qc.md`, chỉ QC độc lập ghi `qc-report.md`. Lần 4 là lần QC độc lập đầu tiên của PID-00009; nội dung Lần 1–3 được giữ nguyên và chỉ coi là lời khai của Dev.

- **Người chạy:** QC độc lập do phiên PO giao (không mang kết luận của Dev).
- **Mã nguồn:** `infra/pid-00009-ci`, đầu nhánh `3fd73e7cf5abea0d88459c7cd558cebe3d1c29ad` (PR #57 vào `main`), worktree tách riêng, detached. `origin/main` `3dd4c15` là tổ tiên của đầu nhánh; `origin/develop` `518fc4e`.
- **Phạm vi:** hồ sơ `docs/tickets/issues/PID-00009/` (index, scope P1–P18, EC01–EC22, acceptance AC01–AC08 và T1–T7, slice S01–S12); mã `.github/workflows/ci.yml`, `infra/ci/`, `scripts/development/ci-changes.mjs`, `check-tracks.mjs`, `nx-uv-workspace.cjs`, `nx.json`, `package.json`, `pnpm-workspace.yaml`, `patches/`, `pnpm-lock.yaml`; lời khai `report.md`, `implement.md`, `self-qc.md`, Lần 1–3 ở trên và `acceptance-20261122.json`.
- Không sửa mã, `docs/`, lời khai của Dev; không mở, đóng PR; không chạy lại workflow.

### Lệnh đã chạy

| Lệnh | Kết quả thật |
| --- | --- |
| `pnpm install --frozen-lockfile` (đầu nhánh) | Đạt (3 phút 4 giây); chỉ cảnh báo build script bị bỏ qua của `cpu-features`, `protobufjs`, `ssh2` |
| `git merge-tree --write-tree HEAD origin/main` | Sạch: `main` đã nằm trong nhánh, gộp `main` không đổi lockfile |
| `git merge-tree --write-tree origin/develop HEAD` (mô phỏng đồng bộ `develop` sau merge) | Xung đột add/add 8 file: `ci.yml`, `ci-changes.mjs`, `measure.mjs`, `gitleaks.toml`, `infra/ci/README.md`, `report.md`, `implement.md`, `self-qc.md` của PID-00009 (bản #65 trên `develop` khác đầu nhánh); `pnpm-lock.yaml` gộp sạch |
| `pnpm exec nx show projects` theo tag | 20 project = 16 `lang:ts` + 4 `lang:python`, không project nào thiếu tag, nên `run-many` theo tag ở chế độ toàn bộ phủ mọi project |
| `nx show projects --affected --files=libs/py/sires_common/src/sires_common/errors.py` | `sires-common`, `agent-core`, `eval`, `knowledge` (EC05) |
| `ci-changes.mjs --event pull_request --target <đích> --stdin` với 15 bộ file (đích `develop` trừ khi ghi khác) | `docs/tickets/index.html`: lọc, không project, mọi cờ tắt, không image (AC04). `sires_common/errors.py`: lọc, 4 project Python, TS tắt, image `agent-core`, `knowledge` (AC05). `apps/gateway/src/main.ts`: lọc, `@sires/gateway`, image `gateway`. `uv.lock`: toàn bộ (EC04). Đích `main`: toàn bộ (AC06). Đích `feature/x`: toàn bộ (EC10). `internal/schemas.yaml`: lọc, cờ hợp đồng bật, 16 project TS gồm `@sires/contracts`, 10 image Node (EC08). `infra/docker/python/Dockerfile`: image `agent-core`, `knowledge`, không job code (EC14). `infra/terraform/envs/staging/main.tf`: chỉ cờ Terraform (EC15). `infra/helm/sires-service/values.yaml`: chỉ cờ chart, không image (EC15). `apps/gateway/deploy/values.yaml`: chỉ cờ chart, không code, không image. `infra/docker/node/Dockerfile.dockerignore`: 10 image Node. `apps/web/src/main.tsx`: `@sires/web`, không image (EC14). `--head` không tồn tại, không `--stdin`: toàn bộ (EC07). Sự kiện `push`: toàn bộ. Trên Windows, lần đầu của ca `feature/x` và ca Helm values gặp lỗi nạp plugin Nx (`UNKNOWN`), script chuyển sang toàn bộ đúng EC07; chạy lại cho kết quả trên |
| `check-tracks.mjs --base origin/main` | `infra, repo`, không cảnh báo |
| `check-tracks.mjs --stdin`: `apps/gateway/package.json` + `pnpm-lock.yaml`; `infra/helm/sires-service/values.yaml`; `uv.lock` | `gateway, repo` không cảnh báo (EC22); `infra`; `repo` |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard 159 task) |
| `check-pid.mjs PID-00009 --result` | KẾT QUẢ ĐỦ, 0 cảnh báo; trạng thái `report.md` vẫn “Đang làm” |
| `uv sync --all-packages --locked`, `asyncapi_selftest.py`, `openapi_selftest.py` trong container `uv:0.13.7-python3.12` trên bản sao cây đầu nhánh | Đạt cả ba: payload thiếu `aggregate` bị từ chối; `GET /valid` 1 passed, `GET /invalid` báo `'wrong' is not of type 'integer'` |
| `node infra/ci/measure.mjs toilatrung/sires` | Thoát 0: “PR vào develop chỉ đổi tài liệu: 2/20”, “Push toàn bộ vào main: 0/20”; không in p95 (đúng H5). Hai mẫu là T1 (đạt) và T7 (thất bại có chủ đích) |
| `diff --strip-trailing-cr` giữa bundle đã commit và bản đổi sang CRLF / bản sửa một mô tả | CRLF: thoát 0; sửa nội dung: thoát 1 (logic so của EC20; không chạy Redocly bundle cục bộ) |
| API Actions (`runs`, `attempts/N/jobs`, log job), `pulls/73–76` (commit, file), `pulls/57/commits`, comment PR #57 | Bảng bằng chứng dưới |
| Không chạy | `pnpm nx affected -t lint typecheck test build` cục bộ (máy Windows: Dev đã gặp EPERM ở trình sinh hợp đồng; python trong `.venv` bị chặn) — dùng job `typescript`, `python` của run 45026029201 trên đầu nhánh; `actionlint` (không có trên máy); Trivy, Helm, Terraform cục bộ — dùng log Actions; kiểm biểu thức cổng `build` bằng `jq` (máy không có `jq`) — dùng các run thật có job cancelled, failure |

### Bằng chứng Actions, tính lại từ API

Thời gian: `created_at` → `updated_at` của lần chạy; attempt rerun tính từ `run_started_at` của attempt.

| Ca | Run · attempt | Commit · mã CI đã chạy | Kết quả | Giây | So với `report.md` |
| --- | --- | --- | --- | ---: | --- |
| T1, push 1 | 45024755723 · 1 | `9fbeeec` (PR #73) · bản CI trên `develop` `518fc4e` | cancelled khi có push 2; `build` failure | 28 | Khớp |
| T1, push 2 | 45024781831 · 1 | `d6c8f13` · `develop` | `changes`, `docs`, `tracks`, `secrets`, `build` success; 9 job còn lại skipped | 43 | Khớp |
| T2 | 45024785948 · 1 | `f1d7f56` (PR #74) · `develop` | `python` chạy lint, typecheck, test cho 4 project (`eval` có cả test), image chỉ `agent-core`, `knowledge`, TS skipped; log cho thấy lệnh lọc là `nx affected --base --head` (bản cũ) | 99 | Khớp |
| T3 không cache | 45024813714 · 1 | `5b94f1e` (PR #75) · `develop` | `typescript` cho `@sires/gateway` và 4 task phụ thuộc; image chỉ `gateway` (108 giây) | 141 | Khớp |
| T3 chạy lại | 45024813714 · 2 | cùng commit | Nx 8/8 task từ cache khóa `nx-ts-Linux-75/merge-…` (cache của chính PR, không phải `main`); buildx báo CACHED | 60 | Khớp; không dùng để kết luận AC01 |
| T7 | 45024821794 · 1 | `97d19e6` (PR #76) · `develop` | `secrets` failure: rule `github-pat`, file `agent/execution/PID-00009/secret-fixture.txt`, dòng 3, Finding và Secret là REDACTED; chuỗi 40 ký tự trong patch của PR #76 xuất hiện 0 lần trong log; `build` failure | 25 | Report ghi 26 giây |
| T4 | 45024841054 · 1 | `d8c7076` · PR #57 | `python` failure: `test_envelope_and_rollback` nhận `['audit', 'event']` | 198 | Khớp |
| T4 | 45024841054 · 2 | `d8c7076` | success | 66 | Khớp |
| Đầu nhánh | 45026029201 · 1 | `3fd73e7` | `python` failure: testcontainers không kéo được `rabbitmq:4-management` (Docker Hub trả 500); `build` failure | 196 | Không có trong lời khai |
| Đầu nhánh | 45026029201 · 2 | `3fd73e7` | success: 25 job (12 image, `helm`, `terraform`, `contracts`, `dependencies`, `contract-test`, `asyncapi-payload`); TS 16 project, Python 4; `check-drift: đạt`, bundle khớp; `check-charts.mjs` đạt 12 chart, smoke `gateway`, `agent-core` trả `/health` 200, PID 1 không phải root; Terraform validate đạt; log `build` in bảng job, kết quả, giây; Nx báo “Cache not found … `nx-python-Linux-main-`” (chưa có cache `main`, đúng dự kiến) | 82 | Không có trong lời khai |

PR thử #73–#76 tạo từ `develop` `518fc4e` (cha của mọi commit thử), nên T1–T3, T7 chạy workflow và script trên `develop` (bản #65 + #69), không phải đầu nhánh. `acceptance-20261122.json` tự ghi điều này.

### Trạng thái G1–G4 của Lần 1–3

G2: `measure.mjs` chạy thoát 0 trên dữ liệu thật — đã xử lý. G3, G4: kiểm lại bằng script phân loại trên đầu nhánh (dòng `ci-changes.mjs` ở bảng lệnh) — `Dockerfile.dockerignore` chọn đúng image theo ngôn ngữ, chỉ sửa `deploy/values.yaml` chỉ bật cờ chart — đã xử lý; chưa có lần chạy Actions ở chế độ lọc cho hai ca này (G7). G1 được thay bằng G5–G8 dưới đây.

### Khoảng trống

| Mã | Nguồn | Loại | Mức | Bằng chứng | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G5 | AC01; acceptance T3; S10; H4 | partial | HIGH (sau merge) | Chưa có lần T3 dùng cache của `main`: workflow chưa ở `main` nên chưa có cache `nx-*-Linux-main-` (log run 45026029201). Số đo tham khảo 141 giây không cache, 60 giây cache của PR, đều trên mã CI của `develop`, không phải đầu nhánh | Sau T5 xanh và đồng bộ `develop`: mở lại T3 từ `develop` mới; lần chạy dưới 10 phút thì AC01 đạt |
| G6 | AC06 (phần cache), AC07 (phần push `main`); acceptance T5; S03 | missing | HIGH (sau merge) | Chưa có push vào `main` với workflow mới. Cấu hình đúng: `concurrency.group` dùng `run_id` khi push, `cancel-in-progress` chỉ đúng với `pull_request` (`ci.yml:14-16`); cache Nx ghi khóa `nx-*-Linux-main-<sha>` khi push (`ci.yml:107-109`, `151-153`) | Ngay sau merge: run push đầu tiên chạy toàn bộ và đạt; lần chạy kế (commit tiếp theo vào `main`) có log Nx đọc từ cache cho task không đổi, task có input đổi chạy lại (EC06); hai push gần nhau đều chạy hết |
| G7 | AC04, AC05, AC07 (phần PR); S01, S02, S07 | partial | MEDIUM | T1–T3, T7 chạy mã CI của `develop`. Đầu nhánh đã đổi lệnh lọc TS, Python từ `nx affected --base --head` sang `nx run-many --projects="$AFFECTED"` (`ci.yml:116`, `160`), đổi phân loại (`Dockerfile.dockerignore`, `deploy/values.yaml`), thêm `tee` bảng summary, thêm allowlist Gitleaks. Script phân loại trên đầu nhánh cho cùng tập project với T1–T3 nên rủi ro thấp, nhưng lệnh lọc mới chưa có lần chạy Actions ở chế độ lọc | Sau khi `develop` nhận bản đầu nhánh: chạy lại T1 (hai push), T2, T3 (gộp với G5); ghi run id vào `report.md` |
| G8 | AC08 (“kể cả job skipped”); S03 | partial | MEDIUM | Bảng summary của T1 chỉ ghi vào `GITHUB_STEP_SUMMARY` (bản `develop` chưa có `tee`); API không trả nội dung summary (check-run `output.summary` = null) và Dev không lưu lại nội dung. Run 45026029201 có bảng trong log nhưng là chế độ toàn bộ, không có job skipped. Job skipped có thể ra số giây âm (`helm`, `terraform`, `images` = −1 ở T2, T3 lần 2, T7) | Lấy bảng từ log `build` ở lần T1 chạy lại (G7); cân nhắc in 0 thay cho số âm |
| G9 | S01 EC21; S02 EC06; S03 EC01, EC16; S04 lint lỗi cố ý, EC20; S05 EC12; S06 EC19; S11 values hỏng; S12 `fmt` lệch | partial | MEDIUM | Các phép thử thao tác tay của slice chưa chạy (self-qc mục 3 ghi “chưa thử”, “chưa mô phỏng”); chỉ có fixture cục bộ (Gitleaks, Trivy) và T3 lần 1 không có Nx cache (một phần EC01). Cổng `build` với job cancelled hoặc failure đã thấy trên run thật (45024755723, 45024821794, 45026029201 lần 1) | Dev chạy trên nhánh thử vào `develop` sau khi đồng bộ, hoặc PO chấp nhận mức kiểm hiện có và ghi lại |
| G10 | Comment PO trên PR #57 ngày 22/11 lúc 06:33, điểm 1; S01 | partial | MEDIUM | `changes`, `secrets` checkout `pull_request.head.sha` (`ci.yml:49`, `57-59`, `204`), các job sau dùng `needs.changes.outputs.head`; `tracks`, `docs` checkout merge ref. PR từ nhánh không có file của PID-00009 lỗi `changes` (thiếu `ci-changes.mjs`) và `secrets` (thiếu `gitleaks.toml`) như #68. Đầu nhánh chưa đổi và `report.md` chưa ghi lý do giữ cách này như PO yêu cầu. Sau merge, mọi PR đang mở vào `main` tạo trước #57 sẽ đỏ `build` tới khi gộp `main` (ruleset vốn buộc cập nhật nhánh) | Dev chọn: đọc script, cấu hình từ merge ref hoặc base; hoặc ghi lý do và cách đồng bộ vào `report.md`. PO báo các luồng gộp `main` sau merge |
| G11 | P9, H3; `report.md` mục 6; spec mục 7 | unrequested | MEDIUM | Để S06 đạt, nhánh nâng catalog `vitest` 3.2.7 → 4.1.12 (major, mọi project TS), thêm 7 `overrides` và `patchedDependencies` vá mã `query-string@7.1.3` (`pnpm-workspace.yaml`, `patches/query-string@7.1.3.patch`). H3 cho phép ngoại lệ có lý do; người yêu cầu ghi ở mục 6 là congminh1705, không có lời PO. Job TS toàn bộ của run 45026029201 đạt, gồm `@sires/sample-service:test` với vitest 4 | PO xác nhận giữ cách nâng phiên bản và bản vá (hay đổi sang ngoại lệ trong `dependency-exceptions.json`); nếu giữ, báo các luồng TS về vitest 4 |
| G12 | AC06 (lần chạy toàn bộ đạt); `report.md` Lần 7 | partial | MEDIUM | 2/3 lần chạy toàn bộ gần nhất của PR #57 cần rerun vì lỗi ngoài mã của PID: `d8c7076` lần 1 (test outbox lỗi thứ tự), `3fd73e7` lần 1 (Docker Hub lỗi 500 khi kéo `rabbitmq:4-management`). Lần lỗi trên `3fd73e7` không có trong lời khai. Tới mốc DEC-59 mọi PR vào `main` chạy toàn bộ, nên `build` sẽ đỏ ngẫu nhiên và cần rerun | Dev ghi lần lỗi `3fd73e7` vào `report.md`; đề xuất ticket luồng platform cho `test_envelope_and_rollback`; PO cân nhắc giảm phụ thuộc kéo image ẩn danh từ Docker Hub (testcontainers, Trivy) |
| G13 | Bảo mật workflow | partial | LOW | Đạt: workflow chỉ `contents: read`, `build` chỉ `actions: read`; chỉ `pull_request` (không `pull_request_target`); giá trị từ event đi qua `env`; cache của PR nằm trong scope `refs/pull/N/merge`, PR không ghi được cache của `main` (H1); Gitleaks chạy `--network none`, mount chỉ đọc, `--redact=100`; image `push: false`. Còn: action ghim tag major (`@v3`, `@v4`, `@v6`), image Gitleaks, Trivy ghim tag không có digest; log cảnh báo Node.js 20 deprecated cho `actions/cache@v4`, `checkout@v4`, `setup-node@v4`; chỉ job `images` đặt `persist-credentials: false`; PR tự sửa được `infra/ci/gitleaks.toml`, `dependency-exceptions.json` dùng để quét chính nó, hai file này không có code owner | Ghim SHA, digest; nâng action; `persist-credentials: false` cho job không cần; PO cân nhắc code owner cho hai file cấu hình quét |
| G14 | EC12; commit `3fd73e7` | unrequested | LOW | Allowlist toàn cục `^skipped/concurrency$` thêm để bỏ false positive `generic-api-key` trong chính `qc-report.md` do Dev viết. Hẹp (chỉ đúng giá trị đó), `secrets` của run 45026029201 đạt. EC12 yêu cầu PO xem ngoại lệ khi review | PO duyệt, hoặc yêu cầu sửa câu chữ thay cho ngoại lệ |
| G15 | N3; DEC-59 | partial | LOW | `restore-keys` cố định `nx-*-Linux-main-`. Khi `develop` thành nhánh mặc định, PR vào `develop` không còn đọc được cache của `main` (GitHub chỉ cho đọc cache của nhánh base và nhánh mặc định), và hiện CI không chạy khi push `develop`. N3 chưa nêu khóa cache | Thêm vào việc của luồng infra tại mốc DEC-59 |
| G16 | EC15, S11 bước 4 | Cần PO | LOW | PR chỉ đổi chart: `images` skipped theo EC15 nên bước smoke image của `helm` skipped, trong khi S11 bước 4 dùng image cùng lần chạy. Dev nêu “Cần PO” từ Lần 1, chưa có câu trả lời | PO chốt (spec-clarify-skill) |
| G17 | S01 bước 5; S10; `nx.json` | unrequested | LOW | Thêm `analytics: false` và định dạng lại mảng trong `nx.json`; lệnh lọc dùng `run-many` theo danh sách của script thay cho `nx affected` như S01 ghi (cùng tập project, `implement.md` có nêu); `measure.mjs` đếm cả lần chạy thất bại (T7) vào mẫu ngưỡng OQ-112 | PO biết; cân nhắc chỉ đếm lần chạy đạt khi tính p95 |
| GP1 | DEC-58; spec-converge-skill | contradicts (quy trình) | MEDIUM | `qc-report.md` Lần 1–3 do Dev ghi (`add5003`) và tự gọi là “QC độc lập”; Lần 2 còn ghi đường dẫn máy của Dev | Dev không ghi `qc-report.md`; kết quả tự QC đặt ở `self-qc.md`. PO quyết định có xóa đường dẫn máy ở Lần 2 không |
| GP2 | `report.md` Lần 6 và mục 5; `acceptance-20261122.json` (“per user instruction”) | partial (quy trình) | MEDIUM | Các câu “chạy nốt nghiệm thu đi ròi đẩy lên”, “Chỉ đẩy bản sửa; để T5 sau merge” được ghi là lời PO; phiên PO giao QC không chuyển các câu này, QC không xác minh được nguồn nên không coi là quyết định PO | PO xác nhận hoặc bác; nếu đúng, Dev ghi nguồn (comment PR, phiên) |
| GP3 | Ruleset `protect-main-develop` | partial (quy trình) | LOW | 7/13 commit chưa ký: `ebd11f4`, `3278788`, `70cbf2c`, `040d4f7`, `6333b4e`, `9fcac0b` (Hoang Cong Minh), `2414049` (Nguyễn Xuân Việt Anh); 6 commit còn lại Verified. Không có trailer ghi công AI; message có dấu tiếng Việt | PO squash (xem lại dòng Co-authored-by GitHub tự điền) hoặc ký lại |
| GP4 | Sổ task-registry; DEC-58 | partial (quy trình) | LOW | `report.md` ghi người thực hiện congminh1705, còn PR #57 và các commit mã từ `2414049` do Vietanhhhhhh2003 làm; `report.md` vẫn “Đang làm” (khớp H5 vì AC01, AC06, AC07 chưa xong) | PO xác nhận phân công |

### AC

| AC | Trạng thái | Mức kiểm | Bằng chứng |
| --- | --- | --- | --- |
| AC01 | Chưa (sau merge) | Actions, mã CI của `develop` | 141 giây không cache (45024813714 lần 1), 60 giây cache PR (lần 2); chưa có cache `main` (G5) |
| AC02 | Đạt (bộ tự kiểm T6) | Actions và container | `contract-test` của 45026029201: `GET /valid` passed, `GET /invalid` failed vì `'wrong'` không phải integer; tự chạy lại đạt; chưa project nào khai target (EC17) |
| AC03 | Đạt | Actions | T7 45024821794: `secrets` failure, nêu file và dòng 3, giá trị REDACTED, chuỗi gốc không có trong log, `build` failure; `secrets` đạt trên đầu nhánh |
| AC04 | Đạt trên mã CI của `develop` | Actions và script | T1 45024781831; script trên đầu nhánh cho cùng kết quả với `docs/tickets/index.html` (G7) |
| AC05 | Đạt trên mã CI của `develop` | Actions và script | T2 45024785948: 4 project Python, TS skipped, image `agent-core`, `knowledge`; script trên đầu nhánh cùng kết quả; lệnh lọc trên đầu nhánh chưa chạy Actions (G7) |
| AC06 | Một phần | Actions | Chạy toàn bộ: 45026029201 lần 2 (25 job, 20 project); phần cache ở T5 chưa có (G6) |
| AC07 | Một phần | Actions và cấu hình | PR: 45024755723 cancelled khi có push 2 (mã `develop`); push `main`: chỉ có cấu hình (G6) |
| AC08 | Một phần | Actions | Bảng job, kết quả, giây trong log `build` 45026029201 (toàn bộ, không có skipped); trường hợp job skipped chưa có bằng chứng đọc lại được (G8) |

### Lệch với Self-QC và lời khai

- Lần 1–3 trong file này là lời khai của Dev, không phải QC độc lập (GP1).
- Điểm 2 trong comment PO (lockfile) đã xử lý: `d8c7076` sửa importer `libs/ts/sample-service`, frozen install đạt trên đầu nhánh, gộp `main` sạch, `@sires/sample-service:test` chạy với vitest 4 trong 45026029201. Điểm 1 chưa xử lý, chưa ghi (G10).
- `report.md` gọi T4 là `d8c7076`; đầu nhánh hiện là `3fd73e7`, lần đạt là 45026029201 lần 2, sau một lần lỗi không ghi lại (G12).
- `report.md`, `self-qc.md` ghi S01, S02, S07 “Đạt T1, T2, T3” mà không nói đó là mã CI của `develop`; `acceptance-20261122.json` thì có ghi (G7).
- T7: report ghi 26 giây, API cho 25 giây (không ảnh hưởng kết luận).
- Các câu trích lời PO chưa xác minh được nguồn (GP2).

### Kết luận về merge

- Không còn CRITICAL. Hai HIGH (G5, G6) thuộc phần spec đặt sau merge: acceptance.html định nghĩa T5 là “lần chạy sau khi PO merge PR”, AC01 kết luận bằng cache của `main` (H4), chỉ có khi workflow đã ở `main`. Hai HIGH này không chặn merge nhưng chặn nghiệm thu; PID chưa Xong (H5).
- Có thể merge (squash, PO) với điều kiện, theo thứ tự: (1) ngay sau merge, run push đầu tiên vào `main` chạy toàn bộ và đạt (T5); (2) commit kế tiếp vào `main` cho log Nx đọc từ cache và hai push gần nhau đều chạy hết (G6); (3) đồng bộ `develop` theo `main`: 8 xung đột add/add giải theo bản của `main`; (4) chạy lại T1 (hai push), T2, T3 từ `develop` mới để đóng G5, G7, G8; (5) báo các luồng gộp `main` vào nhánh đang mở (G10).
- Rủi ro nếu workflow mới lỗi trên `main`: PR vào `main` lấy workflow từ merge ref, nên lỗi cấu trúc (ví dụ `changes` hỏng) hay lỗ hổng High mới có bản sửa (job `dependencies` chạy ở mọi PR chế độ toàn bộ) làm `build` đỏ cho mọi PR, tức chặn cả repo. Cách lùi: một PR revert commit squash của #57 vào `main` (PO bypass ruleset nếu `build` của chính PR revert đỏ), workflow cũ trở lại cho PR kế tiếp; lỗ hổng mới thì khai ngoại lệ có lý do trong `dependency-exceptions.json`; lỗi ngẫu nhiên (G12) thì rerun.

### PO cần quyết

1. GP2: xác nhận hay bác các câu trích được ghi là lời PO.
2. G11: giữ nâng vitest 4, `overrides`, bản vá `query-string` hay đổi sang ngoại lệ.
3. G10: giữ checkout đầu nhánh PR hay đổi sang merge ref, base.
4. G14: duyệt allowlist Gitleaks; G16: smoke image khi chỉ đổi chart.
5. G9: yêu cầu chạy các phép thử thao tác tay hay chấp nhận mức kiểm hiện có.
6. GP3: squash hay ký lại 7 commit; GP4: phân công.

### Việc còn lại

1. GP1 (Dev): không ghi `qc-report.md`; chuyển phần tự QC sang `self-qc.md` ở lần sau.
2. G10, G12 (Dev): sửa hoặc ghi lý do checkout đầu nhánh; ghi lần lỗi của `3fd73e7` — có thể làm trước merge, không bắt buộc.
3. G6 (PO, Dev): T5 ngay sau merge.
4. G5, G7, G8 (PO đồng bộ `develop`; Dev chạy lại T1–T3): sau T5.
5. G9 (Dev): phép thử thao tác tay trên nhánh thử, theo quyết định PO.
6. G11, G14, G16 (PO quyết); G13, G15, G17 (Dev, luồng infra, khi tiện hoặc tại mốc DEC-59); test outbox (luồng platform, G12).

## Lần 5 — 22/11/2026 · ghi quyết định PO trước khi merge

Người chạy: phiên do PO giao; lần này chỉ ghi quyết định PO và kiểm lockfile sau khi gộp `main`, không chạy lại các phép kiểm của Lần 4. Mã nguồn: đầu nhánh `31a1916` cộng commit gộp `main` `79075b4` (PID-00023 #71, PID-00017 #72, PID-00002 #70): git tự gộp `pnpm-lock.yaml` không xung đột; importer `apps/planning`, `apps/workspace`, `libs/ts/sample-service` đều trỏ vitest 4.1.12; `pnpm install --frozen-lockfile` đạt.

Quyết định PO (trả lời ba câu hỏi của phiên PO, 22/11/2026):

| G | Quyết định PO | Trạng thái |
| --- | --- | --- |
| G5, G6 | “Merge ngay, chạy T5”: merge squash; ngay sau merge theo dõi T5 trên `main`, đồng bộ `develop`, Dev chạy lại T3 từ `develop` mới để kết luận AC01 với cache của `main`; workflow lỗi nặng thì revert commit squash | Còn mở (sau merge) |
| G11 | “Nhận vitest 4 và bản vá”: giữ catalog vitest 4.1.12, 7 `overrides` và `patches/query-string@7.1.3.patch`; báo các luồng TS | Đóng |
| GP2 | “Có, tôi đã nói”: hai câu trích ở `report.md` Lần 6 là lời PO; Dev ghi nguồn (phiên, comment) khi cập nhật | Đóng |
| GP1 | DEC-58: `qc-report.md` chỉ do QC độc lập ghi; Dev ghi kết quả tự kiểm ở `self-qc.md` | Nhắc Dev |
| G7–G10, G12 | Như Lần 4 | Còn mở |

## Lần 6 — 25/11/2026 · spec-converge-skill (QC độc lập)

- **Người chạy:** QC độc lập do PO `toilatrung` giao, không mang kết luận của Dev.
- **Mã nguồn:** PR #91, nhánh `infra/pid-00009-t5-cache-main`, đầu nhánh `548e5e241844c352176d952641a160f6e6ce28b1`, worktree tách riêng, detached. Mã đổi so với `main`: `nx.json` (G18 ở `targetDefaults`, G19 ở `namedInputs.default`) và `.github/workflows/ci.yml:392` (số giây của job skipped); còn lại là `agent/execution/PID-00009/`. Lúc ghi, `origin/main` `414545f` đi trước nhánh 4 commit (#102, #97, #98, #99); `git merge-tree` sạch, `main` không đổi `nx.json`, `ci.yml`.
- **Căn cứ quyết định:** PC-04 A12, phương án (b) (có ở `docs/overview/phieu-chot-ph01.html` trên `main` từ #102); EC15/S11 (G16) “Còn mở — chờ PO” và G7 không chặn (`report.md` mục 6, YC Lần 10).
- Không sửa mã, `docs/` hay lời khai của Dev; không chạy lại workflow, không comment PR. Các file thử (schema trong `docs/api-design/internal/library.yaml`, `pyproject.toml` gốc, `nx.json` của `main`) chỉ đổi trong worktree QC và đã hoàn lại; `git status` sạch.

### Lệnh đã chạy

| Lệnh | Kết quả thật |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (39 giây) |
| `check-pid.mjs PID-00009 --result` | KẾT QUẢ ĐỦ, 0 cảnh báo; trạng thái “Xong — chờ QC” |
| `node scripts/docs/add-license.mjs --check`; `node scripts/docs/update-index.mjs --check` | 0 file thiếu; khớp (159 PID, taskboard 159 task) |
| `check-tracks.mjs --base origin/main` | `infra, repo` |
| `git diff --check origin/main...HEAD` | Sạch |
| `node infra/ci/measure.mjs toilatrung/sires` | Lần đầu: “PR vào develop chỉ đổi tài liệu: 2/20 lần”, “Push toàn bộ vào main: 16/20 lần”, không in p95. Chạy lại sau 4 lần push `main` (#102, #97, #98, #99): “Push toàn bộ vào main: 20/20 lần”, “p95 8.45 phút · p95 + 20% 10.14 phút”; QC tính lại từ `gh run list`: hạng 19/20 = 507 giây, mẫu gồm lần đỏ #94 (410 giây, G17) |
| `gh api` (`runs/<id>`, `attempts/N`, `…/jobs`) và `gh run view --job <id> --log` cho 15 run được trích; attempt 1 của 45465050271 lấy bằng `gh run view --attempt 1 --log` | Bảng bằng chứng dưới |
| Biểu thức `--jq` mới ở `ci.yml:392`, chạy bằng `gh api` trên T3 45442437182 | `python`, `contracts`, `dependencies`, `terraform`, `helm` skipped đều ra 0; log `build` của run đó (mã cũ) in −1 và −16 |
| `nx run-many -t build --projects=tag:lang:ts` (Windows) | Đạt, 16 task |
| `generate.mjs --python-only` trong container `node:22` có `uv` 0.13.7, trên bản `git archive` của đầu nhánh; chép `generated/` về worktree | Đạt: 9 API nội bộ, 42 message, 572 file. Hai lần với `PYTHONHASHSEED=0`: 0 file khác; hai lần không cố định seed: 42 file khác (G20) |
| Script hash tạm ngoài repo (`InProcessTaskHasher` của Nx 22.7.12, `NX_DAEMON=false`) trên 29 task của `@sires/contracts`, `gateway`, `library`, `platform`, `audit`, `testing`, `sires-common`, `agent-core` | Bảng G19 dưới |
| `nx run-many -t lint typecheck test build -p @sires/gateway @sires/library`, hai lần liền không đổi gì | Lần 1: 6/12 task từ cache (máy chưa có cache của `lint`, `typecheck`, `test`); lần 2: `Nx read the output from the cache instead of running the command for 12 out of 12 tasks.` |
| `nx run-many -t build --projects=tag:lang:ts --skip-nx-cache`, rồi hash lại | 29/29 hash như trước: build lại `tsc` cho đầu ra giống hệt |
| `ci-changes.mjs --event pull_request --target develop --stdin` với `docs/api-design/internal/library.yaml`, `docs/api-design/events/asyncapi.yaml`; `nx graph --file` | Cả hai: `contracts: true`, `ts: true`, `python: false`, 16 project TS; trong đồ thị, `sires-common` không có cạnh nào (G22) |
| Không chạy | `sires-common:test`, `@sires/contracts:test` thật: Windows chặn Python trong `.venv` và `openapi-python-client`; dùng hash và log Actions thay. `actionlint`: không có trên máy |

### Bằng chứng Actions, tính lại từ API

Giây = `updated_at − created_at`; attempt 2 tính từ `run_started_at`.

| Ca | Run | Commit | Kết quả | Giây | Cache Nx khôi phục | Nx đọc từ cache: TS · Python | So với `report.md` |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| T3 (AC01) | 45442437182 | `5237827` (#96 vào `develop`) | success; 9 job đạt, 5 skipped | 182 | `Cache hit for restore-key: nx-ts-Linux-main-4578236…` | 4/8 · skipped | Khớp. Job `changes`: `mode` `filtered`, `base` `c11bba3…`, `affected` `@sires/gateway`, image chỉ `gateway`; #96 chỉ đổi `apps/gateway/src/main.ts`, đóng 16:59:44Z, không merge |
| T5, lần 1–6 | 45033510448, 45036410342, 45040139870, 45203674571, 45416191365, 45416543323 | `29edd87` … `0153261` | mỗi lần 24 success, `tracks` skipped | 182, 188, 171, 191, 215, 228 | Lần 1 `Cache not found`; mỗi lần sau khôi phục đúng khóa `main` của lần trước | 0·0, 61·11, 62·12, 29·13, 59·13, 59·13 (trên 63 · 13) | Khớp |
| T5, lần 7–10 | 45422174396, 45441520021, 45441635225, 45442384648 | `343c7b9`, `4578236`, `80a6626`, `f28424c` | success; success; failure (`typescript`, `build`); success | 205, 393, 410, 268 | TS: `0153261`, `343c7b9`, `4578236`, `4578236` (lần 9 đỏ nên không lưu cache TS) | 63·13, 15·13, —·6, 46·13 | Khớp |
| CI #91, `b4acaa4` | 45445130739 | | 25 success | 273 | | | Khớp |
| CI #91, `c0d1f4d`, attempt 1 | 45465050271 | merge `c982f4e` | 25 success | 173 | `main-eafd885…` (hash cũ); lưu khóa `nx-*-Linux-91/merge-c982f4e…` | 0/63 · 0/13 | `report.md:286` ghi 172 giây |
| CI #91, attempt 2 | 45465050271 | như trên | 25 success | 160 | `Cache hit for: nx-ts-Linux-91/merge-c982f4e…` (khớp khóa chính, máy runner mới) | 63/63 · 13/13 | Khớp |
| Đầu nhánh `548e5e2` | 45466599386 | merge `1634b32` | 25 success | 201 | `main-eafd885…` (hash cũ) | 0 · 0, mọi task chạy và đạt | Không có trong lời khai (push sau Lần 10) |

- Sau #95 có thêm 10 lần push `main` (#82, #66, #100, #87, #90, #101, #102, #97, #98, #99; run 45452442149 … 45472764144), đều success ở attempt 1. Từ #57 tới #99 có 20 lần push `main`: 19 đạt ngay lần đầu, 1 đỏ (#94).
- AC07, phần push `main`: 45416191365 (14:37:34–14:41:09Z) và 45416543323 (14:39:30–14:43:18Z) chồng nhau 99 giây; 45441520021, 45441635225, 45442384648 cùng chạy trong 16:53:39–16:55:40Z. Cả năm lần `completed`, không lần nào `cancelled`; cấu hình ở `ci.yml:14-16`. Job `typescript` của 45416191365 xong 14:38:51Z, job của 45416543323 bắt đầu 14:40:01Z và khôi phục `nx-ts-Linux-main-10ee7a6…`.
- Thời gian job `typescript` khi mọi task chạy: 150 giây (45033510448), 168 giây (45420184190, bản G18), 138 giây (45465050271 attempt 1, bản G19). Băm thêm đầu ra của task phụ thuộc không làm chậm thấy được.

### G19 — QC tự kiểm bằng API hash của Nx

Thay đổi thử: thêm schema mới `QcProbeG19` (object, một trường `probe`) vào `components.schemas` của `docs/api-design/internal/library.yaml`. Sau đó `nx run-many -t build --projects=tag:lang:ts` chạy lại `generate-ts`, `@sires/contracts:build` và 14 build phụ thuộc (`dist` của contracts có `QcProbeG19`); sinh lại Python có cố định seed thì thêm `library/models/qc_probe_g19.py` (573 file). Hoàn lại YAML: build đọc cache 16/16, `dist` không còn schema thử, mã Python sinh lại giống hệt bản gốc (0 file khác). Mỗi trạng thái được hash với `nx.json` của nhánh và với `nx.json` của `main`; chỉ so trong cùng một cấu hình, vì Nx băm cả `nx.json`.

| Trạng thái | `nx.json` của nhánh (bản sửa) | `nx.json` của `main` |
| --- | --- | --- |
| Không đổi gì, hash hai lần | 29/29 giống nhau | — |
| Đổi YAML, chưa sinh lại | 2 task đổi: `generate-ts`, `generate-python` | — |
| Thêm schema, đã sinh lại | **22/29 đổi**: `lint`, `typecheck`, `test`, `build` của `gateway`, `library`, `platform`, `audit`; `@sires/contracts:typecheck`, `build`; `@sires/testing:build`; `sires-common:test`; 2 task sinh mã | **2/29 đổi**, chỉ 2 task sinh mã: tái hiện G19 |
| Hoàn lại, sinh lại | 29/29 về hash gốc | 29/29 về hash gốc |

- Không đổi với bản sửa: `@sires/contracts:lint`, `@sires/contracts:test`, `sires-common:lint`, `sires-common:typecheck`, `agent-core:lint`, `typecheck`, `test`. `lint`, `typecheck` không đọc mã sinh ra (`eslint.config.mjs:11` bỏ `**/src/generated/**`; mypy của `sires-common` có `exclude` `src/sires_common/generated/`; ruff theo `.gitignore`). Mã Python ngoài `generated/` không import `sires_common.generated`, chỉ spike `apps/agent-core/spikes/spk-08`. `@sires/contracts:test`: xem G21.
- G20: cùng YAML, hai lần sinh Python không cố định seed thì chỉ hash `sires-common:test` đổi (1/29). Trên CI cache vẫn trúng, vì đầu ra của `generate-python` được khôi phục từ cache chứ không sinh lại.
- EC06 (G18) kiểm lại: đổi `line-length` trong `pyproject.toml` gốc thì bản sửa đổi hash 27/29 task (mọi task trừ 2 task sinh mã), gồm `sires-common:lint`, `typecheck` và `@sires/contracts:lint`, `typecheck`, `test`; với `nx.json` của `main`, 7 task này giữ nguyên hash.
- Kết luận: bản sửa đúng PC-04 A12 và đạt cả ba điều kiện: hash consumer đổi khi thêm schema, hoàn lại thì về như cũ, không đổi gì thì đọc cache (cục bộ 12/12; trên Actions 63/63 và 13/13 ở runner mới). Đóng G19, G18.

### Trạng thái khoảng trống của Lần 4–5

| G | Trạng thái Lần 6 |
| --- | --- |
| G5 | Đóng: T3 45442437182, 182 giây, cache của `main` |
| G6 | Đóng: T5 với 20 lần push `main`, cache nối tiếp (10 lần đầu QC đọc log), hai nhóm push chồng nhau |
| G7 | Còn mở, MEDIUM: T1, T2 vẫn chạy trên mã CI `develop` cũ; PO cho không chặn |
| G8 | Đóng phần chính, còn LOW: bảng có job skipped (log `build` T3: 14 job, 5 skipped); `max(…, 0)` ở `ci.yml:392` đúng trên dữ liệu thật qua `gh api`; chưa có lần chạy Actions nào có job skipped với bản sửa, vì PR vào `main` không có job skipped |
| G9 | Còn mở, MEDIUM: ngoài EC06, các phép thử tay EC01, EC16, EC19, EC21, lint lỗi cố ý (S04), EC20 trên runner, values hỏng (S11), `fmt` lệch (S12) vẫn chưa chạy; chưa có quyết định PO; `report.md` mục 5, 7 không nêu |
| G10 | Hạ xuống LOW: rủi ro đã qua, các nhánh PR đang mở (#38, #63, #85) đều có `ci-changes.mjs`, ruleset buộc cập nhật nhánh; vẫn chưa ghi lý do giữ checkout `pull_request.head.sha` (`ci.yml:49`, `:204`) |
| G12 | Hạ xuống LOW: 19/20 lần push `main` đạt ở attempt 1; lần đỏ (#94, `migration.spec.ts`) đã sửa ở #100; test outbox vẫn là việc của luồng platform |
| G13, G14, G15, G17 | Như Lần 4, LOW |
| G16 | Còn mở — chờ PO, LOW; đúng YC Lần 10 |
| GP1 | Đóng: từ #57 không có commit nào của Dev vào `qc-report.md` |
| GP3 | Đóng cho #91: 8/8 commit có chữ ký hợp lệ (`G`), không có dòng ghi công AI |
| GP4 | Đóng: PC-04 B1 chuyển PID-00009 sang `toilatrung`; `report.md:6` ghi người làm từ Lần 8 |

### Khoảng trống mới hoặc đổi mức

| Mã | Nguồn | Loại | Mức | Bằng chứng | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G20 | AC06; S02 | partial | LOW | `libs/ts/contracts/scripts/generate.mjs:31`: `spawnSync` không đặt `PYTHONHASHSEED`; QC đo 42 file khác giữa hai lần sinh; chỉ đổi hash `sires-common:test`, không làm sai cache | Luồng contracts đặt `PYTHONHASHSEED=0` trong env của `run()` |
| G21 | AC06 (task có input đổi chạy lại); EC08 | partial | MEDIUM (Dev ghi LOW) | `libs/ts/contracts/package.json:21`: `test` chạy `check-drift.spec.mjs`, không khai `inputs` nên dùng `default`, `^default` của `targetDefaults`, không có `docs/api-design`; `check-drift.spec.mjs:94-96`, `:112`, `:130`, `:171` sinh và kiểm từ `docs/api-design` thật. QC đo: thêm schema thì hash `@sires/contracts:test` không đổi. PR chỉ đổi hợp đồng mà làm hỏng các test này vẫn xanh nhờ cache của `main`, và `main` giữ kết quả cũ tới khi file trong `libs/ts/contracts` đổi. Job `contracts` (`ci.yml:168-195`) chạy `check-drift` không cache nhưng không chạy các test này | Luồng contracts khai `{workspaceRoot}/docs/api-design/**/*.yaml` vào `inputs` của `test` (file của luồng contracts, ngoài phạm vi sửa của PID này); PO giao trước mốc DEC-59; không chặn merge #91 |
| G22 | EC08 (`@sires/contracts` và project phụ thuộc chạy lint, typecheck, test, build); S01 | partial | LOW | PR vào `develop` chỉ đổi `docs/api-design`: `ci-changes.mjs` ra `python: false` (`scripts/development/ci-changes.mjs:77`), job Python skipped (`ci.yml:126`). `sires-common:test` dùng mã Python sinh ra qua `dependsOn` ở mức task (`libs/py/sires_common/project.json:29-30`; `tests/test_contracts_import.py:18`), nhưng đồ thị project không có cạnh `sires-common` → `@sires/contracts`. Giảm nhẹ: job `contracts` chạy phần Python của `check-drift` (mypy trên các project Python, giữ kiểu sinh ra). Hiện mọi PR vào `main` chạy toàn bộ nên chưa lộ; lộ từ mốc DEC-59 | Luồng infra: `ci-changes.mjs` bật Python và chọn `sires-common` khi nhóm hợp đồng đổi, hoặc plugin `nx-uv-workspace.cjs` thêm cạnh; PO quyết cùng G15 tại mốc DEC-59 |
| G23 | Ghi kết quả (spec-execution-skill) | partial | LOW | `report.md:14-15` vẫn ghi “Cache của main và T5 còn chờ sau merge”; `:35`, `:55` ghi 10 lần push `main` (nay 20/20, đã có p95); `:3` ghi “AC01–AC08 đạt” trong khi `:20` ghi AC04, AC05 trên mã `develop` cũ; `:286` ghi 172 giây (API 173); mục 5, 7 (`:59-65`, `:79-81`) không nêu G9, G10, G12 còn mở | Dev cập nhật ở lần ghi sau |

### AC

| AC | Trạng thái | Mức kiểm | Bằng chứng |
| --- | --- | --- | --- |
| PID-00009-AC01 | Đạt | Actions, cache `main` | T3 45442437182: 182 giây, dưới 10 phút; 4/8 task từ cache `main`. EC11: lúc chạy `develop..main` = 1 vì #95 merge lúc 16:53:35Z, chỉ 6 file trong `docs/`, không file nào là input Nx hay CI; QC chấp nhận, không ảnh hưởng kết luận. Lần không cache tham khảo: 141 giây (#75, mã cũ) |
| PID-00009-AC02 | Đạt (T6) | Actions | `contract-test` đạt ở mọi lần chạy toàn bộ, gồm 45466599386 trên đầu nhánh |
| PID-00009-AC03 | Đạt | Actions | T7 (Lần 4), không đổi |
| PID-00009-AC04 | Đạt trên mã CI `develop` cũ | Actions | T1 45024781831 (G7) |
| PID-00009-AC05 | Đạt trên mã CI `develop` cũ | Actions | T2 45024785948 (G7) |
| PID-00009-AC06 | Đạt | Actions, hash Nx, chạy thật | T4; T5 20 lần; G18, G19 kiểm bằng hash; 45465050271 attempt 2: 63/63, 13/13 từ cache trên runner mới; cục bộ 12/12. Còn G21 (MEDIUM, luồng contracts) |
| PID-00009-AC07 | Đạt | Actions | PR: 45024755723 cancelled (Lần 4); push `main`: hai nhóm chồng nhau ở trên, không lần nào bị hủy |
| PID-00009-AC08 | Đạt | Actions, `gh api` | Bảng của job `build` có mọi job, kể cả skipped; số giây âm đã sửa và kiểm bằng `gh api --jq` (G8, LOW) |

### Lệch với Self-QC và lời khai

- Số liệu T3, T5, AC07, CI #91 tính lại từ API khớp `report.md` Lần 8–10, trừ 45465050271 attempt 1: 173 giây, report ghi 172.
- G21: Dev xếp LOW vì job `contracts` chạy `check-drift` không cache. QC xếp MEDIUM, vì job đó không chạy `check-drift.spec.mjs`, nên các test dùng hợp đồng thật vẫn có thể lấy kết quả cũ từ cache.
- G20: Dev đo 34 file khác, QC đo 42; cùng hiện tượng, số file tùy seed ngẫu nhiên.
- G19: Dev đếm 12/17 task đổi hash, QC đếm 22/29 trên tập task rộng hơn (thêm `lint`, `build`, `audit`, `testing:build`); cùng kết luận.
- G22 chưa có trong `self-qc.md`. G9, G10, G12 có trong `self-qc.md` nhưng không có ở mục việc còn lại và cần PO của `report.md` (G23).

### Kết luận về merge

- 0 CRITICAL, 0 HIGH: PO có thể merge #91 và nghiệm thu PID-00009 (H5: AC01–AC08 đạt; AC04, AC05 ở mức mã `develop` cũ theo quyết định G7).
- Trước merge: nhánh chậm `main` 4 commit (#102, #97, #98, #99), gộp sạch; cập nhật nhánh và chờ CI xanh trên đầu mới (ruleset). Vì `nx.json` đổi nên mọi hash đổi: lần chạy đó và lần push `main` đầu tiên sau merge chạy lại mọi task một lần, khoảng 3 phút như 45465050271 attempt 1 và 45466599386.
- Sau merge: bảng job của lần push `main` đầu tiên phải in 0 giây cho `tracks` skipped (G8).

### PO cần quyết

1. G9: yêu cầu chạy các phép thử tay còn lại, hay chấp nhận mức kiểm hiện có và ghi lại.
2. G21, G20: giao luồng contracts, trước mốc DEC-59.
3. G22 cùng G15: việc của luồng infra tại mốc DEC-59.
4. G16 (EC15/S11): như trước.
5. OQ-112 (N10, H5, không thuộc nghiệm thu PID này): nhóm push `main` đã đủ 20 lần, `measure.mjs` in p95 8.45 phút, ngưỡng 10.14 phút; mẫu gồm một lần đỏ (G17). PO quyết có thêm AC hay không, và có tính lần đỏ vào mẫu không.

### Việc còn lại

1. Phiên điều phối: cập nhật #91 theo `main`, chờ CI xanh; PO merge.
2. Sau merge: kiểm G8 trên lần push `main` đầu tiên; đồng bộ `develop`, chạy lại T1, T2 (G7).
3. Luồng contracts: G21, G20.
4. Luồng infra tại mốc DEC-59: G15, G22; khi tiện: ghi lý do G10, G13, G17.
5. Dev: cập nhật `report.md` (G23) ở lần ghi sau.
6. PO: G9, G16.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
