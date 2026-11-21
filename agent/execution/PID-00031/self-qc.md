# PID-00031 — Self-QC của Dev

**Kết luận:** Đạt — PO chốt G3 = `memory_limit`; cold start container và pod đã đo (Lần 6, phiên PO giao)

**Kết quả mới nhất:** Lần 6 ở cuối file. Giữ các lần trước để truy vết.

- **Ticket:** [PID-00031](../../../docs/tickets/issues/PID-00031/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 21/11/2026

## 1. Lệnh

| Lệnh | Kết quả thật |
| --- | --- |
| `check-pid.mjs PID-00031` | Đủ để thực thi, 0 cảnh báo |
| `pnpm nx run @sires/sandbox-runner:test` | Đạt, 1 test; 4 task phụ thuộc đạt |
| `pnpm nx affected -t lint typecheck test build` | Không hoàn tất: chờ pytest sires-common hơn 50 phút; dừng đúng cây tiến trình. Không ghi đạt |
| `pnpm nx run-many -p @sires/sandbox-runner -t lint typecheck test build` | Đạt cả 4 target và 4 task phụ thuộc; log evidence/sandbox-runner-checks.txt |
| `docker build -t sires/spk-06:verified .` | Đạt, image ID ghi trong report/environment |
| `bash measure.sh --image sires/spk-06:verified --output /tmp/sires-spk06-verified-measure --repetitions 3` | Exit 0; 24/24 build thành công, artifact export đạt, cgroup peak đều đo được |
| `bash attack.sh --image sires/spk-06:verified --output /tmp/sires-spk06-verified-attacks` | Exit 0; 12/12 probe đạt |
| `python3 -m unittest -v test_spike.py` | 8/8 đạt; evidence/spike-checks.txt |
| `python3 -m py_compile spike.py worker.py test_spike.py` | Đạt |
| `bash -n measure.sh attack.sh setup-runsc.sh` | Đạt |
| `node scripts/docs/add-license.mjs --check` | Exit 1 do 9 file cache ignore sẵn có; không có file ticket trong danh sách thiếu |
| `node scripts/development/check-tracks.mjs` | repo; kiểm thêm tất cả file mới bằng --stdin --strict: repo, sandbox-runner; chỉ một luồng |
| `node scripts/docs/update-index.mjs --check` | Đạt; không ghi docs/taskboard |
| `git diff --check` | Đạt |
| pdftotext/pdfinfo và xem pdftoppm | 4 PDF có tiếng Việt, không thiếu glyph/package; bài báo 4 trang, luận văn 47 trang |
| UI preview/check-ui | Không áp dụng, không có UI |

Ban đầu node_modules được cài cho Linux nên pnpm Windows không gọi được nx.
Đã cài lại dependency theo frozen lockfile, không sửa lockfile; install báo
EACCES ở dependency library ngoài luồng, nhưng các lệnh Nx của sandbox-runner
sau đó đều chạy đạt. Không dùng lỗi môi trường ban đầu làm kết quả test cuối.

## 2. AC → test

| AC | Test và bằng chứng | Kết quả |
| --- | --- | --- |
| PID-00031-AC01 | attack.sh: shell và passwd × hai engine; attacks.json; unit test không cho runtime/compile lỗi bất kỳ thành pass | Đạt trên runsc KVM thực |
| PID-00031-AC02 | attack.sh: loop × hai engine, memory × hai engine, memory-probe; mapping trong spike.py:38 | Đạt; timeout 120,0029/120,0012 s, allocator OOM đúng 2 GiB; capacity TeX ghi riêng |
| PID-00031-AC03 | measure.sh: 24 build, 8 nhóm đo; measurements.json và summary.json | Đạt trên host WSL2, không phải benchmark production |
| PID-00031-AC04 | report.md: kết luận ASM-07 có giới hạn và package đề xuất, nguồn mẫu ở README spike | Đạt ở mức spike |
| NFR-SANDBOX-001-AC01 | attack.sh: file/shell/network/timeout/memory; isolation_verified=true khi worker trả kết quả | Đạt phần spike; kiểm chính thức ở PID-00128 |

## 3. Edge case

| # | Trạng thái | Cách xử lý / bằng chứng |
| --- | --- | --- |
| EC01 | Đã giải quyết trên host hiện tại | Systrap lỗi seccomp notify; KVM chạy được hello-world và toàn suite. Có hướng dẫn Ubuntu Actions nhưng chưa chạy Actions |
| EC02 | Đã kiểm trên fixture | Không thiếu package trong 24 build; image cố định, không tải động. Lỗi compile giữ log để đề xuất package, không giả kết quả đạt |
| EC03 | Đã kiểm trên fixture | XeLaTeX DejaVu Serif, pdfLaTeX T5; pdftotext/pdfinfo và xem trang render xác nhận tiếng Việt; vietnamese-checks.json |
| Phát hiện khi làm | Đã xử lý | gVisor không chấp nhận /tmp symlink khi dựng submount: dùng directory và mount read-only, TMPDIR trong workspace |
| Phát hiện khi làm | Đã xử lý | docker cp không thấy guest tmpfs: xuất bằng docker exec tar, kiểm return code/hash; export lỗi làm test thất bại |
| Phát hiện khi làm | Đã xử lý | Docker local log compression không dùng max-file=1: tắt compression rõ ràng |
| Phát hiện khi làm | Cần lưu ý | TeX capacity nhỏ hơn cgroup 2 GiB; probe allocator tách riêng, không gộp số đo hai lớp |

## 4. Tự kiểm

- [x] S01–S03 đã chạy kiểm thực; gate toàn repo chưa hoàn tất được ghi rõ.
- [x] Không import mã/đọc database luồng khác; không thêm hợp đồng, API, schema, migration hay model call.
- [x] Không sửa docs, taskboard, file sinh hoặc mã luồng khác; dependency/build output chỉ ở thư mục ignore.
- [x] Không có UI, APR, outbox, workflow state hay dữ liệu project cần áp dụng trong spike này.
- [x] Không có yêu cầu ngoài hồ sơ; chỉ triển khai fixture/probe và báo cáo trong đường dẫn được giao.
- [x] Không có TODO hay mã debug thừa. stdout của harness là kết quả phép đo có chủ đích.
- [x] Cấu hình runc và runsc giống nhau trừ runtime; image ID cố định trong suite.
- [x] Không tự thay runsc bằng runc khi lỗi; runtime lỗi không làm probe pass.
- [x] Probe timeout hủy toàn sandbox; không còn container sires-spk06 sau suite.
- [x] Đã tự đối chiếu spec-converge-skill ở mục 5; không tạo qc-report.md của QC độc lập.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đối chiếu code hiện tại với P1–P4, O1–O2, B1–B6, AC và EC của hồ sơ.
Đã đọc implementation, kiểm số đo/artifact thật và lệnh ở mục 1; không lấy
report làm bằng chứng thay code. Không có khoảng trống CRITICAL/HIGH trong
phần code/AC đã giao. Gate toàn repo vẫn là việc còn lại, vì vậy trạng thái
report là Bị chặn, không phải Xong — chờ QC.

| G | Loại | Mức | Mô tả | Bằng chứng | Xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | MEDIUM | Gate affected toàn repo chưa hoàn tất do sires-common pytest treo | Lệnh affected thực chạy, cây tiến trình pytest chờ hơn 50 phút; report mục 4 | Đề xuất chủ luồng platform kiểm tra; cần chạy lại gate trước khi kết thúc ticket |
| G2 | partial | LOW | License check toàn repo báo 9 file cache ignore thiếu notice | Output add-license --check, không có đường dẫn của ticket | Không sửa cache/luồng ngoài ticket; file ticket có SPDX |

ASM-07 chỉ kết luận cho fixture tổng hợp article/report đã thử. Chưa có
template sản phẩm trong scaffold; nguồn LaTeX2e mở và giới hạn đại diện
được ghi rõ ở README. Chưa đo pool/queued-start, chưa chạy systrap Actions,
chưa thay thế kiểm bảo mật chính thức của PID-00128.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).

## Lần 2 — 19/11/2026

### 1. Lệnh chạy lại và kết quả

| Lệnh | Kết quả thật |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build --outputStyle=stream` với môi trường cũ, pytest verbose + faulthandler 60 s | Tiếp tục chờ tại test_minio_fixture; stack ở Docker SDK get_docker_socket; dừng để thử cấu hình mới. Log affected-retry.txt |
| `uv run python -m pytest tests/test_fake_gateway.py::test_minio_fixture` với Docker IPv4/socket override | Exit 0, 1 passed trong 4,58 s; log minio-retry.txt |
| `pnpm nx affected -t lint typecheck test build --outputStyle=stream` với cấu hình ở report Lần 2 | Exit 0; 19 project và 2 task phụ thuộc đạt, 70/71 task dùng cache; sires-common 79 passed trong 43,75 s; log affected-configured-retry.txt |
| Ranh giới trên mọi file đổi và file mới, --stdin --strict | Đạt, repo + sandbox-runner, một luồng mã |
| `node scripts/docs/update-index.mjs --check` | Exit 0; index-retry.txt |
| `node scripts/docs/add-license.mjs --check` | Vẫn exit 1 vì 9 file cache ignore ngoài ticket; không thiếu notice trong file PID-00031; license-retry.txt |

Các biến môi trường chỉ áp dụng cho tiến trình kiểm:
DOCKER_HOST=tcp://127.0.0.1:2375,
TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1,
TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock.
Giữ Ryuk và toàn bộ test; không bỏ qua test hoặc vô hiệu hóa cleanup.

### 2. Tự đối chiếu spec-converge-skill

Không sửa code/image/fixture trong lần này. Các AC PID-00031-AC01,
PID-00031-AC02, PID-00031-AC03, PID-00031-AC04 và
NFR-SANDBOX-001-AC01 giữ kết quả ở bảng lần đầu. EC01–EC03 giữ kết quả đã ghi.
Đối chiếu gate mới với yêu cầu kiểm hoàn thành của ticket:

| G | Kết quả lần 2 | Bằng chứng |
| --- | --- | --- |
| G1 | Đã giải quyết; gate affected exit 0 | affected-configured-retry.txt, 79 test sires-common đạt |
| G2 | Còn lưu ý ngoài ticket; không chặn Self-QC | license-retry.txt chỉ liệt kê cache ignore; skill yêu cầu tính file của ticket |

Không còn khoảng trống CRITICAL/HIGH hoặc việc còn lại trong phạm vi.
Không tạo/sửa qc-report.md; QC độc lập do PO thực hiện sau.

## Lần 3 — 19/11/2026

Chuẩn bị PR theo yêu cầu người dùng: chỉ cập nhật metadata hồ sơ và mã hóa
log PowerShell sang UTF-8, bỏ khoảng trắng cuối dòng; không đổi mã spike,
image, fixture hoặc JSON số đo. Kết quả kiểm ở Lần 2 giữ nguyên.

- `git diff origin/main...HEAD --check`: đạt sau chuẩn hóa log.
- `check-pid.mjs PID-00031 --result`: đạt, 0 cảnh báo trước khi mở PR.
- Ranh giới staged: `repo, sandbox-runner`, chỉ một luồng mã.
- [PR #39](https://github.com/toilatrung/sires/pull/39) vào `main`, chưa merge.
- Commit triển khai do GitHub ký, signature VALID. Chưa có QC độc lập.

## Lần 4 — 19/11/2026

Đã đọc QC độc lập Lần 1 ở commit 5f94b20; không sửa qc-report.md.
Kết luận Dev ở các lần trước đã đánh giá quá mức tính đại diện của fixture
và phạm vi đóng gói. Lần này sửa phần độc lập trước, tuân thủ PO yêu cầu
chưa chạy measure.sh/attack.sh trước hai quyết định.

### Lệnh / kiểm đã chạy

| Kiểm | Kết quả |
| --- | --- |
| ruff check --fix rồi ruff check apps/sandbox-runner/spikes/spk-06 | Ban đầu sửa 3 lỗi import, còn 3 E501; ngắt dòng rồi check sạch |
| python -m unittest -v test_spike.py | 9/9 đạt, có test ngăn PDF thiếu BibTeX/natbib bị tính đạt |
| pnpm nx affected -t lint typecheck test build --base=origin/main --head=HEAD --skip-nx-cache --outputStyle=stream | Exit 0; sandbox-runner và 4 task phụ thuộc đạt |
| pnpm --filter @sires/sandbox-runner deploy --legacy --prod thư_mục_tạm | Exit 0; dist/main.js có, spikes không có |
| Kiểm cấu trúc fixture | Default có 5 input sections, references.bib, natbib/plainnat; luận văn có class upstream MIT, 4 file chương, 3 PNG, license gốc |
| Compile preflight runsc KVM, hai fixture Default/luận văn × hai engine | 4/4 exit 0; có PDF, bbl, blg ghi This is BibTeX, log có natbib.sty. Đây là kiểm compile, không thu benchmark |
| add-license --check | File ticket đủ notice; 11 cache ignore ngoài ticket thiếu notice. Vendor MIT giữ license gốc, không đổi sang giấy phép SIRes |
| measure.sh, attack.sh | Chưa chạy theo chỉ dẫn PO; số đo hiện có thuộc mã/fixture trước QC |

### Tự đối chiếu spec-converge-skill

| G | Loại / mức theo QC | Kết quả lần này |
| --- | --- | --- |
| G1 | partial / HIGH | Fixture Default và kiểm compile đã sửa; còn phép đo 3 lượt trên runsc/runc, chưa tự đóng G1 |
| G2 | partial / MEDIUM | Thay bằng template CUED MIT có raster/BibTeX và nguồn cố định; còn đo đại diện mới |
| G3 | partial / MEDIUM | Chờ PO chốt mã lỗi, giữ classify để không tự quyết hành vi |
| G4 | partial / MEDIUM | Đã giải quyết bằng files=[dist] và deploy thực |
| G5 | contradicts / MEDIUM | Lịch sử unsigned giữ nguyên theo PO; đã cấu hình ký SSH repo và payload UTF-8 cho cập nhật mới. PO xử lý khi squash |
| G6 | unrequested / LOW | Bổ sung ghi chú hạn mức file cho PID-00054 |
| G7 | partial / LOW | Đã giải quyết; Ruff sạch |
| G8 | partial / LOW | Đã giải quyết; latest Lần 4 và bổ sung RSS 237,7 MiB |
| G9 | LOW | Không rewrite commit cũ; payload UTF-8/commit mới có chữ ký, PO đặt thông điệp khi squash |

AC01 và NFR-SANDBOX-001-AC01 chưa chạy lại, chỉ có bằng chứng phiên trước.
AC02 còn chờ G3. AC03/AC04 chưa nghiệm thu lại do thay fixture, dù preflight
đã xác nhận hai engine thực chạy BibTeX/natbib. EC01 dùng KVM như trước;
EC02/EC03 đã kiểm compile mới và sửa font/image lookup, còn đánh giá theo
đợt đo cuối. Không đặt Xong — chờ QC khi các việc trên còn mở.

## Lần 5 — 21/11/2026

Theo yêu cầu mới “kiểm tra và chạy lại”, đã pull nhánh PR và đồng bộ main
cd25a65 qua merge bd79e8e; không sửa code spike hoặc quyết định hành vi G3.
Giữ nguyên toàn bộ kết quả trước, ghi evidence/qc5 riêng. Không có thay đổi
ngoài luồng do Dev thực hiện; các thay đổi agent-core/contracts là merge từ main.

### Lệnh và kết quả thật

| Kiểm | Kết quả |
| --- | --- |
| git pull --ff-only nhánh PR; đồng bộ main qua GitHub update-branch | Thành công; main là ancestor HEAD, merge commit verified |
| docker build -t sires/spk-06:qc5 | Exit 0; image f535ce7c9dae…; worker mới nằm trong image |
| uv run ruff check apps/sandbox-runner/spikes/spk-06 | Exit 0 |
| python3 -m unittest -v test_spike.py | 9/9 đạt |
| bash -n measure.sh attack.sh setup-runsc.sh | Exit 0 |
| pnpm nx affected -t lint typecheck test build --base=origin/main --head=HEAD --skip-nx-cache --outputStyle=stream | Exit 0; sandbox-runner và 4 task phụ thuộc đạt |
| attack.sh, sau đó tiếp tục các ca thiếu vì server gián đoạn | 8 ca giữ nguyên + 4 ca tiếp tục cùng run_case/image/source = 12 ca hoàn tất; attack-resume.json ghi rõ. Không coi exit 129 của lượt bị cắt là pass |
| measure.sh --image sires/spk-06:qc5 --output /tmp/sires-spk06-qc5-measure --repetitions 3 | Exit 0; 36/36 đạt; 18 runsc, 18 runc, 3 fixture × 2 engine × 3 lượt |
| Đối chiếu hash source/fixture/PDF/bbl/blg | Tất cả khớp; metadata gồm mọi file fixture |
| pdfinfo, pdftotext, kiểm main.log cuối | 6 PDF có 2/2/4/4/19/19 trang; Default tiếng Anh, article/thesis có tiếng Việt; không thiếu glyph, package, citation/reference |
| pdfimages -list luận văn hai engine | Ảnh raster 960×560 nhúng thật; 3 ảnh khác nhau, convergence được dùng hai lần |
| update-index --check; check-tracks --base origin/main --strict | Đạt; chỉ repo và sandbox-runner |
| add-license --check | Chỉ 11 file cache ignore ngoài ticket thiếu notice; file ticket đủ giấy phép |

### AC và tự đối chiếu spec-converge-skill

| AC / G | Kết quả Lần 5 |
| --- | --- |
| PID-00031-AC01 | Đạt các probe shell/passwd cho cả hai engine, source hash khớp evidence mới |
| PID-00031-AC02 / G3 | Một phần: timeout đúng 120 s, cgroup allocator OOM đúng 2 GiB; mã cho TeX capacity vẫn chờ PO, chưa coi là đạt toàn bộ |
| PID-00031-AC03 / G1 / G2 | Đã có phép đo đủ 36 lượt, gồm Default đúng cấu trúc và template luận văn mở CUED MIT, runsc/runc 3 lần; không còn thiếu bằng chứng ở G1/G2 |
| PID-00031-AC04 / G8 | Báo cáo Lần 5 có số đo mới, ASM-07 có giới hạn, cả RSS/cgroup peak, package đã dùng thật, latest trỏ đúng |
| NFR-SANDBOX-001-AC01 | Đạt mức spike; không thay nghiệm thu PID-00128 |
| G4 / G7 | Giữ kết quả đã sửa và kiểm Lần 4; gate mới/Ruff vẫn đạt, package files=[dist] không đổi |
| G5 / G9 | Không rewrite lịch sử. Merge/update mới dùng chữ ký verified, UTF-8; PO xử lý các commit cũ khi squash |
| Đề xuất 2 | Chỉ báo ước lượng outside-worker min/median/max từ dữ liệu hiện có; chưa tuyên bố cold start pod/Queued → Running đã nghiệm thu |

EC01 vẫn dùng runsc KVM trên WSL2; chưa có dữ liệu systrap production.
EC02/EC03: 36 build không thiếu package/font, 24 build Default/luận văn xác nhận
BibTeX/natbib. Raw metrics và sáu PDF được lưu riêng với hash khớp.
Không còn HIGH về fixture/đo mẫu theo tự đối chiếu của Dev; G3 MEDIUM và quyết
định cold start vẫn chưa chốt. Chưa chuyển Xong — chờ QC và không sửa báo cáo QC độc lập.

## Lần 6 — 21/11/2026

Người chạy là phiên Claude Code mà PO giao đo cold start (YC1 ở `report.md` mục 5),
không phải Dev. Phiên này làm trên máy của PO, trong worktree riêng, từ nhánh PR
tại `ff16f5e`. Chỉ thêm mã đo trong `apps/sandbox-runner/spikes/spk-06/` và
evidence trong `evidence/cold-start/`. Không sửa `spike.py`, `worker.py`,
`Dockerfile`, fixture, `docs/` hay `qc-report.md`.

### Lệnh và kết quả thật

| Kiểm | Kết quả |
| --- | --- |
| `python -m unittest test_cold_start test_spike` (Windows 3.12.16; WSL 3.12.3) | 16/16 đạt ở cả hai (7 test mới cho harness cold start, gồm test phát hiện đồng hồ nhảy; 9 test cũ) |
| `ruff check apps/sandbox-runner/spikes/spk-06` (ruff 0.17.4, không cache) | Exit 0 |
| `bash -n cold-start.sh measure.sh attack.sh setup-runsc.sh` | Exit 0 |
| `cold-start.sh container --repetitions 20 --warmup 1 --runtimes runc,runsc,runsc-systrap` | Exit 0; 60/60 lượt đạt; 5 lượt runc bỏ do đồng hồ, đã đo lại |
| `cold-start.sh kind-up`, `cold-start.sh pod --repetitions 20 --warmup 1` | Exit 0; 40/40 lượt đạt; 11 lượt bỏ do đồng hồ, đã đo lại |
| Đối chiếu `source_sha256`, `fixture_sha256` trong evidence với `git show HEAD:<file>` | 7/7 file nguồn và 8/8 fixture Default khớp, ở cả container và pod |
| `packages.tsv` của image đo so với `evidence/qc5/packages.tsv` | 202/202 dòng trùng |
| Mẫu tải trong lượt dùng (`load.txt`) | Không có container lạ; load1 tối đa 1,63 (container), 2,06 (pod) |
| `pnpm nx run-many -t lint typecheck test build -p @sires/sandbox-runner --skip-nx-cache` | Exit 0; sandbox-runner và 4 task phụ thuộc đạt. Nx cảnh báo `@sires/contracts:generate-ts` flaky; đây là cảnh báo, không phải lỗi, và thuộc luồng khác |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu thông báo |
| `node scripts/docs/update-index.mjs --check` | Khớp 159 PID, 159 task |
| `node scripts/development/check-tracks.mjs --base origin/main` | `repo, sandbox-runner` |

### AC và việc còn chờ

| AC / G | Kết quả Lần 6 |
| --- | --- |
| PID-00031-AC02 / G3 | Đạt: PO chốt TeX capacity giữ `memory_limit` (có `limit_reason=tex_capacity`); harness đã đúng nên không sửa `classify`; 12/12 probe Lần 5 giữ nguyên |
| PID-00031-AC01, PID-00031-AC03, PID-00031-AC04, NFR-SANDBOX-001-AC01 | Giữ kết quả Lần 5; Lần 6 không đổi mã đo hay fixture của các AC này |
| Đề xuất 2 (cold start, kiến trúc 9.5) | Đã đo: container runsc tạo → worker ready p95 0,34 s; pod gVisor tạo → Ready p95 2,17 s; chênh với runc nhỏ. Không thay nghiệm thu Queued → Running (PID-00080) |
| EC01 | systrap chạy được trên kernel WSL2 6.18 (khác 6.6 của Dev); đã đo ở mức container. Chưa phải platform production |

Không còn khoảng trống trong phạm vi ticket. G5/G9 để PO xử lý khi squash.
Đặt `Xong — chờ QC` cho QC độc lập Lần 2.
