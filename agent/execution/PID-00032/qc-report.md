# PID-00032 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH. PID-00032-AC01–AC04 đạt ở mức spike cục bộ, dựa trên bằng chứng runsc của Dev; máy QC không có runsc nên không chạy lại suite, nhưng đã tính lại số đo và kiểm hash. Không lệch tên hay đường dẫn Output. Còn 2 MEDIUM (G1: EC01 chưa có phương án thay thế; G2: cấu hình runsc và seccomp chưa có bằng chứng) và 4 LOW; PO chọn xử lý trước hay sau merge. PR đang BEHIND `main` (Lần 1, 21/11/2026)

- **Ticket:** [PID-00032](../../../docs/tickets/issues/PID-00032/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 21/11/2026 · spec-converge-skill

Người chạy: agent QC độc lập do PO `toilatrung` giao, không mang kết luận của Dev. Mã nguồn: PR [#45](https://github.com/toilatrung/sires/pull/45), nhánh `sandbox-runner/pid-00032-mermaid`, commit `a7ab3e4` (worktree QC riêng, detached), tách từ `main` `cd25a65`. Lúc QC, `origin/main` là `26df19a`; PR BEHIND 2 commit (#40 DEC-59, #43 PID-00011). `git merge-tree` không báo xung đột, và hai commit này không chạm `docs/tickets/issues/PID-00032/`, `apps/sandbox-runner/`, kiến trúc 9 hay quy tắc 1.4. QC đánh giá trạng thái file tại `a7ab3e4`.

Phạm vi đã đối chiếu: AC01–AC04 (`specs/acceptance.html`), P1–P4, N1–N2, EC01–EC03 (`specs/scope.html`), slice S01–S03, spec mục 2–7, `specs/brief.html`, `designs/notes.html`. Căn cứ dự án: kiến trúc 9.4, 9.5 và 12 (ADR-11, SPK-07, TR-04); PRD DIAG-TYPES-001 và INT-DIAGRAM-001–004; hợp đồng `listDiagramTypes`/`DiagramType`; `AGENT.md`; quy tắc 1.4. Mã đã đọc: toàn bộ `apps/sandbox-runner/spikes/spk-07/` (`Dockerfile`, `.dockerignore`, `package.json`, `package-lock.json`, `harness.py`, `worker.py`, `parse.mjs`, `render.mjs`, `render.sh`, `test_supervisor.py`, 13 fixture, `README.md`), `apps/sandbox-runner/package.json` và 363 file trong `evidence/`.

Áp dụng quy tắc PO chốt 20/11/2026 (chưa vào `main`): tên và đường dẫn ở Đầu ra của ticket và spec mục 3 là bắt buộc.

Tóm tắt đánh giá:

- **Tên, đường dẫn Output:** không có lệch nào.
  - O1 `apps/sandbox-runner/spikes/spk-07/` (`specs/index.html:65`, ticket `index.html:65`): có.
  - O2 `agent/execution/PID-00032/report.md` (`specs/index.html:66`): có.
  - S01 `apps/sandbox-runner/spikes/spk-07/Dockerfile` (`specs/slices/S01-container.html:35`): có.
  - Bảng AC → test trỏ `apps/sandbox-runner/spikes/spk-07/render.sh` (`specs/index.html:112`–`:114`): có.
- **S01:**
  - `Dockerfile` cố định digest Node, dùng snapshot Debian 19/11/2026 và npm lockfile riêng.
  - Mỗi ca chạy trong container mới với `--runtime runsc --network=none --read-only --user=65532:65532 --memory=2g --memory-swap=2g --cpus=2 --pids-limit=256 --cap-drop=ALL --security-opt=no-new-privileges`; tmpfs `/work` (rw) và `/tmp` (ro); chỉ bind `/input` ở chế độ chỉ đọc (`harness.py:72`–`:90`). Host luôn chạy `docker rm -f` (`harness.py:151`–`:152`).
  - 23 `container-inspect.json` (run-1: 18, run-2: 4, preflight-3: 1) đều có Runtime `runsc`, NetworkMode `none`, ReadonlyRootfs, CapDrop `ALL`, Privileged `false` và đúng một mount `/input` ro, không mount socket Docker.
- **S02:**
  - Parse chạy trong tiến trình Node riêng có jsdom (`parse.mjs`).
  - Supervisor Python đặt deadline 30 s cho parse, 120 s cho render và kill cả process group (`worker.py:18`–`:36`, `:54`, `:69`).
  - Render dùng `renderMermaid` của mermaid-cli 11.12.0. Request interception bật trước navigation và chỉ cho qua `file:` trong `/opt/spk-07/node_modules/`, `data:`, `about:` (`render.mjs:31`–`:48`); có request bị chặn thì job lỗi `network_blocked` (`render.mjs:64`, `:76`).
  - SVG được đổi sang PDF bằng `rsvg-convert`; lỗi thì xuất PNG ở tỉ lệ 300/96 và gắn chunk pHYs (`worker.py:77`–`:99`).
  - Kịch bản: 10 mẫu (năm loại PRD 13.2 và bảy ví dụ `DiagramType.id`), nguồn 350 cạnh, sai cú pháp, ảnh ngoài, link ngoài, Chromium hỏng, treo parse, treo render, PDF lỗi.
- **S03:** `report.md:109`–`:123` kết luận ASM-08 (khả thi trên môi trường cục bộ) và đề xuất cho PID-00054; `report.md:138` đề xuất PO cập nhật kiến trúc 12.2. Dev không sửa `docs/`.
- **Gói sản phẩm:**
  - `apps/sandbox-runner/package.json:5` thêm `"files": ["dist"]`. QC chạy đúng lệnh ở `infra/docker/node/Dockerfile:13`: gói chỉ có `README.md`, `package.json`, `dist/`, `node_modules/`, không có `spikes/`.
  - Probe packlist: bỏ trường này thì gói mang theo 24 file `spikes/…`. Vì vậy thay đổi là cần để giữ O1 ngoài gói, nằm trong luồng sandbox-runner, không tính là `unrequested`.
  - Spike không thành project Nx, không thuộc workspace pnpm (`pnpm-workspace.yaml` chỉ khai báo `apps/*`), không nằm trong `tsconfig` (`include: ["src"]`). `eslint .` của project có lint `spikes/` và sạch.
- **Điểm dừng, ranh giới:** ngoài `apps/sandbox-runner/` chỉ có `agent/execution/PID-00032/`. Không chạm `docs/`, file sinh, migration, catalog hay `pnpm-lock.yaml`; không gọi model, service hay database.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | EC01 (`specs/scope.html:37`; spec 4.7 `specs/index.html:91`: “Báo PO cùng phương án thay thế”); TR-04 kiến trúc 12 (`docs/architecture/sections/12-decisions-risks-and-open-issues.html:95`) | partial | MEDIUM | `render.mjs:18`–`:21` tắt sandbox trong của Chromium (`--no-sandbox`), lý do ghi là “inner sandbox cannot create namespaces under gVisor”. `report.md:119`–`:121` và `self-qc.md:44` chỉ nêu hạn chế rồi chuyển cho PID-00054, chưa có phương án thay thế. `evidence/` không có lần chạy nào thiếu `--no-sandbox` (`preflight/`, `preflight-2/` chỉ có `environment.json`; `preflight-3` là lỗi DOMPurify), nên lý do trên chưa có bằng chứng | Dev chạy một ca (flowchart) dưới runsc không có `--no-sandbox` và giữ evidence lỗi. Sau đó bổ sung vào `report.md` 2–3 phương án kèm đánh đổi để PO chọn, ví dụ: giữ `--no-sandbox` và coi gVisor cùng cấu hình container là ranh giới cách ly; thử cấu hình để sandbox của Chromium chạy được trong gVisor; dùng phương án dự phòng của TR-04 (container thường + seccomp, hoặc microVM). Cách khác: PO đồng ý `--no-sandbox` trong chat và Dev ghi lời đồng ý đó vào `report.md` |
| G2 | P1 (container “chạy bằng runsc”); spec 2.5 (môi trường); độ đúng của đề xuất cho image thật (P4) | partial | MEDIUM | Hai lời khai không có trong evidence: “platform KVM” (`report.md:13`, `self-qc.md:13`) và “Docker seccomp mặc định” còn hiệu lực (`report.md:45`, `implement.md:57`–`:58`, `apps/sandbox-runner/spikes/spk-07/README.md:60`, `render.mjs:19`). `environment.json` chỉ ghi `runsc --version` và `docker version` (`harness.py:166`–`:172`), không ghi runtime args của runsc; `container-inspect.json:73` có SecurityOpt chỉ gồm `no-new-privileges`. runsc chỉ nạp profile seccomp OCI khi bật cờ `--oci-seccomp` (mặc định tắt); nếu không bật thì profile mặc định của Docker không áp cho tiến trình trong job. QC không kiểm được vì máy này không có runsc | Dev ghi vào evidence kết quả `docker info --format '{{json .Runtimes}}'` (hoặc `daemon.json`) của máy đã chạy. Nếu runsc không bật `--oci-seccomp` thì sửa câu ở bốn chỗ trên cho đúng các lớp thật sự có (gVisor Sentry, cap-drop, no-new-privileges, non-root, read-only, network none) và nêu điều này trong đề xuất cho PID-00054 |
| G3 | `AGENT.md` › Quy tắc bắt buộc (file mới phải chạy `add-license.mjs`) | partial | LOW | 13 fixture `apps/sandbox-runner/spikes/spk-07/fixtures/*.mmd:1`, nguồn `large` (`harness.py:41`) và SVG xuất ra (`render.mjs:67`) chỉ có một dòng `SPDX-License-Identifier`. File cùng loại trên `main` có khối ba dòng (`docs/architecture/figures/FIG-101-system-context.mmd:1`–`:3`, `docs/overview/assets/brand/sires-logo.svg:2`–`:6`). `add-license.mjs --check` vẫn sạch vì chỉ dò mã SPDX | PO quyết một trong hai: chấp nhận một dòng cho fixture và artifact sinh ra của spike; hoặc Dev đổi fixture sang khối ba dòng. Nếu đổi, số dòng, `sourceSha256` và `expectedLine` (`harness.py:36`) đều đổi, nên phải chạy lại suite dưới runsc (cùng việc G6) |
| G4 | B1 (`specs/index.html:98`: “Danh sách câu hỏi và cách đo … Mỗi giả định có phép đo tương ứng”); O2 (“kết luận từng giả định”); mục đích spec “Kiểm chứng ASM-08 và ADR-11” | partial | LOW | `report.md` không có danh sách câu hỏi → phép đo; chỉ có kết luận ASM-08 (`report.md:109`–`:113`). ADR-11 (phần mermaid-cli dưới gVisor không mạng) và TR-04 không có dòng kết luận riêng | Dev thêm một bảng ngắn: căn cứ (ASM-08, ADR-11, TR-04, INT-DIAGRAM-002/003/004, timeout ở kiến trúc 9.4) → câu hỏi → ca hay phép đo → kết quả → kết luận |
| G5 | P4 (“đề xuất cho image thật”); S03 “Xong khi: PID-00054 dùng được đề xuất” | partial | LOW | Ba điều có trong mã và evidence nhưng chưa vào đề xuất (`report.md:115`–`:123`). (a) Link ngoài vẫn nằm trong artifact: `evidence/run-1/external-link-1/output.svg:2` có `<a xlink:href="https://example.com/spk07-link"`, `output.pdf` có `/URI (https://example.com/spk07-link)`, trong khi `report.md:85` chỉ ghi “strict mode không điều hướng”. (b) Ca render treo dừng trước khi mở Chromium (`render.mjs:14`). Puppeteer chạy Chromium ở process group riêng nên `os.killpg` (`worker.py:33`) không kill được nó; spike dựa vào việc host xóa container (`harness.py:152`). Với pool ấm (kiến trúc 9.5) phải kill theo cgroup hoặc container. (c) Mã `syntax_error` được gán theo `error.hash` hoặc regex trên thông báo lỗi (`parse.mjs:36`); mới thử sai cú pháp với flowchart (`fixtures/invalid-syntax.mmd`), chưa thử `sequenceDiagram`, `stateDiagram-v2` | Dev bổ sung ba ý này vào phần đề xuất cho PID-00054 và PID-00107 trong `report.md`; không cần sửa mã spike |
| G6 | O1 “Chạy lại được theo hướng dẫn”; truy vết giữa evidence và mã | partial | LOW | Bộ đủ 18 ca chỉ chạy trên image `e921ad4…` với `parse.mjs` cũ và harness cũ: `evidence/run-1/invalid-syntax-1/result.json:17` có `"line": 2` mà vẫn `"passed": true`, trong khi `harness.py:143` hiện tại đòi dòng 3. Image cuối `b68a865…` chỉ chạy 4 ca (run-2). Manifest `checks/image-source-final-sha256.txt` chỉ băm 5 file chép vào image, không có `harness.py`, `Dockerfile`. QC kiểm: 5/5 hash khớp blob tại `a7ab3e4`; `parse.mjs` chỉ đổi ở nhánh `catch` nên các ca thành công không bị ảnh hưởng, rủi ro thấp | Tùy PO: Dev chạy lại đủ 18 ca trên image và harness cuối (`run-3`), thêm hash `harness.py`, `Dockerfile` vào manifest để PID-00054 có một baseline nhất quán |

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00032-AC01 | Đạt | Dev chạy tay dưới runsc (WSL2, Docker 29.8.2, runsc release-20261116.0). QC không chạy lại vì máy không có runsc; đã đối chiếu evidence thô | `apps/sandbox-runner/spikes/spk-07/render.sh › chạy tay` — run-1: activity, class, component, er, flowchart, gantt, mindmap, sequence, state, workflow, large | 11/11 ca `ok`, mỗi ca có `output.svg` và `output.pdf` (bắt đầu bằng `%PDF-`). Kích thước blob khớp `artifacts` trong `result.json`. 12 PDF (thêm external-link) đều 1 trang và có text (`checks/pdf-inspection.json`). QC tính lại cả 11 dòng bảng `report.md:58`–`:68` (parse, render, RSS lớn nhất theo GNU time, cgroup peak): khớp từng số. Năm loại PRD 13.2 và bảy ví dụ `DiagramType.id` đều có mẫu |
| PID-00032-AC02 | Đạt | Như AC01 | external-image, external-link (run-1, run-2) | external-image: `requests.json` có 1 request `https://example.com/spk07-canary.png` bị `aborted`, mã `network_blocked`, không ra SVG. external-link: `requests.json` rỗng, có SVG và PDF. Mọi container có NetworkMode `none`. Lưu ý: artifact vẫn giữ link ngoài (G5) |
| PID-00032-AC03 | Đạt | Như AC01; QC chạy thêm test supervisor dưới runc | invalid-syntax, render-failure, parse-timeout, render-timeout; `apps/sandbox-runner/spikes/spk-07/test_supervisor.py` | `syntax_error` với `stage: parse` (run-2 báo dòng 3) phân biệt được với `render_error` với `stage: render` (Chromium `/bin/false` sau khi parse đạt). Timeout ghi `stage` parse hoặc render, dừng ở 0,51 s. Supervisor 3/3 dưới runc; bản đột biến bỏ `killpg` bị test EC02 bắt |
| PID-00032-AC04 | Đạt | Đọc báo cáo | `agent/execution/PID-00032/report.md` | Có kết luận ASM-08 ở `report.md:109`–`:113`, kèm giới hạn và đề xuất cho PID-00054. Thiếu kết luận riêng cho ADR-11, TR-04 (G4) |
| EC01 (không AC) | Một phần | Đọc mã và evidence | Thao tác tay | Xem G1 |
| EC02 (không AC) | Đạt (fault injection) | Evidence của Dev; QC chạy test supervisor | parse-timeout, render-timeout, large; `test_supervisor.py › test_ec02_deadline_kills_descendants` | Nguồn 350 cạnh render trong 19,39 s, không timeout. Treo giả lập dừng ở 0,51 s và ghi mã `timeout`. Chưa thử trường hợp treo khi Chromium đang chạy (G5) |
| EC03 (không AC) | Đạt (fault injection) | Evidence của Dev; QC đọc file PNG | pdf-fallback | Ra `png_fallback` kèm cảnh báo. PNG 1219×1391 px = viewBox 389,97×444,95 × 300/96; pHYs 11811 px/m (300 dpi), CRC đúng |

### Lệnh đã chạy

Máy PO, Windows 11, worktree QC riêng. Docker Engine 29.8.2 chạy trong WSL `Ubuntu-24.04` và chỉ có runtime `runc`. QC không cài runsc, không pull image, không tải binary. Container của QC mang nhãn `sires.session=qc-pid-00032`, chạy với `--rm`; đã kiểm không còn container nào. Script tính số đo, bản sao dùng cho probe và thư mục deploy nằm ở scratchpad, ngoài worktree. `git status` của worktree sạch trước khi ghi file này.

| Lệnh | Kết quả |
| --- | --- |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00032 --result` | `PID-00032: KẾT QUẢ ĐỦ (0 cảnh báo).` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00032` | `ĐỦ để thực thi (1 cảnh báo)`: cảnh báo trạng thái `Xong — chờ QC` |
| `node scripts/development/check-tracks.mjs --base origin/main` (`origin/main` = `26df19a`) | `tracks touched: repo, sandbox-runner` (`repo` là `agent/execution/PID-00032/`) |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` (trước và sau khi ghi file này). Khối ba dòng: xem G3 |
| `node scripts/docs/update-index.mjs --check` | Khớp: 159 PID, 15 đợt; taskboard khớp; `docs/index.html` khớp |
| `pnpm install --frozen-lockfile` | Đạt (pnpm 10.34.9) |
| `pnpm nx run @sires/sandbox-runner:test --skip-nx-cache` | Đạt: Vitest 1/1 (`src/app.module.spec.ts`), cùng 4 task phụ thuộc |
| `NX_BASE=cd25a65 NX_HEAD=HEAD pnpm nx affected -t lint typecheck test build --skip-nx-cache --parallel=1` | Chỉ `@sires/sandbox-runner` bị ảnh hưởng; `Successfully ran targets lint, typecheck, test, build … and 4 tasks it depends on` |
| `pnpm nx show projects` | 19 project, không có project nào của spike (`sires-spk-07`) |
| `pnpm exec eslint --max-warnings=0 spikes/spk-07/parse.mjs spikes/spk-07/render.mjs` (từ `apps/sandbox-runner`); `eslint --debug .` | Exit 0; target `lint` có duyệt `spikes/spk-07/` |
| `pnpm --filter @sires/sandbox-runner deploy --legacy --prod <scratchpad>/qc32-deploy` (sau build, đúng lệnh ở `infra/docker/node/Dockerfile:13`) | Exit 0. Đầu ra gồm `README.md`, `package.json`, `dist/` (`app.module`, `main`, `manifest`), `node_modules/`. Không có `spikes/`, `harness.py`, `render.mjs`, `worker.py`, `src/` |
| Probe packlist: `npm pack --dry-run --json` trên bản sao `apps/sandbox-runner` ở scratchpad | Bỏ trường `files`: 37 file, trong đó 24 file `spikes/…`. Có `files: ["dist"]`: `README.md`, `dist/main.js`, `package.json` |
| `docker build -f infra/docker/node/Dockerfile --build-arg SERVICE=sandbox-runner .` | Không chạy: base `node:22-slim` không có sẵn trên máy, không pull. Lệnh deploy ở trên đã thay phần kiểm nội dung gói |
| `uv sync --all-packages --locked` | Đạt |
| Trình thông dịch gốc của uv (`cpython-3.12.16`), runner `site.addsitedir(.venv/Lib/site-packages)` + `runpy`: `ruff check --no-cache apps/sandbox-runner/spikes/spk-07` | ruff 0.17.4, cấu hình `pyproject.toml` gốc: `All checks passed!` (`harness.py`, `test_supervisor.py`, `worker.py`) |
| Như trên: `ruff format --check --no-cache apps/sandbox-runner/spikes/spk-07` | `4 files already formatted` (3 file `.py` và `README.md`) |
| `pytest` trên Windows | Không chạy: test cần `os.killpg`, `/usr/bin/time`, `/work`. Thay bằng dòng dưới |
| `docker run --rm --runtime=runc --network=none --read-only --user=65532:65532 --cap-drop=ALL --security-opt=no-new-privileges --tmpfs=/work… ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim -B /input/test_supervisor.py -v` (spike mount ro ở `/opt/spk-07`, GNU time 1.9 của host mount ro) | `Ran 3 tests … OK`. Mức kiểm: runc, Python 3.12.16, không phải image spike (Python 3.11.2) và không phải runsc |
| Probe đột biến: bản sao `worker.py` thay `os.killpg(process.pid, signal.SIGKILL)` bằng `process.kill()`, chạy lại test như dòng trên | `test_ec02_deadline_kills_descendants` FAIL (`child process escaped deadline cleanup`): test bắt được lỗi |
| `docker info` (WSL) | Runtime chỉ có `runc`, `io.containerd.runc.v2`; không có `runsc`, không có image `sires/spk-07`. Không chạy được `render.sh` dưới gVisor, nên AC01–AC03 đánh giá trên evidence của Dev |
| Script Node ở scratchpad tính lại số đo từ `run-1/*/result.json`, `*.time`, `container-inspect.json` | 11 dòng bảng `report.md:58`–`:68` khớp từng số. hostSeconds của mẫu nhỏ 18,33–22,07 s (report ghi “18–22 s”). Timeout parse, render 0,51 s. `summary.json`: run-1 18/18 passed, run-2 4/4. Cấu hình bảo mật của 23 container như mục Tóm tắt |
| Kiểm artifact và nguồn bằng `git cat-file -s`, `git show` | Kích thước blob `output.svg`/`.pdf`/`.png` bằng `artifacts` trong `result.json` ở mọi ca. sha256(`input.mmd`) bằng `sourceSha256` ở mọi ca. `input.mmd` trùng blob fixture hiện tại 13/13; 4 ca fault injection dùng `flowchart.mmd`. Nguồn `large` sinh lại từ `harness.py` hiện tại cho cùng hash `a8949bcb…` |
| sha256 blob LF tại `a7ab3e4` của `parse.mjs`, `render.mjs`, `worker.py`, `package.json`, `package-lock.json` | Khớp `checks/image-source-final-sha256.txt` 5/5; baseline `checks/image-source-sha256.txt` chỉ khác ở `parse.mjs`. Checkout Windows đổi sang CRLF nên phải băm blob git, không băm file trên đĩa |
| Đọc chunk PNG của `run-1/pdf-fallback-1/output.png` | IHDR 1219×1391, pHYs 11811/11811 px/m, đơn vị mét (300,00 dpi), CRC hợp lệ |
| `gh pr checks 45 --repo toilatrung/sires`; `gh run view 44878132617 --log` | `build` pass (25 s), `tracks` pass (6 s). CI chạy `add-license --check`, `update-index --check` và `nx affected` (base `cd25a65`, head merge `c904078`): lint, typecheck, test, build của sandbox-runner đạt. CI không lint hay test mã Python của spike (QC đã tự chạy ở trên) |
| `gh api repos/toilatrung/sires/commits/<sha>` cho 4 commit; `git log --format=%B` | `13915f4`, `218e42b`, `e56c04d`, `a7ab3e4`: `verified: true`, `reason: valid`. Tác giả là Dev; không có trailer ghi công AI; mô tả PR không có dòng ghi công |
| `git merge-tree --write-tree origin/main HEAD` | Không xung đột |
| Quét `evidence/` tìm token, secret, đường dẫn máy | Không có token hay secret; chỉ có đường dẫn worktree của Dev (`D:\sires\.nx\pid00032`) trong `checks/nx-affected.txt` |

### Lệch với Self-QC

- **EC01:** `self-qc.md:44` ghi “Cần lưu ý đã báo PO”. QC thấy chưa có phương án thay thế mà spec 4.7 yêu cầu, và không có bằng chứng Chromium lỗi khi bỏ `--no-sandbox` (G1).
- **Cấu hình runsc:** `self-qc.md:13` (“runsc KVM”), `report.md:13`, `:45`, `implement.md:57`–`:58` và README spike `:60` khẳng định platform KVM và seccomp mặc định của Docker. Hai điều này không có trong evidence, và profile seccomp OCI có thể không được runsc nạp (G2).
- **“18/18” ở Lần 1:** `report.md:52`–`:53` và `self-qc.md:13` ghi run-1 đạt 18/18. Run-1 được chấm bằng harness cũ: `run-1/invalid-syntax-1/result.json:17` báo dòng 2 mà vẫn `passed: true`, còn harness hiện tại (`harness.py:143`) sẽ chấm ca này trượt. `report.md` Lần 2 có nêu việc sửa vị trí dòng nhưng không nói harness đã đổi cách chấm; bộ đủ 18 ca chưa chạy trên mã cuối (G6).
- **Giấy phép:** `self-qc.md:21` ghi “0 file thiếu notice”. Đúng với `--check`, nhưng fixture và nguồn sinh ra chỉ có một dòng SPDX, thiếu khối ba dòng (G3).
- **Test supervisor:** Dev ghi 3/3 trong image dưới runsc (`self-qc.md:15`, `checks/supervisor.txt`). QC chạy lại dưới runc với image khác và GNU time của host: 3/3, và probe đột biến cho thấy test EC02 bắt được lỗi. QC không kiểm được dưới runsc.
- Còn lại khớp với lời khai: số đo, artifact, hash nguồn image, gói deploy không có spike, `nx affected`, ranh giới luồng, `add-license --check`, `update-index --check`, chữ ký commit.

### Việc còn lại, theo thứ tự phụ thuộc

Không có CRITICAL, HIGH nên không chặn merge. Trước khi merge, PR phải được cập nhật theo `main` vì đang BEHIND (ruleset đòi CI đạt trên nhánh đã cập nhật). Với các việc dưới, PO chọn bắt Dev làm trong PR này hay trong một PR sau; Dev làm qua `spec-execution-skill PID-00032`, ghi “Lần 2” trong `report.md`.

1. Ghi cấu hình runtime runsc vào evidence; nếu không có `--oci-seccomp` thì sửa câu “seccomp mặc định” ở README spike `:60`, `implement.md:57`–`:58`, `report.md:45` và `render.mjs:19` (G2).
2. Chạy một ca dưới runsc không có `--no-sandbox` và giữ evidence; bổ sung phương án thay thế cho EC01 vào `report.md` để PO chọn, hoặc ghi lời PO đồng ý `--no-sandbox` (G1, EC01). Việc này dựa trên câu mô tả lớp cách ly đã sửa ở bước 1.
3. PO quyết khối giấy phép cho fixture (G3). Nếu sửa thì gộp với bước 4, vì phải chạy lại suite.
4. Tùy PO: chạy lại đủ 18 ca trên image và harness cuối (`run-3`), thêm hash `harness.py`, `Dockerfile` vào manifest (G6, O1).
5. Bổ sung `report.md`: bảng căn cứ → câu hỏi → phép đo → kết luận (ASM-08, ADR-11, TR-04), và ba ý cho PID-00054/PID-00107 nêu ở G5 (link ngoài trong artifact, process group của Chromium, phân loại lỗi cú pháp theo từng loại sơ đồ) (G4, G5, PID-00032-AC04).

### Đề xuất cho PO

1. **Hợp đồng lệch PRD:** `DiagramType.id.examples` (`docs/api-design/components/schemas/manuscript.yaml:274`) liệt kê `class`, `er`, `gantt`, `mindmap`, khác năm loại của DIAG-TYPES-001 (`docs/overview/sections/13-diagram-agent.html:91`–`:95`); DIAG-TYPES-001-AC02 (`:81`) còn lấy Gantt làm ví dụ loại không hỗ trợ. PID-00032-AC01 dẫn tới `listDiagramTypes`, nhưng hợp đồng chỉ có ví dụ, không có danh sách chốt, nên AC mơ hồ. Đề xuất: sửa ví dụ schema theo năm loại bằng `contract-updating-skill`, hoặc ghi rõ trong AC là “năm loại PRD 13.2”.
2. **Kiến trúc 12.2 và 12:** đổi trạng thái SPK-07 (`12-decisions-risks-and-open-issues.html:81`, đang “Chưa chạy”) theo kết luận ASM-08, như Dev đề xuất. TR-04 (`:95`) có thể ghi kết quả “Chromium chạy được dưới gVisor với `--no-sandbox`”, sau khi xử lý G1, G2.
3. **Kiến trúc 9.4, độ trễ parse:** 9.4 ghi parse “< 1 s” (`09-sandbox-latex-and-diagrams.html:70`); spike đo 1,59–3,98 s cho một tiến trình Node mới, gồm khởi động jsdom và Mermaid. Đề xuất ghi thành ASM hoặc ràng buộc cho PID-00054/PID-00107 (tiến trình ấm), không coi là đã đạt.
4. **Kiến trúc 9.4, phân loại lỗi:** 9.4 chia hai lớp, “lỗi ở parse = lỗi cú pháp” và lỗi render (`:72`). Spike dùng sáu mã: `syntax_error`, `parse_error` (lỗi môi trường khi parse), `render_error`, `network_blocked`, `timeout` kèm stage, `png_fallback`. `parse_error` chưa có chỗ trong 9.4. Đề xuất mở OQ, hoặc ghi bảng ánh xạ cho PID-00107.
5. **Link ngoài trong preview:** PRD và kiến trúc chưa nói SVG/PDF giữ hay loại link ngoài (`xlink:href`, `/URI`). Đề xuất ghi OQ cho PID-00107 và luồng web (G5a).
6. **Quy tắc đường dẫn Output (PO chốt 20/11/2026):** chưa vào `main`. QC đã áp quy tắc này và không thấy lệch; cần đưa vào `spec-converge-skill` và `spec-execution-skill` khi PO cập nhật.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
