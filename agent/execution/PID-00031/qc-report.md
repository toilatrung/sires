# PID-00031 — Báo cáo QC độc lập

**Kết luận mới nhất:** Còn việc — 0 CRITICAL, 1 HIGH, 4 MEDIUM, 4 LOW. Chưa merge được vì G1 (HIGH): phép đo chưa chạy trên template Default, chưa lần nào chạy BibTeX/natbib. QC không chạy lại được suite gVisor (máy QC không có runsc, CI không chạy suite này), nên AC01–AC03 được đánh giá trên bằng chứng của Dev; QC đã đối chiếu hash mã nguồn và PDF với bằng chứng đó (Lần 1, 19/11/2026)

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

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
