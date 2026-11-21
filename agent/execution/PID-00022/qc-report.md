# PID-00022 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 4 LOW (G1–G4). PID-00022-AC01–AC03 đạt ở mức Xây (stub, dữ liệu tổng hợp). Các LOW không đổi kết luận nào của báo cáo; Dev sửa trong PR này hoặc để PID-00072 xử lý, PO chọn (Lần 1, 21/11/2026)

- **Ticket:** [PID-00022](../../../docs/tickets/issues/PID-00022/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` và `data/` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 21/11/2026 · spec-converge-skill

Người chạy: agent QC độc lập do PO Trịnh Quang Trung giao, không mang kết luận của bên làm. Mã nguồn: PR [#53](https://github.com/toilatrung/sires/pull/53), nhánh `agent-core/spk-08-context`, commit `f329d26` (đầu PR; nhánh đã chứa `main` `1fe6d66`, gồm #51), worktree riêng ở trạng thái detached. QC đánh giá file hiện có, không dựa vào diff nhánh.

Phạm vi đã đối chiếu: AC01–AC03 (`specs/acceptance.html`, trang ticket mục 2), P1–P4, N1–N3, EC01–EC03 (`specs/scope.html`), slice S01–S03, spec mục 2–7, `designs/notes.html`; PRD 14.2 (CTX-ASSEMBLY-001, bảng 7 lớp), NFR-SCALE-001, -002, -004, ASM-04, PRD 3.3 và 8.2 (đầu vào của Discovery); kiến trúc 12 (ADR-17, dòng SPK-08, TR-09); quy tắc 1.4 (gồm 1.4.13); mã `apps/agent-core/spikes/spk-08/` (9 file); `apps/agent-core/pyproject.toml`, `project.json`; `infra/docker/python/Dockerfile`, `Dockerfile.dockerignore` (Python, Node); dữ liệu thô `agent/execution/PID-00022/data/`.

Tóm tắt đánh giá:

- **Đầu ra (1.4.13).** O1 đúng thư mục `apps/agent-core/spikes/spk-08/`, hai script đúng tên ở `acceptance.html` (`context_size.py`, `read_latency.py`); O2 đúng `agent/execution/PID-00022/report.md`. Các file thêm (`spk08_*.py`, `profile.json`, `models.json`, `README.md`, `test_spk08.py`) nằm trong O1; `data/` là tài liệu đi kèm theo `AGENT.md`. Không lệch đường dẫn hay tên.
- **Ranh giới.** PR chỉ có 18 file trong `apps/agent-core/spikes/spk-08/` và `agent/execution/PID-00022/`; không sửa `infra/` (0 dòng diff), `docs/`, file sinh tự động, migration, `uv.lock`, `pyproject.toml`. `check-tracks`: `agent-core, repo`. Đúng phương án B PO chốt 21/11/2026.
- **Không vào build sản phẩm (O1).** QC tự dựng wheel `sires-agent-core`: 30 file, chỉ `agent_core/` và `dist-info`, 0 file chứa `spike`/`spk` (`[tool.hatch.build.targets.wheel] packages = ["src/agent_core"]`). Image: `infra/docker/python/Dockerfile:12` `COPY apps/agent-core`, nhưng `Dockerfile.dockerignore` trên `main` (#51) có `apps/*/spikes` nên thư mục spike không vào build context. Bản Node cũng có dòng này. QC không dựng lại image (máy đang có phép đo của phiên khác).
- **S01 (AC01, EC01, EC02).** QC chạy lại `context_size.py`: `context_size.json` giống hệt từng byte bản đã commit, `context_size.md` giống trừ đường dẫn trong chân trang. Thứ tự cắt L7 → L6 → L5 → L4, lớp 1–3 không cắt, lớp 1–3 vượt thì `context_too_long`, khớp PRD 14.2 (CTX-ASSEMBLY-001 › Business Rules; `context_size.py:88`–`:155`). Bảng 3.2 của report khớp JSON: kích thước theo lớp, vừa/không vừa theo model, số Context Item tối đa, các bước cắt (Writing họ `gpt-5`: L5 giữ 1/50, L4 tóm tắt 19/128; Orchestrator họ `gpt-5`: bỏ 8/20 tin). `models.json`: QC đối chiếu trang chính thức ngày 21/11/2026 cho Claude 5.5 (1M, đầu ra 128K, câu “2.5M Unicode characters”), `gpt-5` (400.000, đầu vào 272.000, deprecated), `gpt-6.2-astra` (1.050.000, đầu vào 922.000), `gemini-3.8-flash` (đầu vào 1.048.576, đầu ra 65.536), `gemini-4-carbon` (1.048.576 gộp vào và ra): đều khớp. Lệch nhỏ trong câu chữ và số tóm tắt: G1, G2.
- **S02 (AC02, EC03).** Stub lấy method và path của 5 operation từ hợp đồng, khớp đúng bảng spec 2.3. Payload của cả 9 agent × 2 profile qua được schema 200; payload sai kiểu hoặc sai `format: uuid` bị từ chối. Phía đọc dùng client sinh của PID-00007. QC không chạy lại benchmark (theo chỉ đạo), mà tính lại từ `read_latency_raw.csv`: 12.000 dòng, 60 ô × 200 lượt; p50/p95/p99/max của 60 ô và p95 từng operation khớp `read_latency.json` (chênh tối đa 0,0005 ms do CSV làm tròn 3 chữ số). Bảng p95 trong report 3.3 khớp. EC03: 25/25 lượt thất bại, nêu đúng service, không có context dở dang, trung vị 503,5–505,1 ms với timeout 500 ms. Payload do mã hiện tại sinh ra bằng đúng `payload_bytes` đã ghi ở cả hai profile (10/10 operation), tức là fixture của phép đo khớp mã hiện tại (G4).
- **AC03.** `report.md:190` ghi rõ kết luận ASM-04 là **sơ bộ** vì chưa có prompt thật, và PID-00072 phải đo lại bằng prompt thật cùng count API. Không thấy chỗ Dev tự chốt thay PO: ngưỡng độ trễ để PO đặt; thay đổi PRD 14.2, 3.3 và hợp đồng đều ghi thành đề xuất (report mục 6).
- **Git.** 6 commit đều có chữ ký (`%G? = G`), tác giả `toilatrung`, không có dòng ghi công AI trong commit hay mô tả PR. CI run `44906031100` trên `f329d26`: `tracks`, `build` đạt.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-00022-AC01 · P1, B2 (lớp 1) | partial | LOW | `apps/agent-core/spikes/spk-08/profile.json:168`, `:182`, `:222`, `:243` lấy làm “định dạng đầu ra” của agent những schema Researcher gửi lên hoặc schema chỉ đọc: `PlanVersionCreate` (“Researcher tạo Draft mới”, 2 trường), `ReferenceManualCreate` (“Nhập thủ công DOI hoặc BibTeX”), `ArtifactVersionCreate` (“Researcher sửa nội dung”), `VerificationResult` (`readOnly`). QC đo: schema đầu ra 496–17.537 ký tự mỗi agent (Orchestrator 850, Reference Processing 496, Diagram 496). `profile.json:143` và `report.md:45` gọi phần này là “đo thật từ hợp đồng … 10–24 nghìn ký tự mỗi agent”, nhưng 10–24 nghìn là cả lớp 1 (`typical`: 9.933–23.827 ký tự), không phải schema. Ảnh hưởng: lớp 1 tối đa 15.255 token ước lượng ở `ceiling`, không đổi ô vừa/vượt nào | Dev ghi trong report 3.2 (Lần 2) rằng schema đầu ra là proxy (thêm vào GĐ-02 hoặc thêm GĐ mới), sửa câu “10–24 nghìn ký tự” cho đúng phần được đo. PID-00072 đo lại bằng schema đầu ra của registry (PID-00071) |
| G2 | PID-00022-AC01, AC02 · B5, B6 (số trong báo cáo) | partial | LOW | `report.md:96`: khoảng token L4 “809.620–2.156.127” bỏ sót dòng ước lượng của họ `gpt-5` (504.959; 538.361 ở `data/context_size.md`); “cận trên: tất cả” trong khi với họ `gpt-5` theo cận trên thì kết quả là L1–3 vượt (L3), không phải L4. `report.md:170`: “+ 62–67 ms” với `ceiling`, dữ liệu là 62,2–69,7 ms (69,7 ms ở trễ 10 ms). `report.md:172`: “khoảng 20 ms mỗi MB” chỉ đúng khi lấy p95 tổng chia kích thước; tính theo trung vị biên thì khoảng 10 ms/MB ((41,3 − 13,7)/2,85 MB). `report.md:190`: “7/9 agent trên các model 1M token (theo ước lượng)” chỉ đúng với Claude; với `gpt-6.2-astra` và Gemini, ước lượng cho 9/9 (phần trong ngoặc ở cùng câu thì đúng). Bảng kích thước và bảng ca vượt lệch nhau do làm tròn: Discovery `ceiling` L4 là 809.060 ở bảng kích thước, 809.620 ở bảng ca vượt (`context_size.py:91` làm tròn từng entry, `:168` làm tròn tổng). Docstring `context_size.py:202` ghi “Uses the upper bound” nhưng hàm tính cả hai cách đếm | Dev sửa các câu trên trong `report.md` (Lần 2). Tùy chọn: thống nhất cách làm tròn giữa hai bảng và sửa docstring. Không cần đo lại |
| G3 | O1 (“không vào build sản phẩm”) · spec mục 6 (test AC là “chạy tay”) | unrequested | LOW | `apps/agent-core/project.json` target `test` = `uv run pytest` trong `apps/agent-core`, không có `testpaths`, nên `spikes/spk-08/test_spk08.py` chạy cùng test của service (CI run `44906031100`: 20 passed, 1 skipped). `lint` (`ruff check .`) cũng phủ spike. `test_spk08.py:16` import `jsonschema`; `spk08_contract.py` import `referencing`. Cả hai chỉ khai trong nhóm `dev` của `sires-common` (`libs/py/sires_common/pyproject.toml:37`–`:38`), không có trong `apps/agent-core/pyproject.toml`; chạy được là nhờ `uv sync --all-packages`. `test_spk08.py:29`, `:71` dựng payload và kiểm theo `docs/api-design` hiện hành. Target `test` của agent-core không nhận `docs/api-design` làm input, nên nếu PO đổi hợp đồng (ví dụ đổi tên `PlanVersionCreate`, `ContextEntry`) thì PR hợp đồng vẫn xanh, còn PR agent-core sau đó sẽ đỏ vì spike. Lý do giữ test có ở `implement.md` mục 3 | Không chặn merge. PO chọn một trong hai: (a) giữ, chấp nhận ràng buộc trên và ghi vào README của spike; (b) loại `spikes/` khỏi target `test` của agent-core (luồng agent-core, ví dụ `--ignore=spikes` hoặc `testpaths = ["tests"]`), để smoke test thành bước chạy tay |
| G4 | O1 (“chạy lại được”) · YC2 (môi trường, dữ liệu thô) | partial | LOW | `read_latency.py:330`–`:345` `environment()` không ghi commit hay hash mã. Phép đo chạy 12:04–12:34 UTC, trước commit `07dd874` (12:49 UTC), nên dữ liệu không tự chứng minh được nó sinh từ mã nào. QC kiểm gián tiếp: S01 chạy lại cho JSON giống hệt từng byte; payload stub do mã hiện tại sinh ra bằng đúng `payload_bytes` của `read_latency.json` ở cả hai profile. Không có chênh lệch | Tùy chọn, nên làm trước khi PID-00072 dùng lại script: thêm `git rev-parse HEAD` và cờ “có thay đổi chưa commit” vào `environment()` của `read_latency.py` (và vào JSON của `context_size.py`) |

Khoảng trống LOW G1–G7 trong `self-qc.md` mục 5: QC kiểm lại và đồng ý, không ghi lặp ở đây. G2 của Dev đã được CI xác nhận: S02 bị skip vì CI không sinh client.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00022-AC01 | Đạt (kèm G1, G2) | stub, dữ liệu tổng hợp; thao tác tay, QC chạy lại | `apps/agent-core/spikes/spk-08/context_size.py › chạy tay`; `test_spk08.py › test_ac01_every_agent_has_a_size_table_and_a_verdict_per_model`, `› test_trimming_never_touches_layers_1_to_3_and_follows_prd_14_2_order`, `› test_ec01_layers_1_to_3_over_budget_give_context_too_long` | Chạy lại xong trong 4,5 s; `context_size.json` giống hệt từng byte bản commit. Có bảng token 7 lớp × 9 agent × 2 profile, và kết luận vừa/không vừa cho cả 10 model của 3 provider. Các test đạt. EC01 (ca vượt ghi agent, lớp, model; đề xuất cho PO) và EC02 (ước lượng kèm cận trên theo byte; sai số tiếng Việt chưa đo, ghi rõ) xử lý đúng scope |
| PID-00022-AC02 | Đạt (kèm G2, G4) | stub; số đo của Dev trên WSL2; QC tính lại từ dữ liệu thô và chạy smoke test | `apps/agent-core/spikes/spk-08/read_latency.py › chạy tay`; `test_spk08.py › test_ac02_ec03_read_latency_runs_end_to_end` | QC không chạy lại benchmark. p95 theo 5 mức trễ × 2 σ × 3 cách đọc × 2 payload có trong report 3.3; 240/240 thống kê tính lại từ CSV khớp JSON. Smoke test S02 trên Windows, với client sinh vào thư mục tạm: đạt (`6 passed`). EC03 25/25 lượt đúng hành vi mong đợi |
| PID-00022-AC03 | Đạt | đọc báo cáo | Báo cáo trong `agent/execution/PID-00022/` | `report.md:190`: ASM-04 “sơ bộ, kiểm lại ở PID-00072”, nêu lý do là chưa có prompt thật (lớp 1 ước lượng, registry PID-00071), chưa có định dạng render, chưa có tokenizer chính xác. Có kết luận ADR-17, TR-09 (`:191`–`:192`) và đề xuất cho Context Assembler (3.6) |

### Lệnh đã chạy

Máy PO, Windows 11. Lệnh Python chạy bằng interpreter gốc của uv (`cpython-3.12.16`) với `site.addsitedir(<worktree>/.venv/Lib/site-packages)` + `runpy`, trừ các lệnh ghi rõ là qua `uv run`/Nx. Client sinh (`sires_common.generated`) QC dựng vào thư mục tạm của phiên, không ghi vào worktree, rồi nối vào `sires_common.__path__` lúc chạy. Không lệnh nào sửa file đã theo dõi trong worktree; `git status` sạch trước khi ghi file này.

| Lệnh | Kết quả |
| --- | --- |
| `uv sync --all-packages --frozen --offline` | Đạt (dùng cache, không tải gì) |
| `pnpm install --frozen-lockfile --prefer-offline` | Đạt (`Done in 31.5s`) |
| `ruff check .` trong `apps/agent-core` (có `spikes/`) | `All checks passed!` (ruff 0.17.4). `ruff check spikes/spk-08`: đạt. `ruff format --check` báo 6 file chưa định dạng, nhưng CI không kiểm format nên không tính là khoảng trống |
| `pytest spikes/spk-08 -v` (chưa có client sinh) | `5 passed, 1 skipped` (S02 skip đúng thiết kế, `test_spk08.py:80`) |
| `pytest spikes/spk-08 -v` (có client sinh, dựng bằng `generate.mjs` `mode: 'python'` vào thư mục tạm) | `6 passed in 15.87s` |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --skip-nx-cache` | Chỉ `agent-core` bị ảnh hưởng (không có target `build`). `agent-core:lint`: `All checks passed!`. `agent-core:test` (`uv run pytest`): `20 passed, 1 skipped`, gồm test migration và DDL qua Testcontainers, khoảng 40 s quanh 12:58–13:00 UTC; xem ghi chú dưới bảng. `agent-core:typecheck`: không chạy — `Failed to spawn: mypy`, “An Application Control policy has blocked this file” (Smart App Control) |
| `mypy src` trong `apps/agent-core` (runner) | `Success: no issues found in 27 source files` |
| `mypy` strict trên `spikes/spk-08` (cấu hình gốc repo) | Không có client sinh: 12 lỗi, tất cả là `import-not-found` của `sires_common.generated.*` ở `read_latency.py:50`–`:62`. Có client sinh (đặt vào `MYPYPATH`): 0 lỗi trong 7 file của spike; 26 lỗi còn lại nằm trong mã sinh (thiếu stub `dateutil`) do cách QC đưa mã sinh vào, không thuộc PR |
| `context_size.py --out <tạm>` | 4,5 s; `cmp` với `data/context_size.json`: giống hệt; `context_size.md` giống trừ chân trang |
| Tính lại thống kê từ `data/read_latency_raw.csv` (script QC) | 12.000 dòng, 60 ô × 200; p50/p95/p99/max của 60 ô và p95 của 5 operation khớp `read_latency.json` (≤ 0,0005 ms); EC03 25 dòng, đều `failed`, nêu đúng service, không có context dở dang |
| Kiểm payload stub (script QC): `build_payloads` cho 9 agent × 2 profile; 3 ca âm; so `payload_bytes` | 18/18 hợp lệ. Sai kiểu `layer` và sai `uuid` bị từ chối; thuộc tính thừa được nhận vì schema không đóng `additionalProperties`. Kích thước payload khớp `read_latency.json` ở 10/10 operation |
| `uv build --offline --package sires-agent-core --wheel` | `sires_agent_core-0.0.0-py3-none-any.whl`, 30 file, 0 file spike |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: agent-core, repo` |
| `node scripts/docs/add-license.mjs --check` | Script báo các file trong `.ruff_cache`, `.pytest_cache`, `.mypy_cache`. Đó là cache do lệnh của QC tạo, không thuộc PR. Xoá cache rồi chạy lại, kể cả sau khi đã ghi file này: `0 file chưa có thông báo giấy phép.` Khối giấy phép ba dòng của 7 file `.py` giống hệt `apps/agent-core/src/agent_core/main.py`; chân trang của 6 file `.md` đúng khung, đường dẫn `LICENSES.md` đúng độ sâu. `.json`, `.csv` không có cú pháp chú thích nên script bỏ qua |
| `node scripts/docs/update-index.mjs --check` | `docs/tickets/issues: khớp (159 thư mục PID); agent/execution/taskboard.html: khớp`; `docs/index.html đã khớp` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00022` | `ĐỦ để thực thi (1 cảnh báo)`: cảnh báo trạng thái “Xong — chờ QC”, đúng tình trạng |
| `check-pid.mjs PID-00022 --result` | `PID-00022: KẾT QUẢ ĐỦ (0 cảnh báo).` |
| `gh pr checks 53`; `gh run view 44906031100 --log` | `build` pass, `tracks` pass trên `f329d26`. CI: `agent-core:lint` đạt (có spike), `typecheck` (`mypy src`, không gồm spike) đạt, `test` `20 passed, 1 skipped` (S02 skip) |
| Kiểm chữ ký và ghi công: `git log --format='%G? %an'`, mô tả PR | 6/6 commit `G`, tác giả `toilatrung`; không có `Co-Authored-By` hay “Generated with” |
| Không chạy: `read_latency.py` với tham số mặc định; `docker build` image | Theo chỉ đạo: máy đang có phép đo cold start SPK-06 của phiên khác. QC kiểm bằng dữ liệu thô và kiểm tĩnh `Dockerfile.dockerignore` |

Ghi chú: lệnh `nx affected` ở spec mục 6 chạy cả test migration và DDL của agent-core qua Testcontainers, tức là mở một container PostgreSQL khoảng 40 s (12:58–13:00 UTC) trong lúc phiên SPK-06 đang đo trên cùng Docker Engine. Ryuk đã dọn container. Nếu số đo SPK-06 trong khung giờ này có nhiễu, đây là một nguyên nhân có thể.

### Lệch với Self-QC

- **`agent-core:test` trên Windows.** `self-qc.md:16` ghi “không chạy — … bị Smart App Control chặn”. Lần này QC chạy được qua Nx (`uv run pytest`: 20 passed, 1 skipped); chỉ `mypy` bị chặn. Đây là khác biệt của môi trường, không phải lỗi của Dev.
- **Lớp 1.** `report.md:45` và `profile.json:143` ghi schema đầu ra “đo thật từ hợp đồng … 10–24 nghìn ký tự mỗi agent”. QC thấy một số schema là body Researcher gửi lên hoặc schema chỉ đọc, chỉ 0,5–17,5 nghìn ký tự; 10–24 nghìn là cả lớp 1 (G1).
- **Số tóm tắt trong report.** Năm chỗ lệch nhỏ so với dữ liệu ghi ở G2; Self-QC không nêu.
- **“Không thêm phụ thuộc”** (`implement.md:10`). Đúng với `pyproject.toml`. Nhưng test của spike nằm trong target `test` của agent-core và cần `jsonschema`, `referencing`, hai gói chỉ khai ở nhóm `dev` của `sires-common`, đồng thời gắn target này với `docs/api-design` (G3). Self-QC G4 chỉ ghi “thêm `test_spk08.py`”.
- **Truy vết mã đã đo.** Self-QC không nêu việc dữ liệu đo không ghi commit (G4). QC đã kiểm gián tiếp, không thấy lệch.
- **Mức tổng.** Dev kết luận 0 CRITICAL, 0 HIGH. QC đồng ý, và thêm 4 LOW.
- Các kết quả khác Dev khai (wheel 30 file, `check-tracks`, `add-license`, `update-index`, `check-pid --result`, `ruff`, `mypy src`, bảng số S01 và S02, EC03) QC chạy lại hoặc tính lại đều khớp.

### Việc còn lại, theo thứ tự phụ thuộc

Không có việc chặn merge.

1. Tùy chọn trong PR này (Dev, `spec-execution-skill PID-00022`, ghi “Lần 2” trong `report.md`): sửa câu lớp 1 (G1) và các số tóm tắt (G2) trong `report.md`; sửa docstring `context_size.py:202`.
2. PO quyết có giữ smoke test của spike trong `agent-core:test` hay không (G3). Nếu bỏ, Dev agent-core sửa cấu hình test của agent-core trong PR riêng hoặc ngay PR này.
3. Trước khi PID-00072 dùng lại script: ghi commit vào dữ liệu đo (G4); dùng schema đầu ra thật của registry PID-00071 cho lớp 1 (G1).

### Đề xuất cho PO

- **NFR-SCALE-004 có rủi ro ở mức trần.** Report chỉ kết luận theo ASM-04. NFR-SCALE-004 yêu cầu Agent Run “không lỗi do vượt giới hạn trên project theo NFR-SCALE-001”, nhưng kết quả trần cho thấy lớp 3 (350 Context Item theo GĐ-04) làm `context_too_long` với họ `gpt-5` theo cận trên, ở cả 9 agent. Họ `gpt-5` đã deprecated; với model 1M token, ngưỡng là khoảng 640–3.300 item. Khi xử lý đề xuất 1–3 ở report mục 6, PO cân nhắc mở OQ cho giới hạn lớp 3 và cho cách chống trùng của Discovery, Reference Processing, vì cả hai đổi hành vi PRD 14.2, 3.3, 8.2.
- **Tài liệu sau khi merge (PO ghi, `docs/`).** Kiến trúc 12 vẫn ghi SPK-08 “Chưa chạy”, TR-09 “đo ở SPK-08”. PO cập nhật trạng thái và dẫn tới report này khi nghiệm thu.
- **Khung spec cho spike.** Spec mục 2.5 (`pnpm local:up`, `pnpm nx run agent-core:dev`) và mục 4.6 (“Gọi model qua Model Gateway; prompt theo registry”) là câu khung, không áp dụng cho spike chỉ dùng stub và không gọi model (Dev ghi ở Self-QC G5). Đề xuất `spec-docs-skill` bỏ các dòng này khi ticket là spike chỉ dùng stub. Đây không phải lỗi của PR.
- **Spike trong target test của service (G3).** Nên có một quy ước chung cho mọi `apps/*/spikes/`: smoke test của spike có chạy trong target `test` của service hay không. Trên `main`, `knowledge:test` (`uv run pytest` trong `apps/knowledge`) cũng đang chạy test của `apps/knowledge/spikes/spk_04/` (`test_isolation.py`, `test_seed.py`).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
