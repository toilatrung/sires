# PID-00009 — Báo cáo QC độc lập

**Kết luận mới nhất:** Đã sửa G2–G4, chạy T1–T4/T6/T7 trên Actions; G1 chỉ còn phần hậu merge T5/cache main theo lựa chọn PO. T4 có một lần test outbox lỗi thứ tự rồi rerun đạt (Lần 3, 22/11/2026).

- **Ticket:** [PID-00009](../../../docs/tickets/issues/PID-00009/index.html)
- **PR:** https://github.com/toilatrung/sires/pull/57
- **Mã nguồn:** `infra/pid-00009-ci`, commit `aac981070e0f666d657b664b2b0aea33886f8db8`.
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

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
