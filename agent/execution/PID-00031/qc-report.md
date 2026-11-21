# PID-00031 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH. G1–G4, G6–G8 của Lần 1 đã xử lý (G3 theo quyết định PO); G5, G9 còn mở, PO xử lý khi squash. Lần này có thêm 1 MEDIUM (G10: XeLaTeX thiếu kiểu nghiêng DejaVu Serif, danh sách package chưa phản ánh) và 4 LOW (G11–G14). QC đã tự chạy `attack.sh` (12/12) và `measure.sh` một lượt (12/12) dưới runsc KVM. Trước khi merge: cập nhật nhánh theo `main` (PR đang BEHIND) để CI chạy lại; nên sửa G10 trong report trước khi PID-00054 dùng danh sách package (Lần 2, 21/11/2026)

- **Ticket:** [PID-00031](../../../docs/tickets/issues/PID-00031/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 19/11/2026 · spec-converge-skill

Người chạy: agent QC do PO giao, không mang kết luận của Dev. Mã nguồn: PR #39, nhánh `sandbox-runner/pid-00031-gvisor`, commit `dc81960`.

Phạm vi đã đọc: toàn bộ `apps/sandbox-runner/spikes/spk-06/` (`Dockerfile`, `.dockerignore`, `setup-runsc.sh`, `measure.sh`, `attack.sh`, `spike.py`, `worker.py`, `test_spike.py`, `README.md`, 8 fixture), `apps/sandbox-runner/package.json`, `tsconfig*.json`, `infra/docker/node/Dockerfile`, thư mục `agent/execution/PID-00031/evidence/` (JSON số đo, tấn công, môi trường, PDF, log). Đối chiếu với `index.html`, `specs/acceptance.html`, `specs/scope.html` (P1–P4, N1–N3, EC01–EC03), `specs/index.html` mục 3–7, slice S01–S03, `designs/notes.html`, PRD MS-TEMPLATE-001, OQ-055, OQ-056, ASM-07, NFR-SANDBOX-001, kiến trúc 9.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-00031-AC03, PID-00031-AC04 · spec mục 4.4 “Đo template Default và luận văn mẫu (ASM-07)” (`specs/index.html:84`) · PRD MS-TEMPLATE-001, OQ-056 · kiến trúc 9.3 | partial | HIGH | `fixtures/article/main.tex:5-6,29-31`: một file, tiếng Việt, `thebibliography` viết tay. Không có `sections/*.tex` nạp bằng `\input`, không có `bibliography/references.bib`, không natbib, không `plainnat` như MS-TEMPLATE-001 quy định (`docs/overview/sections/12-latex-manuscript-workspace.html:78-90`, OQ-056 ở dòng 299). `fixtures/thesis/main.tex:47-49` cũng viết tay. Không build nào chạy BibTeX, trong khi kiến trúc 9.3 (`09-sandbox-latex-and-diagrams.html:62`) coi BibTeX + natbib là một phần lệnh build. Dù vậy, `README.md:86` và `fixtures/article/main.tex:8` vẫn gọi fixture là “Mẫu Default”. Kết luận ASM-07 (`report.md:97-100`) và danh sách package “(gồm natbib)” (`report.md:109-110`) vì thế không dựa trên template Default; natbib chưa được nạp lần nào | Thêm fixture theo cấu trúc MS-TEMPLATE-001: class `article`, tiếng Anh, `main.tex` cùng `sections/*.tex` nạp qua `\input`, `bibliography/references.bib`, natbib + `plainnat`, có `\cite`. Chạy lại `measure.sh` trên cả runsc và runc, 3 lượt. Cập nhật bảng AC03, kết luận ASM-07 và danh sách package; bỏ tên “Mẫu Default” khỏi fixture hiện có. Nếu thấy chưa đủ căn cứ để dựng template Default thì hỏi PO trước khi thay (spec mục 7) |
| G2 | PID-00031-AC03 · S02 “Lấy bài báo và luận văn mẫu từ template mở, ghi nguồn” · ASM-07 “bản thảo cỡ … luận văn” | partial | MEDIUM | `fixtures/thesis/main.tex:5,19-46`: nội dung tổng hợp, lặp bằng `\loop` trên class `report` của LaTeX2e (nguồn ở `README.md:88`); đây không phải template luận văn mở. Bản luận văn chỉ 47 trang, một file, hình chỉ có TikZ, không có ảnh raster, không BibTeX. `README.md:91` tự ghi là “không phải template luận văn của trường” | Dùng một template luận văn mở có ghi nguồn và giấy phép (nhiều file chương, ảnh raster, BibTeX), đo cùng đợt với G1. Hoặc PO chấp nhận fixture tổng hợp; khi đó report phải ghi rõ giới hạn đại diện |
| G3 | PID-00031-AC02 · NFR-SANDBOX-001 · kiến trúc 9.2 (`09-sandbox-latex-and-diagrams.html:57`: vượt giới hạn → `timeout` hoặc `memory_limit`) | partial | MEDIUM | `spike.py:45-46` gán `memory_limit` cho mọi log có chuỗi “TeX capacity exceeded” (`worker.py:63`), kể cả lỗi không phải bộ nhớ như input stack size hay grouping levels. Hai probe `memory` (`fixtures/memory/main.tex:5`) dừng ở giới hạn nội bộ của TeX (`main memory size=5000000`) khi cgroup peak mới 86,0 MiB (pdfLaTeX) và 233,1 MiB (XeLaTeX) (`evidence/attacks.json`), vậy mà vẫn được tính đạt. Hard limit 2 GiB chỉ được chứng minh bằng allocator Python (`worker.py:37-42`, `OOMKilled=true`), không phải bằng một build LaTeX. Dev đã ghi rõ giới hạn này (`report.md:90-92`) | Chờ PO quyết (Đề xuất 1). Nếu `memory_limit` chỉ dành cho vượt hạn mức sandbox: trong `classify`, tách `tex_capacity` thành mã riêng hoặc tính là lỗi biên dịch, rồi cập nhật bảng tấn công. Nếu PO chấp nhận ánh xạ hiện tại: ghi quyết định vào report |
| G4 | O1 “Mã phục vụ phép đo, không vào build sản phẩm” | partial | MEDIUM | `apps/sandbox-runner/tsconfig.json` chỉ include `src` nên `dist` sạch. Nhưng `apps/sandbox-runner/package.json` không có trường `files`, mà image sản phẩm lại đóng gói bằng `pnpm --filter @sires/${SERVICE} deploy --legacy --prod /out` rồi chép `/out` vào image (`infra/docker/node/Dockerfile:13,18`). QC chạy đúng lệnh deploy đó cho `@sires/sandbox-runner`: thư mục đầu ra có `spikes/spk-06/` (`Dockerfile`, `setup-runsc.sh`, `spike.py`, `worker.py`, fixture tấn công) | Trong luồng sandbox-runner: thêm `"files": ["dist"]` (hoặc `.npmignore` loại `spikes/`) vào `apps/sandbox-runner/package.json`, chạy lại lệnh deploy để xác nhận. Hoặc PO chấp nhận, vì các file này không được thực thi |
| G5 | Quy tắc Git (`AGENT.md`: commit phải có chữ ký; ruleset `protect-main-develop` › `required_signatures`) | contradicts | MEDIUM | Theo GitHub API, ba commit `report.md` là `f9673fa`, `dd89668`, `3ce87dc` có `verification.verified=false, reason=unsigned`; ba commit sau ký hợp lệ. PR #39 đang `mergeStateStatus=BLOCKED`. `self-qc.md:138` chỉ nêu các commit đã ký | Không viết lại lịch sử đã push khi PO chưa cho phép. PO merge bằng squash (GitHub ký commit squash) hoặc bypass. Dev cài khóa ký trước khi commit report ở các lần sau |
| G6 | Spec mục 4.4 (giới hạn 120 s, 2 GB, đĩa 500 MB) | unrequested | LOW | `spike.py:105-106` thêm `--shm-size=1m`, `--ulimit=nofile=256:256` và `--ulimit=fsize=16777216` (file tối đa 16 MiB) cho cả runc lẫn runsc. Có lý do, đã ghi ở `report.md:42-43` | Không cần sửa trong spike. Ghi chú cho PID-00054: không chép nguyên giới hạn 16 MiB, vì PDF luận văn có ảnh có thể vượt mức này |
| G7 | Chất lượng mã (cấu hình `ruff` ở `pyproject.toml`) | partial | LOW | `ruff check apps/sandbox-runner/spikes/spk-06` (ruff 0.17.4) báo 6 lỗi: `spike.py:10` F401 (`os` không dùng); `spike.py:6`, `worker.py:6` I001; `spike.py:209,214,270` E501. Spike không thuộc project Nx nào nên CI không lint phần này. `self-qc.md:65` ghi “Không có TODO hay mã debug thừa” | Chạy `ruff check --fix`, rồi ngắt ba dòng dài |
| G8 | O2 (report đủ và đúng) | partial | LOW | `report.md:5` ghi “Kết quả mới nhất: xem Lần 2” dù đã có Lần 3. `report.md:98` ghi bộ nhớ tối đa 218,8 MiB (cgroup peak), trong khi RSS do GNU time đo cho runsc lên tới 237,7 MiB (`evidence/measurements.json`) | Sửa dòng đầu để trỏ tới lần mới nhất; ghi cả hai số trong kết luận ASM-07 |
| G9 | Quy trình Git | — | LOW | Thông điệp commit `14de994`, `51fb2ec`, `dc81960` có ký tự `?` thay cho chữ có dấu (`tri?n khai`, `chu?n h?a`, `li?n k?t`); QC kiểm bằng `git cat-file`, đây là byte thật trong commit | PO viết lại thông điệp khi squash merge. Dev đặt UTF-8 cho shell dùng để commit |

Đã kiểm, không thấy khoảng trống:

- P1: base cố định theo digest, Debian snapshot `20261119T000000Z`, TeX Live 2022 (`texlive-base 2022.20230122-3`), latexmk 4.79. Mọi job chạy `--network=none`, `--read-only`, UID/GID 65532, `--cap-drop=ALL`, `no-new-privileges`, 2 GiB, tắt swap, workspace tmpfs 500 MB (`spike.py:100-113`). `container_config` và `isolation_verified=true` có trong mọi hàng evidence trả kết quả.
- Lệnh latexmk đúng spec 4.4: `-pdf`/`-xelatex -interaction=nonstopmode -halt-on-error -file-line-error -no-shell-escape`, thêm `-norc` (`worker.py:47-52`). `openin_any=p`, `openout_any=p`, `shell_escape=f` đặt qua biến môi trường (`Dockerfile:22-24`).
- Hết 120 s, host xóa cưỡng bức cả container (`spike.py:149-151,211`), đúng kiến trúc 9.2.
- Bằng chứng khớp mã: sha256 của 5 file nguồn và 8 fixture ở commit `dc81960` trùng `source_sha256`/`fixture_sha256` trong `measurements-environment.json` và `attacks-environment.json`. Bốn PDF trong `evidence/` trùng `artifact_sha256` của các hàng runsc.
- Ranh giới: PR chỉ chạm `apps/sandbox-runner/spikes/spk-06/` và `agent/execution/PID-00031/`. Không sửa `docs/`, luồng khác, file sinh hay migration. Không có khóa, token hay mật khẩu trong evidence.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00031-AC01 | đạt (theo bằng chứng của Dev, QC chưa chạy lại) | thao tác tay của Dev trên runsc KVM, WSL2 | `attack.sh › shell, passwd` × pdfLaTeX, XeLaTeX | `evidence/attacks.json`: 4/4 đạt. Không có marker `SHELL_EXECUTED`. Log có `pdflatex: Not reading from /etc/passwd (openin_any = p).`, exit 12. QC: hash nguồn khớp, unit test 8/8 |
| PID-00031-AC02 | một phần (G3) | như trên | `attack.sh › loop, memory, memory-probe` | loop: `timeout` ở 120,0029 s và 120,0012 s. memory: TeX capacity được gán `memory_limit` khi chưa chạm cgroup. memory-probe (Python): `OOMKilled=true`, peak 2.147.483.648 B |
| PID-00031-AC03 | một phần (G1, G2) | như trên | `measure.sh` (24 build) | 24/24 `success`, `pdf_created`, export đạt. QC tính lại trung vị, min, max từ `measurements.json`, khớp `report.md:61-70`. PDF có 4/4/47/47 trang, font VNR (T5) và DejaVu Serif |
| PID-00031-AC04 | một phần (G1, G8) | đọc báo cáo | `report.md` mục 3 | Có kết luận ASM-07, ADR-11, NFR-PERF-007, NFR-SANDBOX-001 và danh sách package. BibTeX, natbib chưa được dùng trong phép đo nào |
| NFR-SANDBOX-001-AC01 | đạt ở mức spike | như AC01 | `attack.sh › passwd` | Như AC01. Kiểm chính thức ở PID-00128 |

Edge case:

- EC01: runsc chạy bằng platform KVM trên WSL2, spec 2.5 cho phép. systrap lỗi seccomp notify; chưa chạy trên GitHub Actions. Hợp spec, xem Đề xuất 3.
- EC02: 24 build không thiếu package. `MKTEXPK/MKTEXTFM/MKTEXFMT=0`, không mạng. Đạt với fixture hiện có; template Default chưa kiểm (G1).
- EC03: XeLaTeX dùng DejaVu Serif, đề xuất `fonts-dejavu-core`; đạt.

### Lệnh đã chạy

Chạy trong worktree tách riêng ở commit `dc81960` (Windows 11; Python chạy bằng interpreter gốc của uv; Docker trong WSL Ubuntu-24.04).

| Lệnh | Kết quả |
| --- | --- |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00031 --result` | exit 0: “KẾT QUẢ ĐỦ (0 cảnh báo)”, trạng thái Xong — chờ QC |
| `node scripts/development/check-tracks.mjs --base origin/main` | exit 0: `tracks touched: repo, sandbox-runner` |
| `node scripts/docs/add-license.mjs --check` | exit 0: “0 file chưa có thông báo giấy phép.” Chạy trên worktree sạch, trước khi cài phụ thuộc |
| `node scripts/docs/update-index.mjs --check` | exit 0: khớp 159 PID, 159 task |
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm nx run @sires/sandbox-runner:test --skip-nx-cache` | Đạt: 1 file, 1 test (`src/app.module.spec.ts`), 4 task phụ thuộc đạt. Test này không phủ mã spike |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --head=HEAD --skip-nx-cache` | Đạt: chỉ `@sires/sandbox-runner` và 4 task phụ thuộc |
| `python -m unittest -v test_spike.py` (Windows, Python 3.12.16) và `python3 -B -m unittest test_spike` (WSL, Python 3.12.3) | 8/8 OK ở cả hai |
| `bash -n measure.sh attack.sh setup-runsc.sh`, `python3 -m py_compile spike.py worker.py test_spike.py` (WSL) | Đạt |
| `ruff check apps/sandbox-runner/spikes/spk-06` (ruff 0.17.4, cấu hình gốc) | exit 1, 6 lỗi (G7) |
| `git diff origin/main...HEAD --check` | exit 0 |
| `git diff --name-only origin/main...HEAD` | Chỉ có `apps/sandbox-runner/spikes/spk-06/` và `agent/execution/PID-00031/` |
| `git show HEAD:<file> \| sha256sum` cho 13 file nguồn và fixture; `sha256sum evidence/*.pdf` | 13/13 khớp `*-environment.json`; 4/4 PDF khớp `artifact_sha256` của các hàng runsc |
| Tính lại bảng số đo từ `evidence/measurements.json`; đếm trang và font của 4 PDF bằng script riêng | Khớp `report.md:61-70`; 4, 4, 47, 47 trang |
| `pnpm --filter @sires/sandbox-runner deploy --legacy --prod <thư mục tạm>` | Đầu ra có `spikes/spk-06/` (G4); thư mục tạm đã xóa |
| `gh pr view 39`, `gh api repos/toilatrung/sires/commits/<sha>` | PR mở, `BLOCKED`; check `tracks`, `build` SUCCESS; 3 commit chưa ký (G5) |
| `gh run view 44476488566 --log` (CI trên merge ref `9b67121`) | `tracks`: repo, sandbox-runner. License: 0 file thiếu. update-index khớp. `nx affected` chỉ chạy `@sires/sandbox-runner` (lint, typecheck, test, build), đạt. CI không chạy `test_spike.py`, không lint Python của spike, không chạy gVisor |
| `curl -I` tới bản phát hành gVisor `20261116.0/x86_64` | `gvisor.tar.bz2` và `.sha512` trả 200; `runsc` riêng trả 404, nên `setup-runsc.sh` tải đúng định dạng phát hành |
| `bash measure.sh …`, `bash attack.sh …` | không chạy: máy QC chỉ có runtime `runc` (`docker info`), không có runsc. Cài runsc cần root và phải sửa cấu hình Docker daemon, ngoài quyền QC. CI cũng không chạy hai suite này |
| `docker build` image spike | không chạy: thiếu runsc nên dù dựng được image cũng không chạy được suite; ngoài ra phải tải TeX Live từ snapshot.debian.org |

### Lệch với Self-QC

- `self-qc.md:125` (Lần 2) ghi “Không còn khoảng trống CRITICAL/HIGH”. QC thấy G1 (HIGH): phép đo không có template Default theo MS-TEMPLATE-001, chưa lần nào chạy BibTeX/natbib, trong khi fixture vẫn được gọi là “Mẫu Default”.
- `self-qc.md:41` ghi AC02 “Đạt”. QC đánh giá một phần (G3): bom bộ nhớ TeX dừng ở capacity nội bộ nhưng vẫn được gán `memory_limit`; mốc 2 GiB chỉ được chứng minh bằng allocator Python.
- `self-qc.md:42-43` ghi AC03, AC04 “Đạt”. QC đánh giá một phần (G1, G2).
- `report.md`, PR #39 ghi spike “không gắn vào build service”. QC thấy lệnh đóng gói image sản phẩm vẫn chép `spikes/spk-06/` (G4).
- `self-qc.md:138` ghi “Commit triển khai do GitHub ký, signature VALID”, nhưng 3 commit report chưa ký (G5).
- `self-qc.md:65` ghi không có mã thừa; ruff báo import `os` không dùng (G7).
- Dev ghi `add-license --check` exit 1 do 9 file cache. Trên worktree sạch và trên CI, lệnh này exit 0; lỗi chỉ do môi trường máy Dev, không đổi kết luận.

### Việc còn lại, theo thứ tự phụ thuộc

1. PO quyết Đề xuất 1 (mã lỗi cho TeX capacity) và Đề xuất 2 (cold start) trước khi Dev chạy đo lại, để làm một lần (G3).
2. Thêm fixture template Default theo MS-TEMPLATE-001 (BibTeX, natbib, `plainnat`, nhiều file), bỏ nhãn “Mẫu Default” khỏi fixture hiện có (G1, PID-00031-AC03, PID-00031-AC04).
3. Thay hoặc bổ sung luận văn mẫu bằng template mở có ảnh raster và BibTeX, ghi nguồn và giấy phép; hoặc ghi lại việc PO chấp nhận fixture tổng hợp (G2, PID-00031-AC03).
4. Sửa `classify` theo quyết định ở bước 1 (G3, PID-00031-AC02).
5. Chạy lại `measure.sh` và `attack.sh` trên runsc, cập nhật evidence, bảng AC03, kết luận ASM-07 và danh sách package (xác nhận natbib, BibTeX) (G1, G2, G3, PID-00031-AC04).
6. Loại `spikes/` khỏi gói deploy của `@sires/sandbox-runner` và xác nhận bằng lệnh deploy (G4, O1).
7. `ruff check --fix` và ngắt dòng dài (G7).
8. Sửa dòng “Kết quả mới nhất” trong report, ghi cả RSS 237,7 MiB (G8, O2).
9. Dev ghi “Lần 4” trong `report.md`, `self-qc.md`; QC chạy Lần 2. Khi merge, PO dùng squash với thông điệp tiếng Việt đúng dấu, hoặc bypass (G5, G9).

### Đề xuất cho PO

1. **Mã lỗi khi TeX hết capacity (G3).** Spec và kiến trúc 9.2 chỉ nói “vượt giới hạn → `timeout` hoặc `memory_limit`”, chưa nói lỗi “TeX capacity exceeded” (giới hạn nội bộ của engine, thấp hơn nhiều so với 2 GB) thuộc mã nào. PO cần chốt trước PID-00054 (bộ phân tích log, kiến trúc 9.3) và PID-00128: dùng `memory_limit` hay một mã lỗi biên dịch riêng. Đến lúc đó, ghi thành OQ.
2. **Cold start gVisor.** Kiến trúc 9.5 (`09-sandbox-latex-and-diagrams.html:79`) viết “Cold start của pod gVisor phải đo ở SPK-06”, nhưng ticket chỉ loại trừ Queued → Running (N3) và không nhắc cold start. Dữ liệu đã có sẵn: thời gian từ `docker start` tới lúc worker xong, trừ thời gian worker, là 0,41–0,60 s ở 22/24 lượt; 2 lượt runsc mất 1,30 s và 3,45 s (`measurements.json`, hàng 7 và 8). Báo cáo chưa nêu số này. PO quyết: bổ sung vào report của PID này, hay giao PID-00080/PID-00112 và sửa ticket cho khớp kiến trúc.
3. **Platform gVisor đại diện.** Mọi số đo dùng platform KVM trên WSL2, vì systrap lỗi trên kernel 6.6 của WSL2. Platform runsc cho production chưa chốt. H1 cho phép chạy trên GitHub Actions ubuntu (systrap), nhưng phải có workflow, việc của luồng infra (README spike dòng 25). PO quyết có cần một lượt systrap trước khi đóng ASM-07 và cập nhật kiến trúc 12.2 SPK-06 hay không.
4. **Seccomp trong sandbox.** Môi trường đo ghi `dev.gvisor.flag.oci-seccomp=false` (mặc định của runsc): profile seccomp OCI của Docker không áp lên ứng dụng bên trong gVisor. Kiến trúc 9.2 (`09-…html:55`) lại ghi “seccomp mặc định”. PID-00054 và PID-00112 cần chốt: dựa vào bộ lọc syscall của gVisor, hay bật `--oci-seccomp`.
5. **Bổ sung kịch bản cho PID-00128** (spike này chỉ thử `\write18` và `\input{/etc/passwd}`): `\pdffiledump`, `\pdfobj file`, `\includegraphics` hoặc `\XeTeXpicfile` với đường dẫn tuyệt đối, `\input|"lệnh"`, đường dẫn `..`, bom đĩa 500 MB, BibTeX làm phình bộ nhớ.
6. **Cho PID-00054.** Workspace tmpfs được tính vào hạn mức 2 GB RAM (`report.md:52-54`), nên dùng tmpfs thì quota đĩa 500 MB sẽ ăn vào RAM. PDF không giống nhau từng byte giữa các lượt (hash khác nhau mỗi lượt); nếu cần kết quả tái lập thì đặt `SOURCE_DATE_EPOCH` và `FORCE_SOURCE_DATE`. Không chép nguyên giới hạn file 16 MiB (G6).
7. **Mẫu spec cho spike.** Spec mục 6 chỉ có `pnpm nx run @sires/sandbox-runner:test`, mà lệnh này không phủ mã spike; CI cũng không chạy `test_spike.py` hay lint Python của spike. Các ticket spike sau nên ghi lệnh kiểm riêng trong spec mục 6 (ví dụ `python3 -m unittest`, `ruff check`).

## Lần 2 — 21/11/2026 · spec-converge-skill

Người chạy: agent QC do PO giao, không mang kết luận của Dev hay của phiên đo Lần 6. Mã nguồn: PR #39, nhánh `sandbox-runner/pid-00031-gvisor`, commit `36c53b3` (đúng head của PR), worktree tách riêng.

Phạm vi đã đọc: toàn bộ `apps/sandbox-runner/spikes/spk-06/` ở `36c53b3` (gồm `cold_start.py`, `cold-start.sh`, `cold-start-kind.yaml`, `cold-start-k8s.yaml`, `test_cold_start.py`, fixture `default/`, `thesis/` với `SOURCE.md`, `vendor/`), `apps/sandbox-runner/package.json`, `infra/docker/node/Dockerfile`; `report.md` (Lần 4–6, mục 5 YC1), `implement.md`, `self-qc.md` (Lần 4–6); evidence `qc4/`, `qc5/`, `cold-start/`. Đối chiếu lại với `index.html`, `specs/acceptance.html`, `specs/scope.html`, `specs/index.html` mục 3–7, slice S01–S03, PRD MS-TEMPLATE-001, ASM-07, kiến trúc 9.5, quy tắc 1.4.13 (trên `origin/main`).

Quyết định PO áp dụng cho lần này: G3 giữ `memory_limit` kèm `limit_reason=tex_capacity`, không sửa `classify`; cold start đo trong PID-00031 bởi phiên PO giao (`report.md:139`, YC1), nên phần đo cold start không tính `unrequested`; phương án B (spike không sửa `infra/`, PR #51 đã loại `apps/*/spikes` khỏi build context); G5, G9 PO xử lý khi squash.

### Khoảng trống của Lần 1

| Mã | Trạng thái | Bằng chứng QC |
| --- | --- | --- |
| G1 | Đã xử lý | `fixtures/default/` đúng cấu trúc MS-TEMPLATE-001: `main.tex` class `article`, tiếng Anh, `\input` năm file `sections/*.tex` có chú thích hướng dẫn, `figures/`, `bibliography/references.bib` có chú thích “do not edit by hand”, natbib + `plainnat`, `\cite`/`\citet` (`fixtures/default/main.tex:5-24`). Bài báo tiếng Việt không còn nhãn “Mẫu Default” (`fixtures/article/main.tex:4`, `README.md:96-98`). Lần 5: 24/24 build Default/luận văn có `bibtex_ran`, `main.bbl`, `natbib_loaded`; QC chạy lại 8/8 đạt |
| G2 | Đã xử lý | Luận văn thích nghi từ template CUED MIT: QC kiểm qua GitHub API, commit `8d6c2d5` tồn tại, repo khai báo MIT; sha256 của 5 file upstream trùng `vendor/upstream.json`; `vendor/LICENSE` trùng nguyên văn LICENSE upstream; class chỉ khác upstream ở khối font XeLaTeX (`vendor/PhDThesisPSnPDF.cls:558-561`) và khoảng trắng; ba PNG 960×560 có metadata Matplotlib “SIRes synthetic fixture”. 19 trang, 4 chương, BibTeX; giới hạn đại diện đã ghi (`report.md:363-364`) |
| G3 | Đóng theo quyết định PO | `spike.py:44-45` trả `memory_limit` khi TeX hết capacity, `spike.py:184-185` ghi `limit_reason=tex_capacity`, khác `cgroup_oom`. QC chạy lại: hai bom TeX `memory_limit`/`tex_capacity` (cgroup 88,9 và 234,0 MiB), allocator `memory_limit`/`cgroup_oom`, `OOMKilled=true` |
| G4 | Đã xử lý | `apps/sandbox-runner/package.json:6` `"files": ["dist"]`. QC chạy `pnpm --filter @sires/sandbox-runner deploy --legacy --prod`: đầu ra chỉ có `README.md`, `dist/`, `node_modules/`, `package.json`, không có `spikes/`. PR #51 trên `main` loại thêm `apps/*/spikes` khỏi build context |
| G5 | Còn mở, PO xử lý khi squash | Vẫn 3 commit chưa ký `f9673fa`, `dd89668`, `3ce87dc`; 10 commit sau đều `verified=true` (GitHub API). Không có commit chưa ký mới |
| G6 | Đã xử lý | `README.md:124-125` ghi chú không chép giới hạn 16 MiB sang PID-00054 |
| G7 | Đã xử lý | `ruff check` (0.17.4) sạch trên toàn thư mục spike, gồm mã cold start |
| G8 | Đã xử lý | `report.md:5` trỏ Lần 6; `report.md:98-99` ghi cả cgroup peak và RSS |
| G9 | Còn mở, PO xử lý khi squash | Ba thông điệp `14de994`, `51fb2ec`, `dc81960` vẫn hỏng dấu |

### Khoảng trống mới

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G10 | EC03 “Font tiếng Việt lỗi với XeLaTeX → ghi font thử và đề xuất font cho image” · PID-00031-AC04 (danh sách package) | partial | MEDIUM | Image chỉ có `DejaVuSerif.ttf` và `DejaVuSerif-Bold.ttf` (gói `fonts-dejavu-core`, `Dockerfile:13`; QC kiểm `fc-list` trong image). Luận văn XeLaTeX dùng DejaVu Serif (`vendor/PhDThesisPSnPDF.cls:559`, cũng như `fixtures/preamble.tex:10`), nên cả 6/6 build luận văn XeLaTeX của Lần 5 (`evidence/qc5/measurements.json`, `log_tail`) và 2/2 build QC chạy lại đều có `LaTeX Font Warning: Font shape 'TU/DejaVuSerif(0)/m/it' undefined` và “Some font shapes were not available”: chữ nghiêng (`\emph`, `\textit`, trang bìa) in thành chữ đứng. `evidence/qc5/pdf-checks.json` không kiểm thay font. Vậy mà `report.md:309-310` ghi “không thiếu glyph/package…”, `report.md:366-371` vẫn đề xuất `fonts-dejavu-core` cho PID-00054 | Ghi cảnh báo này vào report (EC03). Sửa danh sách package: thêm gói font có đủ bốn kiểu và tiếng Việt, ví dụ `fonts-dejavu-extra` (có DejaVuSerif-Italic, BoldItalic), hoặc chọn họ font khác. Nếu đổi `Dockerfile` thì dựng lại image và chạy một lượt luận văn XeLaTeX để xác nhận hết cảnh báo; không cần đo lại 36 build. Hoặc PO chấp nhận ghi đây là giới hạn chuyển cho PID-00054 |
| G11 | O1 “Chạy lại được theo hướng dẫn” · PID-00031-AC03 (độ tin của số `latexmk`) | partial | LOW | `latexmk_seconds` lấy từ GNU time `%e` (`worker.py:46,69-70`), tính theo đồng hồ thực; `spike.py` không phát hiện đồng hồ thực nhảy, khác `cold_start.py:89-118` (`ClockWatch`). QC chạy `measure.sh` trên máy PO (WSL2 kernel 6.18, đồng hồ nhảy lùi khoảng 2–3 s như `report.md:453-457`): 2/12 lượt có `latexmk_seconds` thấp hơn `worker_seconds` (monotonic) khoảng 2,2 s (runc XeLaTeX bài báo 0,23 s so với 2,47 s; runsc XeLaTeX luận văn 6,83 s so với 9,02 s). Số Lần 5 không bị ảnh hưởng: ở cả 36 lượt `worker_seconds − latexmk_seconds` ≤ 0,034 s | Trong `spike.py`: đánh dấu và loại hoặc đo lại lượt có bước nhảy (ví dụ `worker_seconds − latexmk_seconds` > 0,2 s, hoặc dùng `ClockWatch` như `cold_start.py`). Tối thiểu ghi giới hạn này trong README mục “Phép đo” |
| G12 | Quy tắc giấy phép (`AGENT.md`: file mới chạy `add-license.mjs`) · khối ba dòng của `scripts/docs/add-license.mjs:19-23` | partial | LOW | 17 file mới chỉ có một dòng `SPDX-License-Identifier`, thiếu hai dòng bản quyền và PO: `.dockerignore:1`, `fixtures/default/sections/*.tex:1` (5 file), `fixtures/default/bibliography/references.bib:1`, `fixtures/{loop,memory,network,passwd,shell}/main.tex:1`, `fixtures/thesis/chapters/*.tex:1` (4 file), `fixtures/thesis/bibliography/references.bib:1`. `add-license --check` vẫn exit 0 vì chỉ tìm chuỗi định danh (`add-license.mjs:98`). Trong các file `.tex`, `.bib`, `.py`, `.sh`, `.ts`, `.yaml` ngoài PR này, chỉ một file sinh tự động dùng kiểu một dòng. Riêng 3 chương và `.bib` thích nghi từ MIT ghi định danh eTroy, còn MIT chỉ nằm ở dòng chú thích thứ hai | Thay dòng một-SPDX bằng khối ba dòng cho file của SIRes. Với file thích nghi từ MIT: chờ PO chọn cách ghi (giữ như hiện tại, hoặc `MIT AND LicenseRef-eTroy-NC-1.0`), xem Đề xuất 2 |
| G13 | Chất lượng PR (Lần 3 của Dev đã làm `git diff --check` đạt) | partial | LOW | `git diff origin/main...HEAD --check` exit 2: 532 dòng có khoảng trắng cuối ở `evidence/cold-start/container/load.txt` (151), `pod/load.txt` (182), `container-discarded/load.txt` (198), `kind-up.txt` (1). `self-qc.md` Lần 6 không chạy lệnh này | Bỏ khoảng trắng cuối dòng ở bốn file, nội dung giữ nguyên; chạy lại `git diff origin/main...HEAD --check` |
| G14 | Quy tắc Git của PO (không gắn nhãn công cụ AI vào nội dung đẩy lên Git; `CLAUDE.md` cá nhân, không commit) · kiểm evidence không lộ đường dẫn máy | contradicts | LOW | `report.md:420-421` và `self-qc.md:226` ghi “phiên Claude Code”. `evidence/cold-start/commands.txt:7` còn đường dẫn checkout trên máy PO (`/mnt/h/…/sires/.claude/worktrees/pid-00031-cold-start-…`), trong khi `report.md:633` nói tên máy và thư mục home đã được thay. Ngoài ra evidence không có khóa, token, chứng chỉ hay tên người dùng; cổng duy nhất là loopback `127.0.0.1:2375`, đã có từ Lần 2 của Dev | PO quyết. Đề xuất: thay bằng “phiên đo do PO giao”; trong `commands.txt` thay đường dẫn bằng `<repo>/apps/sandbox-runner/spikes/spk-06` |

Đã kiểm, không thấy khoảng trống:

- Đầu ra đúng spec (quy tắc 1.4.13): O1 là thư mục `apps/sandbox-runner/spikes/spk-06/`, mọi mã mới (cả cold start) nằm trong đó; O2 đúng `agent/execution/PID-00031/report.md`. Không đổi tên, gộp hay tách.
- Ranh giới: PR chạm `apps/sandbox-runner/spikes/spk-06/`, `apps/sandbox-runner/package.json` (G4, PO đã duyệt) và `agent/execution/PID-00031/`. Không sửa `infra/`, `docs/`, file sinh, migration hay luồng khác. Commit `36c53b3` chỉ thêm mã và evidence cold start, cập nhật đầu `report.md`, `self-qc.md`, `implement.md`, README; không sửa `spike.py`, `worker.py`, `Dockerfile`, fixture (so `ff16f5e..36c53b3`). Các file này không đổi từ `6172ec5`, nên evidence Lần 5 vẫn ứng với mã hiện tại.
- Hash: bản LF xuất bằng `git -c core.autocrlf=false archive` khớp blob 42/42 file. `source_sha256`/`fixture_sha256` khớp blob: Lần 5 (đo và tấn công) 5/5 và 28/28, Lần 6 (container và pod) 7/7 và 8/8. Sáu PDF và tám file `.bbl`/`.blg` trong `evidence/qc5/` (so blob, không so bản CRLF trong checkout Windows) khớp `artifact_sha256` của hàng runsc. `/opt/spk-06/worker.py` trong image `sha256:d5af9bea…` khớp blob; `packages.tsv` trong image trùng `evidence/qc5/packages.tsv` và `evidence/cold-start/packages.tsv`.
- Số đo Lần 5: QC tính lại từ `evidence/qc5/measurements.json` và khớp 12/12 dòng bảng `report.md:331-342`: trung vị, min–max, `latexmk` trung vị, RSS max, cgroup max. Runsc lớn nhất: wall 7,9614 s, cgroup 223,3 MiB, RSS 260,9 MiB. Tỉ lệ runsc/runc 1,27–2,05; wall − worker 0,4669/0,5017/0,691 s. `container_config` giống nhau giữa runc và runsc, chỉ khác Runtime.
- Số đo Lần 6: QC tính lại từ `cold-start/{container,pod}/results.json`, khớp `summary.json` và các bảng `report.md:518-547` sau làm tròn. Container: 8 chỉ số × 3 runtime, mỗi runtime 20 lượt đủ vòng 1–20, 5 lượt bỏ (đều runc). Pod: 10 chỉ số × 2 runtime, 11 lượt bỏ. Không lượt nào được giữ lại mà có `clock_step` (độ lệch lớn nhất 0,34 ms). p95 là nearest-rank, giá trị thứ 19. Phân bậc Ready (`report.md:558-561`), các tỉ lệ ×1,75, ×2,26, ×2,07 và mức 22% ngân sách 10 s đều đúng. `load.txt` của hai lượt dùng chỉ có `nutrimeal_services_db`, load1 tối đa 1,63 và 2,06.
- Cold start không thay nghiệm thu N3 (Queued → Running, PID-00080): `report.md:578-580` ghi rõ.
- Bảo mật harness cold start: chứng chỉ client của kind ghi ra thư mục tạm quyền 0600 rồi xóa (`cold_start.py:334-341`, `546-550`); pod non-root, drop ALL, không token service account; init container chỉ có `CAP_CHOWN` (`cold_start.py:384-399`). Khác biệt của pod so với container (có mạng CNI, không ulimit) đã ghi ở `report.md:506-511`.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00031-AC01 | đạt | thao tác tay của QC, runsc KVM trên WSL2 (máy PO) | `attack.sh › shell, passwd` × pdfLaTeX, XeLaTeX | QC chạy `attack.sh` exit 0. shell ×2: `success`, không có marker, log ghi `runsystem(touch /work/SHELL_EXECUTED)...disabled.`. passwd ×2: `compile_error` exit 12, log `Not reading from /etc/passwd (openin_any = p).`. `isolation_verified=true` (UID 65532, rootfs và `/tmp` chỉ đọc) |
| PID-00031-AC02 | đạt (theo quyết định PO G3) | như trên | `attack.sh › loop, memory, memory-probe` | loop: `timeout` ở 120,018 s và 120,012 s, `limit_reason=deadline`. memory: `memory_limit`, `tex_capacity` (`main memory size=5000000`), cgroup 88,9 và 234,0 MiB. memory-probe: `memory_limit`, `cgroup_oom`, `OOMKilled=true`, exit 137, cgroup peak 2.147.483.648 B |
| PID-00031-AC03 | đạt | evidence Lần 5 cộng một lượt chạy chức năng của QC | `measure.sh` | Lần 5: 36/36, bảng khớp dữ liệu thô. QC chạy `measure.sh --repetitions 1`: 12/12 `success` (Default, bài báo, luận văn × 2 engine × runc/runsc). Cả 8 build Default/luận văn có BibTeX, `main.bbl` và natbib; PDF 2/4/19 trang. Thời gian của QC chỉ dùng để kiểm chức năng, không dùng làm số hiệu năng |
| PID-00031-AC04 | một phần (G10) | đọc báo cáo | `report.md` Lần 5–6 | Có kết luận ASM-07 (`report.md:359-364`) và danh sách package đã dùng thật (`report.md:366-371`), nhưng danh sách thiếu font nghiêng cho XeLaTeX |
| NFR-SANDBOX-001-AC01 | đạt ở mức spike | như AC01 | `attack.sh › passwd, network, network-probe` | Như AC01. network ×2: `write18` bị chặn. network-probe: `[Errno 101] Network is unreachable`. Kiểm chính thức ở PID-00128 |

Edge case:

- EC01: runsc KVM chạy được trên WSL2 ở cả máy Dev (kernel 6.6) và máy PO (kernel 6.18). systrap chạy được trên 6.18 (Lần 6, mức container). Hợp spec 2.5.
- EC02: 36 build Lần 5 và 12 build của QC không thiếu package; image không tải gì khi chạy (`MKTEX*=0`, `--network=none`).
- EC03: một phần (G10). Tiếng Việt hiển thị được, nhưng XeLaTeX với DejaVu Serif không có kiểu nghiêng.

### Lệnh đã chạy

Chạy trong worktree tách riêng ở `36c53b3` (Windows 11; Python bằng interpreter gốc của uv). Suite gVisor chạy trong WSL `Ubuntu-24.04` (kernel `6.18.58.1-microsoft-standard-WSL2`, Docker 29.8.2, runsc `release-20261116.0` với `--platform=kvm`, image có sẵn `sires/spk-06:texlive-2022` = `sha256:d5af9bea…`), trên bản LF của thư mục spike xuất từ git, output trong scratchpad của QC. Không cài gì, không sửa `daemon.json`, không pull image, không khởi động cụm kind.

| Lệnh | Kết quả |
| --- | --- |
| `node scripts/docs/add-license.mjs --check` (trước khi cài phụ thuộc) | exit 0, “0 file chưa có thông báo giấy phép”. QC tự kiểm khối ba dòng: 17 file mới thiếu (G12) |
| `node scripts/docs/update-index.mjs --check` | exit 0: khớp 159 PID, 159 task |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00031 --result` | exit 0: “KẾT QUẢ ĐỦ (0 cảnh báo)”, trạng thái Xong — chờ QC |
| `node scripts/development/check-tracks.mjs --base origin/main` | exit 0: `tracks touched: repo, sandbox-runner` |
| `ruff check --no-cache apps/sandbox-runner/spikes/spk-06` (ruff 0.17.4, cấu hình gốc) | “All checks passed!” |
| `python -B -m unittest -v test_spike test_cold_start` (Windows 3.12.16; WSL 3.12.3 trên bản LF) | 16/16 OK ở cả hai |
| `bash -n measure.sh attack.sh setup-runsc.sh cold-start.sh` (WSL) | exit 0 |
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm nx run-many -t lint typecheck test build -p @sires/sandbox-runner --skip-nx-cache` | exit 0; 4 task phụ thuộc đạt. Nx báo `@sires/contracts:generate-ts` flaky (luồng khác, chỉ là cảnh báo) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --head=HEAD --skip-nx-cache` | exit 0; chỉ `@sires/sandbox-runner` và 4 task phụ thuộc |
| `pnpm --filter @sires/sandbox-runner deploy --legacy --prod <thư mục tạm>` | exit 0; không có `spikes/` (G4 đóng) |
| `git diff origin/main...HEAD --check` | exit 2: 532 dòng có khoảng trắng cuối trong 4 file evidence Lần 6 (G13) |
| `git -c core.autocrlf=false archive HEAD apps/sandbox-runner/spikes/spk-06`, so sha256 với `git cat-file blob` | 42/42 khớp |
| `docker run` (runc, `--network=none --read-only`) kiểm image: sha256 `worker.py`, `packages.tsv`, biến môi trường, `fc-list` | Khớp blob; `openin_any=p`, `openout_any=p`, `shell_escape=f`, `MKTEX*=0`; latexmk 4.79; UID 65532; DejaVu Serif chỉ có Regular và Bold (G10) |
| `bash attack.sh --image sires/spk-06:texlive-2022 --output <tạm>` | exit 0, 12/12 đạt (bảng AC). Hash nguồn 5/5, fixture 28/28 khớp blob. Sau suite không còn container `sires-spk06-<12 hex>` |
| `bash measure.sh --image sires/spk-06:texlive-2022 --output <tạm> --repetitions 1` | exit 0, 12/12 đạt; `container_config` giống nhau giữa runc và runsc, chỉ khác Runtime. 2/12 lượt có `latexmk_seconds` lệch vì đồng hồ thực nhảy (G11). Hai build luận văn XeLaTeX có cảnh báo thay font (G10) |
| Script tính lại số đo Lần 5 (`evidence/qc5/*.json`) và Lần 6 (`evidence/cold-start/*/results.json`), đọc từ blob git | Khớp bảng trong report và `summary.json` (mục “Đã kiểm”) |
| `gh api repos/kks32/phd-thesis-template/...` tại `8d6c2d5` (chỉ đọc, không lưu file) | Commit tồn tại, license MIT; sha256 5 file khớp `vendor/upstream.json`; LICENSE trùng |
| Quét evidence tìm tên người dùng, đường dẫn, IP, cổng, khóa, chứng chỉ | Chỉ có `C:\Users\Admin\…` trong log của Dev (tên chung) và `127.0.0.1:2375` loopback đã có từ Lần 2 của Dev. Không có khóa hay chứng chỉ. `commands.txt:7` còn đường dẫn checkout của PO (G14). `machineID`/`systemUUID` trong `pod/environment.json` là của node kind |
| `gh pr view 39`, `gh pr checks 39`, `gh api repos/toilatrung/sires/commits/<sha>` | PR OPEN, head `36c53b3`, `mergeStateStatus=BEHIND` (`main` đi trước 11 commit, gồm PR #51); `build`, `tracks` đạt. 3 commit chưa ký cũ (G5), không có commit chưa ký mới; thông điệp commit không có dòng ghi công AI. Mô tả PR vẫn ghi trạng thái “Đang làm — … chờ G3/cold start” |
| `cold-start.sh container`, `cold-start.sh pod` | không chạy: đây là phép đo hiệu năng, máy đang dùng chung nên số đo lại không đáng tin; cụm kind đang dừng và theo chỉ dẫn không khởi động lại. QC kiểm phần này bằng cách tính lại từ dữ liệu thô và chạy unit test |
| Suite trên runsc systrap, GitHub Actions | không chạy: ngoài phạm vi kiểm AC01–AC03, ticket không yêu cầu |

### Lệch với Self-QC

- `report.md:309-310` và `self-qc.md:219-220` ghi không thiếu glyph, package hay font, coi EC03 là đạt. QC thấy cả 6 build luận văn XeLaTeX của Lần 5 (và 2 build QC chạy lại) đều có cảnh báo thiếu kiểu nghiêng DejaVu Serif; danh sách package vẫn chỉ có `fonts-dejavu-core` (G10).
- `self-qc.md` Lần 6 không chạy `git diff --check`; QC chạy và nhận exit 2 do evidence Lần 6 (G13).
- `self-qc.md:245` ghi `add-license --check` 0 file thiếu. Đúng như vậy, nhưng lệnh chỉ tìm chuỗi định danh, và 17 file mới thiếu khối ba dòng (G12).
- `report.md:633` ghi đã thay tên máy và thư mục home, nhưng `evidence/cold-start/commands.txt:7` còn đường dẫn checkout cục bộ (G14).
- Lần 5 của Dev chạy `attack.sh` bị gián đoạn và phải chạy tiếp 4 ca (`evidence/qc5/attack-resume.json`). QC chạy lại một lượt liền, exit 0, 12/12, nên kết luận AC01, AC02 không còn dựa vào lượt chạy tiếp đó.

### Việc còn lại, theo thứ tự phụ thuộc

1. PO quyết Đề xuất 1 (G10: sửa trước khi merge hay chuyển cho PID-00054) và G14.
2. Ghi cảnh báo font vào EC03, sửa danh sách package (ví dụ thêm `fonts-dejavu-extra`); nếu đổi `Dockerfile` thì chạy một lượt luận văn XeLaTeX để xác nhận (G10, PID-00031-AC04, EC03).
3. Thêm cách phát hiện đồng hồ nhảy cho `latexmk_seconds` trong `spike.py`, hoặc ghi giới hạn trong README (G11, O1).
4. Thay dòng một-SPDX bằng khối ba dòng ở 17 file; file thích nghi từ MIT ghi theo Đề xuất 2 (G12).
5. Bỏ khoảng trắng cuối dòng ở 4 file evidence Lần 6 rồi chạy `git diff origin/main...HEAD --check` (G13).
6. Sửa “phiên Claude Code” và đường dẫn trong `commands.txt` theo quyết định ở bước 1 (G14).
7. Người làm bước 2–6 (Dev theo `spec-execution-skill`, hoặc phiên PO giao vì G14 thuộc nội dung Lần 6) ghi “Lần 7” trong `report.md`, `self-qc.md`. Nếu chỉ sửa tài liệu và script mà không đổi `Dockerfile`, `worker.py` hay fixture thì không cần đo lại.
8. Khi merge: cập nhật nhánh theo `main` (PR đang BEHIND 11 commit) để CI `tracks`, `build` chạy lại; sửa mô tả PR #39 cho đúng trạng thái sau Lần 6; squash với thông điệp tiếng Việt đúng dấu (G5, G9).

### Đề xuất cho PO

1. **G10 trước hay sau merge.** Đây là MEDIUM, không chặn cổng QC. Nhưng S03 ghi “Xong khi PID-00054 dùng được đề xuất”, mà PID-00054 sẽ lấy danh sách package này, nên QC đề xuất sửa report trước khi merge. Việc chỉ là sửa tài liệu; nếu thêm gói font thì chỉ cần một lượt build kiểm.
2. **Giấy phép của nội dung bên thứ ba.** `LICENSES.md` mục 1–2 ghi toàn bộ repo thuộc sở hữu độc quyền của eTroy, trong khi repo đã chứa nội dung MIT (template CUED trong fixture này, Spec Kit ở `agent/skills/THIRD_PARTY_NOTICES.md`). PO cân nhắc: thêm ngoại lệ “nội dung bên thứ ba giữ giấy phép gốc” vào `LICENSES.md`, và chốt cách ghi SPDX cho file thích nghi (G12).
3. **CRLF trên Windows.** Checkout với `core.autocrlf=true` làm `source_sha256`/`fixture_sha256` lệch blob và image dựng từ bản CRLF khác image dựng từ bản LF (phiên Lần 6 phải tự đổi về LF). Luồng sandbox-runner có thể thêm `.gitattributes` riêng trong `apps/sandbox-runner/spikes/spk-06/` (ví dụ `* text eol=lf`, ảnh PNG giữ binary) để ai chạy lại cũng có cùng hash.
4. **Dọn máy PO** khi không cần nữa, theo bảng `report.md:599-608`: cụm kind `sires-spk06` (đang dừng), image khoảng 2,6 GB, runtime `runsc` và `runsc-systrap` trong `daemon.json`, `~/sires-coldstart/`.
5. Đề xuất 3–7 của Lần 1 vẫn còn hiệu lực cho PID-00054, PID-00112, PID-00128 và mẫu spec spike. Riêng Đề xuất 3 có thêm dữ kiện: systrap chạy được trên kernel WSL2 6.18 (Lần 6, mức container).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
