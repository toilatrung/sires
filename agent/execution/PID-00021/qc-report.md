# PID-00021 — Báo cáo QC độc lập

**Kết luận mới nhất:** Merge được PR #118 — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW mới (Lần 3, 27/11/2026). G9 đóng theo D-KEY (PO 26/11/2026: key cổng trung gian PO tự cấp được dùng để test, phát triển): key của một kết nối chỉ gửi tới base URL của chính nó, endpoint chính thức chỉ nhận key chính thức riêng. Lệnh `set-provider-keys.ps1` ghi file key ngoài Git; SPK-01 đọc file. QC sửa một lỗi nhỏ (chạy lại script làm mất dòng `SPK01_MODEL_*`) ở `4e334f2`. Không lộ key hay host trong lịch sử nhánh, mô tả, comment. G1, G2 (HIGH, EC01), G4 (MEDIUM) của Lần 1 vẫn như quyết định PO 21/11/2026.

- **Ticket:** [PID-00021](../../../docs/tickets/issues/PID-00021/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` và `evidence/` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 21/11/2026 · spec-converge-skill

Người chạy: QC độc lập do phiên PO giao (không mang kết luận của Dev). Mã nguồn: nhánh `agent-core/spk-01-providers`, commit `679a714`; merge-base với `origin/main` là `1fe6d66` (đã gồm #51). PR #55 → `main`.

Phạm vi đã đối chiếu gồm:

- AC01–AC05 (`specs/acceptance.html`); P1–P6, N1–N2, EC01–EC04 (`specs/scope.html`); slice S01–S03; spec mục 2–7; `designs/notes.html`.
- PRD 8.6: bảng thành phần chuẩn hóa, 11 mã lỗi và phân loại thử lại; AGENT-PROVIDER-002.
- ASM-02, ASM-03, ASM-10 (PRD 20.2); ADR-08 và dòng SPK-01 (kiến trúc 12); kiến trúc 8.4, 8.5, 8.6.
- Mã `apps/agent-core/spikes/spk-01/` (12 file), `apps/agent-core/pyproject.toml`, YC1 (`AGENT.md`, `scripts/development/README.md`, `setup-windows.ps1`, `setup-wsl.sh`) và 24 file evidence.

Tóm tắt đánh giá:

- **EC01 xử lý đúng cách ticket quy định.** Trạng thái ticket và slice S01 ghi “Bị chặn”/“Chặn … chờ key chính thức (EC01)” (`report.md:3`, `:23`). Provider còn lại vẫn được đo. Báo cáo không kết luận ASM-02 cho Claude, Gemini (`report.md:167`). `capabilities.py:233` ghi “Bị chặn — chờ key” khi thiếu key; `--fail-fast` dừng adapter sau lời gọi đầu bị chặn (evidence `capabilities/anthropic-claude-haiku-4-5/`, HTTP 503, không có kênh Claude). Có một chỗ chưa nhất quán: OpenAI cũng không có key chính thức, nhưng báo cáo coi phép đo qua cổng là kết luận cho OpenAI (G3).
- **Số liệu khớp dữ liệu thô.** QC tính lại từ `results.jsonl`:
  - Bảng S01 lượt a–e: kết quả từng phép thử, số mảnh stream, TTFT, số vòng và tool call đều khớp.
  - Bảng ánh xạ lỗi: 17/19, 17/19, 17/18, 17/19 khớp đúng, cùng 4 dòng lệch (3 dòng `model_not_found` qua cổng ra 503, 3 dòng burst không gây được 429).
  - Bảng S03: 15 dòng, lời gọi, token, thời gian đều khớp.
  - Chi phí: gpt-4.1-nano 154 lời gọi, 21 630/3 458 token, khớp; gemini-2.5-flash-lite 9 113/1 397 token khớp, nhưng chỉ 69 lời gọi có usage chứ không phải 72 (G5). USD tính lại theo giá niêm yết ≈ 0,0035 + 0,0015 = 0,005, khớp.
  - Base URL: cổng ↔ proxy tương đương 15/16 nếu so mã kết quả, khớp.
  - Còn ba chỗ báo cáo diễn đạt lệch số liệu (G5).
- **Cách ly mã spike đạt.**
  - Wheel 30 file, sdist 46 file, 0 file spike (QC tự dựng bằng `uv build --offline`).
  - Image: dựng thử `COPY apps/agent-core` với `Dockerfile.dockerignore` của `main` (#51) cho 0 file spike; đối chứng bỏ dockerignore cho 12 file.
  - `src/` không import module nào của spike; `find_spec` với `sys.path` = `apps/agent-core/src` không thấy module nào; spike không có `__init__.py`.
  - `uv.lock` không đổi (`uv lock --check` đạt); `infra/` 0 file trong diff.
- **YC1, YC2 đúng lời PO, không phá gì.**
  - YC1: quy tắc thêm vào `AGENT.md` (Quy tắc bắt buộc), `scripts/development/README.md`, đầu `setup-windows.ps1`, `setup-wsl.sh`, đúng ý PO: cài được trên PowerShell thì cài trên Windows, chỉ dùng WSL khi cần Linux, gói mới vào script cài trong cùng PR. `AGENT.md` trên `origin/main` chưa có quy tắc này; dòng bản đồ thư mục (`AGENT.md:41`, “công cụ trên Windows, Docker Engine trong WSL”) không mâu thuẫn. `-Spikes` có một lỗi nhỏ (G7).
  - YC2 theo quyết định B: PR không sửa `infra/`.
  - `check-tracks` cảnh báo 2 luồng (agent-core, infra) cộng `repo`. YC1 có lời PO nên không tính là khoảng trống.
- **Bảo mật (repo public) đạt.**
  - Không lộ host hay URL của cổng trung gian, xét cả diff cuối, patch của từng commit trên nhánh và mô tả PR #55. Mọi URL và hostname tìm thấy chỉ gồm endpoint chính thức (`api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`), trang tài liệu (`docs.anthropic.com`, `platform.openai.com`), `github.com`, `ghcr.io`, `127.0.0.1`, host giả `spk01-unresolvable.invalid` và placeholder `[gateway-host]`. Không có IP lạ.
  - Không có chuỗi dạng key (`sk-`, `sk-ant-`, `AIza`, `Bearer …`, token dài).
  - `scan_secrets.py` trên 44 file của diff, với 3 key trong môi trường: 0 chỗ khớp.
  - Evidence chỉ ghi method, path, status của proxy, không ghi header.
  - Còn hai điểm vệ sinh mức LOW (G8, G9).
- **Commit:** 9 commit có chữ ký (`%G? = G`), tác giả `toilatrung`; không có trailer ghi công AI trong commit hay mô tả PR. CI của PR trên đúng `679a714`: `build` (gồm `nx affected -t lint typecheck test build`) và `tracks` đạt.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-00021-AC01, AC02; ASM-02, ASM-10; EC01 | partial | HIGH (chặn ngoài, EC01) | `evidence/capabilities/anthropic-claude-haiku-4-5/results.jsonl:2` (HTTP 503 không có kênh Claude); `evidence/capabilities/google-gemini-2.5-flash-lite/results.jsonl`, `openai-api-gemini-2.5-flash-lite/results.jsonl` (cổng bỏ cấu hình structured output, hết giờ, từ chối `strict`); `report.md:167` | PO cấp key chính thức Anthropic, Google AI Studio (hoặc key cổng có kênh Claude và giữ nguyên tham số); Dev chạy Lần 2 `capabilities.py` cho Claude, Gemini, không cần sửa mã |
| G2 | PID-00021-AC03; ASM-03 (kiểm “với endpoint chính thức và một endpoint tùy chỉnh”); EC01 | partial | HIGH (chặn ngoài, EC01) | `evidence/base_url/results.jsonl:1`–`:4` (`official`: `auth_failed` cả 16 phép thử, với key của cổng); `evidence/base_url/summary.md` | Có key chính thức thì chạy Lần 2 `base_url.py compare`, để proxy chuyển tiếp tới endpoint chính thức như P3 |
| G3 | PID-00021-AC01, AC02; EC01 (“chưa kết luận ASM cho provider đó”) | partial | MEDIUM | Có ba điểm. (1) `report.md:3` và `:173` chỉ nêu thiếu key chính thức Anthropic, Google; OpenAI cũng không có key chính thức (`evidence/base_url/results.jsonl:2`–`:3` `official` 401 `invalid_api_key`; mọi lượt S01 ghi `"endpoint": "cổng trung gian"`). (2) `report.md:16`, `:167` (“ASM-02 … Đạt với OpenAI”) và `:168` (“Token: đạt với OpenAI”) chỉ dựa trên phép đo qua cổng. (3) `report.md:62` khẳng định “cổng chuyển nguyên tham số tới OpenAI” mà không có phép đo nào chứng minh; với Gemini qua cùng cổng, báo cáo lại quy kết quả xấu cho cổng (`:64`): hai provider bị xét theo hai chuẩn khác nhau | Dev sửa chữ trong báo cáo: OpenAI “đạt qua cổng trung gian (gpt-4.1-nano), chưa xác nhận trên endpoint chính thức”, và thêm OpenAI vào danh sách chờ key của EC01. Một cách khác là PO chốt rõ rằng phép đo qua cổng được tính là bằng chứng cho OpenAI. Cần làm trước khi PO ghi ASM-02, ASM-10 vào kiến trúc 12.2 |
| G4 | PID-00021-AC04; PRD 8.6 (11 mã); kiến trúc 8.4 | partial | MEDIUM | (1) HTTP 400 không thuộc bảng (cổng từ chối `strict`, tham số hay schema bị từ chối) ra `unmapped`, không nằm trong 11 mã: `adapters.py:250`, `:275`, `:326`; `evidence/capabilities/openai-api-gemini-2.5-flash-lite/results.jsonl`. (2) `map_exception` xét HTTP status trước mã trong thân, nên 503 kèm thân `code: model_not_found` ra `provider_unavailable`, `retryable: true` (thử lại sai): `adapters.py:214`, `:247`, `:272`; `evidence/errors/results.jsonl:18`, `:37`, `:56`, `:74` | PO quyết câu hỏi đề xuất ở `report.md` mục 6, ý 5 (cấp mã OQ, cập nhật PRD 8.6). PID-00070 áp quy tắc “mã trong thân ưu tiên hơn status” (đề xuất ở `report.md` mục 6, ý 4). Spike giữ nguyên để đúng số đo |
| G5 | O2 (“kết quả, số đo”); AC02, AC05 | partial | LOW | (1) `report.md:143` ghi Pydantic AI, LangGraph chạy “cùng số lời gọi và token”, nhưng token khác nhau: 1 296–1 506 vào, 174–193 ra (`evidence/frameworks/results.jsonl:7`–`:15`). (2) `report.md:158` ghi Gemini “72 lời gọi có usage”, dữ liệu thô chỉ có 69: 3 lời gọi burst hết giờ không có usage (`evidence/errors/results.jsonl:75`). (3) `report.md:57`–`:58`, lượt d và e, ghi usage không stream “có”, trong khi `evidence/capabilities/google-gemini-2.5-flash-lite/summary.md:3` và `openai-api-gemini-2.5-flash-lite/summary.md:3` ghi “không đủ”, vì lời gọi lỗi không có usage | Dev sửa ba câu cho khớp dữ liệu, ví dụ “có (ở lời gọi thành công)” |
| G6 | O1 (“chạy lại được theo hướng dẫn trong báo cáo”) | partial | LOW | `frameworks.py:477` mặc định ghi vào `evidence/frameworks-<platform>/`. Lệnh chạy lại ở `report.md:45` và `README.md:43` (“Evidence ghi vào `evidence/<script>/`”) không có `--out`; evidence đã nộp lại nằm ở `evidence/frameworks/` | Đổi mặc định thành `evidence/frameworks`, hoặc ghi `--out` vào lệnh chạy lại |
| G7 | YC1 (gói mới cài bằng script, “máy khác phải dựng lại được”) | partial | LOW | `scripts/development/setup-windows.ps1:192` băm nguyên byte của `requirements.txt`. Checkout có `core.autocrlf=true` (mặc định của Git for Windows) cho file CRLF, mã băm khác dấu cài ghi từ bản LF. QC chạy `-Check -Spikes` trên worktree mới: báo `[cần]` dù gói đã cài (dấu cài bằng SHA-256 của blob LF). Lần chạy thường sẽ xóa thư mục rồi tải lại khoảng 80 MB | Chuẩn hóa xuống dòng trước khi băm, hoặc ghim `eol=lf` cho `apps/*/spikes/*/requirements.txt` trong `.gitattributes` |
| G8 | NFR-OBS-002; repo public | partial | LOW | Evidence còn 9 request id do cổng sinh và tên nhóm tài khoản trên cổng, nằm trong thông báo lỗi: `evidence/capabilities/anthropic-claude-haiku-4-5/results.jsonl:2`; `evidence/errors/results.jsonl:17`, `:18`, `:36`, `:37`, `:55`, `:56`, `:73`, `:74`. Đây không phải host hay key, nhưng nhà vận hành cổng dùng được để đối chiếu tài khoản, và định dạng thông báo cho đoán được phần mềm của cổng | Tùy PO: thêm vào `redact()` (`common.py:119`) quy tắc che `request id: …` và tên nhóm, rồi sinh lại evidence ở Lần 2 |
| G9 | SCOPE-13 (key chỉ dùng cho kết nối của nó); kiến trúc 8.2 | partial | LOW | `base_url.py:499` `probe(variant, key, None)` luôn gửi key trong biến môi trường tới endpoint chính thức, kể cả khi `SPK01_BASE_URL_*` trỏ cổng. Key của cổng vì vậy đã gửi tới ba endpoint chính thức (bị từ chối 401/400) | Không chặn spike. Ghi cho PID-00070: Gateway chỉ gửi key của một Provider Connection tới base URL của chính kết nối đó |
| G10 | EC03; PID-00021-AC04 (vượt giới hạn) | partial | LOW | Burst 50 lời gọi không gây được 429 (`evidence/errors/results.jsonl:19`, `:38`, `:75`). 429, 402 `billing_error`, 529 chỉ kiểm bằng thân lỗi giả do chính Dev viết theo tài liệu (`base_url.py:122`), nên phép thử ánh xạ tự khớp với chính nó | Đúng cách EC03 cho phép. Khi có key bậc thấp thì kiểm 429 thật; không thử trên key dùng chung |

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00021-AC01 | Một phần: do EC01 (G1) và do Dev (G3) | thao tác tay; QC đối chiếu `results.jsonl` | `apps/agent-core/spikes/spk-01/capabilities.py › chạy tay` | QC không chạy (gọi API thật). Evidence lượt a–e khớp bảng S01. OpenAI (Chat, Responses) đạt mọi phép thử với cả ba biến thể schema, nhưng chỉ qua cổng. Claude bị chặn (503). Gemini qua cổng: tool calling và output tool đạt, structured native không đạt (cổng). Kết luận ASM-02 cho OpenAI cần sửa chữ (G3) |
| PID-00021-AC02 | Một phần: do EC01 (G1), do Dev (G3, G5) | thao tác tay | `capabilities.py › chạy tay` | Có bảng trường usage cho bốn định dạng API (Chat, Responses, Messages, `generateContent`), đọc qua cổng. Chi phí không có trong phản hồi; `no_data` đã kiểm (`errors` › `no_usage`, QC chạy lại offline: đạt). Chưa xác nhận trên endpoint chính thức |
| PID-00021-AC03 | Một phần: do EC01 (G2) | thao tác tay | `apps/agent-core/spikes/spk-01/base_url.py › compare` | QC không chạy (gọi API thật). Evidence: ba SDK nhận base URL có tiền tố đường dẫn; cổng ↔ proxy cục bộ tương đương 15/16. Endpoint chính thức `auth_failed` 16/16, nên chưa so được với endpoint chính thức |
| PID-00021-AC04 | Đạt, kèm G4 và G10 (EC03) | thao tác tay; QC chạy lại phần lỗi giả offline | `apps/agent-core/spikes/spk-01/errors.py › chạy tay` | Có bảng ánh xạ của từng provider sang 11 mã PRD 8.6. Key sai là lời gọi thật trên endpoint chính thức của cả ba (Gemini: 400 `API_KEY_INVALID` ra `auth_failed`). Hết giờ là thật phía client, cộng phần giả qua proxy. Vượt giới hạn theo EC03. QC chạy `errors.py --only proxy` (không mạng ra ngoài, không key): 48/48 khớp mã mong đợi, đúng như evidence |
| PID-00021-AC05 | Đạt | thao tác tay; QC chạy lại biến thể `fake` offline | Báo cáo trong `agent/execution/PID-00021/` (`frameworks.py`) | Hai framework chạy trên cùng vòng với 4 adapter (adapter “anthropic” là API dạng Anthropic của cổng, model gpt-4.1-nano), cộng kịch bản giả. Đề xuất Pydantic AI có 4 lý do bám ADR-08 và kiến trúc 8.1, 8.5; chi phí đã tiêu ước tính 0,005 USD (khớp dữ liệu). QC chạy `frameworks.py --variants fake`: plain, pydantic-ai, langgraph đều đạt, 4 lời gọi, 3 tool call, 40/20 token, khớp evidence. Mỗi ô chỉ chạy 1 lần, có ghi rõ |

Edge case: EC01 xử lý đúng (xem tóm tắt; phần OpenAI ở G3). EC02 đã xử lý: báo cáo ghi rõ năng lực không có, đề xuất output tool làm đường dự phòng cho mọi adapter. EC03 xử lý đúng: ghi “không gây được”, dùng định dạng tài liệu (G10). EC04 đạt: `redact()` và `scan_secrets.py` cho 0 chỗ khớp, không lộ host (G8, G9 là vệ sinh).

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `git diff --name-only origin/main...HEAD` | 44 file, đúng phạm vi đã nêu; `docs/` 0 file, `infra/` 0 file, `uv.lock`/`pnpm-lock.yaml`/`package.json` 0 file |
| Tìm URL, hostname, IP, chuỗi dạng key trong diff cuối và trong `git log -p` mọi commit của nhánh, cùng mô tả PR #55 | Không có host lạ ngoài danh sách chính thức ở trên; IP chỉ có `127.0.0.1`; 0 chuỗi dạng key; host cổng chỉ xuất hiện dạng `[gateway-host]` |
| `run.ps1 scan_secrets.py <44 file của diff>` | “Đã quét 44 file với 3 key trong môi trường (anthropic, openai, google): 0 chỗ khớp”, exit 0. Script chỉ in file và dòng, không in giá trị |
| `frameworks.py --variants fake --out <scratchpad>`, qua wrapper bỏ mọi biến `*_API_KEY`, `SPK01_BASE_URL_*` khỏi môi trường và tắt đọc registry | Đạt: plain, pydantic-ai, langgraph đều `ok=True calls=4 tools=3`; import 3,75 s, 4,59 s; 17 và 38 gói, như evidence |
| `errors.py --only proxy --out <scratchpad>`, cùng wrapper | 48/48 khớp mã mong đợi (12/12 mỗi adapter); chỉ gọi proxy cục bộ, không có lời gọi ra ngoài |
| Tính lại bảng từ `evidence/*/results.jsonl` (node) | Khớp `summary.md` và bảng trong `report.md`, trừ các chỗ ở G5 |
| `uv build --package sires-agent-core --wheel --sdist --offline` | Wheel 30 file, sdist 46 file, 0 file spike |
| Dựng thử image trong WSL Docker 29.8.2: `FROM ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` + `COPY apps/agent-core apps/agent-core`, với `Dockerfile.dockerignore` của `main` | `spike files: 0` (44 file agent-core); đối chứng không có dockerignore: `spike files: 12` |
| `find_spec` cho `adapters`, `capabilities`, `base_url`, `errors`, `frameworks`, `loop`, `common`, `scan_secrets`, `spikes`, `agent_core.spikes`, với `sys.path` = `apps/agent-core/src`, Python gốc, `-E -s`; `git grep` import trong `src/`, `tests/`, `libs/py` | Không module nào tìm thấy; 0 import |
| `uv lock --check --offline` | Đạt (“Resolved 89 packages”) |
| `setup-windows.ps1 -Check -SkipWsl -SkipDeps -Spikes` (chỉ kiểm, không cài) | Exit 1: báo `[cần] spk-01` dù gói đã cài, do mã băm CRLF/LF (G7) |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: agent-core, infra, repo`; cảnh báo 2 luồng (YC1, có lời PO) |
| `node scripts/docs/add-license.mjs --check` | “0 file chưa có thông báo giấy phép” (trước khi thêm file này) |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard khớp) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00021` | “ĐỦ để thực thi (0 cảnh báo)” |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00021 --result` | “KẾT QUẢ ĐỦ (0 cảnh báo)”; trạng thái “Bị chặn — EC01 …” |
| `gh pr checks 55`, `gh run view 44908484510` | CI `pull_request` trên `679a714`: `build` success (gồm `add-license --check`, `update-index --check`, `nx affected -t lint typecheck test build`), `tracks` success |
| `git log --format='%G? %(trailers)' origin/main..HEAD` | 9/9 commit có chữ ký `G`, không có trailer |
| `pnpm nx run agent-core:test`, `pnpm nx affected -t lint typecheck test build` (máy cục bộ) | Không chạy: worktree QC không có `node_modules`, `.venv`, và Smart App Control chặn `.exe` trong `.venv`. Dùng kết quả CI thật trên đúng commit ở dòng trên |
| `capabilities.py`, `base_url.py compare`, phần lời gọi thật của `errors.py`, `frameworks.py` với provider thật | Không chạy: gọi API provider hay cổng trung gian thật (tốn tiền, cần PO duyệt). Kết luận AC01–AC03 dựa trên evidence của Dev, QC đã đối chiếu dữ liệu thô |

### Lệch với Self-QC

- **ASM-02, ASM-10 cho OpenAI.** Self-QC ghi AC01 “OpenAI (Chat, Responses) đạt mọi phép thử”; `report.md` kết luận “Đạt với OpenAI”, chỉ xem key chính thức Anthropic, Google là thiếu. QC thấy key chính thức OpenAI cũng không có, phép đo OpenAI chỉ qua cổng, nên kết luận cần ghi đúng mức (G3).
- **Script `-Spikes`.** Self-QC ghi `setup-windows.ps1 -Spikes -SkipDeps -Yes` đạt. QC thấy trên worktree mới (CRLF) `-Check` báo chưa cài và lần chạy thường sẽ cài lại (G7).
- **Image trước #51.** Self-QC ghi có 14 file spike. Đối chứng của QC có 12 file, đúng 12 file theo dõi; chênh lệch có lẽ do file không theo dõi trong thư mục làm việc của Dev. Kết luận sau #51 giống nhau: 0 file.
- **Bảng S01 lượt d, e.** Usage không stream ghi “có”; `summary.md` do chính script sinh ghi “không đủ” (G5).
- **EC04.** Self-QC ghi đã giải quyết; QC đồng ý (0 key, 0 host). QC thêm hai điểm vệ sinh mức LOW mà self-QC không nêu (G8, G9).
- **Lệnh Self-QC ghi không chạy được vì SAC** (`typecheck`, `test`): CI trên đúng HEAD đã chạy và đạt.
- **Còn lại khớp:** G1, G2 (HIGH, EC01), G4 (MEDIUM), G3 của Self-QC (EC03; ở đây là G10), G6 của Self-QC (YC1, YC2 có lời PO).

### Việc còn lại, theo thứ tự phụ thuộc

1. Dev sửa chữ trong `report.md` về kết luận ASM-02, ASM-10 cho OpenAI và danh sách chờ key của EC01 (G3, PID-00021-AC01, AC02). Hoặc PO chốt rằng phép đo qua cổng được tính cho OpenAI. Làm trước khi PO ghi kiến trúc 12.2.
2. Dev sửa ba chỗ số liệu diễn đạt lệch trong `report.md` (G5).
3. Dev sửa mặc định `--out` của `frameworks.py` hoặc lệnh chạy lại (G6, O1).
4. Tùy PO: Dev che request id và tên nhóm của cổng trong `redact()`, sinh lại evidence ở Lần 2 (G8).
5. Luồng của YC1 sửa mã băm của `-Spikes` để không phụ thuộc kiểu xuống dòng (G7); làm trong PR này hoặc ở PR riêng, PO chọn.
6. PO quyết câu hỏi HTTP 400 không thuộc 11 mã chuẩn (G4, `report.md` mục 6, ý 5). PID-00070 áp quy tắc mã trong thân ưu tiên hơn status (G4) và chỉ gửi key tới base URL của kết nối (G9).
7. Khi PO cấp key chính thức: Dev chạy Lần 2 `capabilities.py`, `base_url.py compare` (và `errors.py` phần thật) cho Claude, Gemini, OpenAI trên endpoint chính thức, rồi cập nhật kết luận ASM-02, ASM-03, ASM-10 (G1, G2, PID-00021-AC01–AC03).
8. Tùy chọn: kiểm 429 thật bằng key bậc thấp riêng (G10, EC03).

### Đề xuất cho PO

- **Merge PR #55 khi kết luận mới có một phần là quyết định của PO**, QC không chốt thay. Ngoài EC01 không có CRITICAL hay HIGH; G3 chỉ là sửa chữ, nên sửa trước khi merge để báo cáo không ghi quá mức bằng chứng. Có hai hướng:
  - Merge ngay: ticket giữ “Bị chặn — EC01”; kiến trúc 12.2 ghi SPK-01 “Đã chạy một phần”; Lần 2 làm trên nhánh mới khi có key.
  - Giữ PR tới khi có key chính thức.
- **PID-00070 đang chờ PID-00021.** PO quyết PID-00070 có được bắt đầu trên kết luận một phần không. Phần adapter, ánh xạ lỗi, đề xuất framework đã dùng được; phần năng lực Claude, Gemini trên API chính thức thì chưa.
- **EC01 viết cho trường hợp “chưa có key của một provider”**, chưa lường tới key cổng trung gian thay cho ba hãng. PO nên chốt key cổng có được tính là “key của provider” không, vì điều này quyết định G3.
- **Câu hỏi đề xuất ở `report.md` mục 6, ý 5** (HTTP 400 không thuộc 11 mã chuẩn) cần PO cấp mã OQ theo `docs/docs_context.md` (G4).
- **Spec mục 2.5, H1** ghi chạy trên Linux hoặc WSL2. Dev chạy trên Windows theo quy tắc YC1 PO vừa chốt, và đường chạy Linux trong `README.md` của spike chưa ai chạy. PO xem có cần ghi lại H1 cho spike không cần Docker.
- **Đề xuất của Dev cho kiến trúc 8.2, 8.3, 8.4, 12.2 và PRD AGENT-PROVIDER-002** (`report.md` mục 6) có căn cứ trong evidence. Ghi vào `docs/` là việc của PO.

## Lần 2 — 21/11/2026 · kiểm G3 và ghi quyết định PO

Người chạy: phiên do PO giao; cũng là phiên đã sửa G3 theo lệnh PO, nên lần này không phải QC độc lập đầy đủ: chỉ kiểm G3 và ghi quyết định PO, không chạy lại các phép kiểm của Lần 1. Mã nguồn: nhánh `agent-core/spk-01-providers`, commit `e326279` (chỉ đổi `report.md` so với `741fd48` của Lần 1; mã spike, evidence, `self-qc.md`, `implement.md` không đổi).

Quyết định PO áp dụng: trả lời câu hỏi “PR #55 (PID-00021) xử lý thế nào?” bằng “Sửa G3 rồi merge” (21/11/2026), tức chấp nhận merge kết luận một phần trong khi EC01 còn áp dụng; ghi ở `report.md` Lần 2, YC3.

| G Lần 1 | Trạng thái | Kiểm |
| --- | --- | --- |
| G1, G2 | Còn mở (HIGH, EC01), PO chấp nhận merge | Không đổi được bằng sửa mã; chờ key chính thức, Lần 3 của Dev |
| G3 | Đã sửa | (1) Trạng thái đầu file và mục 4 thêm OpenAI vào danh sách chờ key chính thức. (2) Mục 1, bảng ASM-02, ASM-10 ghi “đạt khi đo qua cổng trung gian, chưa xác nhận trên endpoint chính thức”. (3) Bỏ câu “cổng chuyển nguyên tham số tới OpenAI”; câu về Gemini (mục 3) viết theo cùng chuẩn. `grep` trong `report.md` không còn kết luận “đạt với OpenAI” nào thiếu “qua cổng” |
| G4 | Còn mở (MEDIUM) | PO cấp mã OQ cho HTTP 400 ngoài 11 mã chuẩn |
| G5–G10 | Còn mở (LOW) | Không xử lý ở lần này |

Lệnh đã chạy: `git diff --check` sạch. Lần chạy lại khi có key đổi tên thành Lần 3 trong `report.md`; mục “Đề xuất cho PO” của Lần 1 nhắc “Lần 2 làm trên nhánh mới khi có key” nay hiểu là Lần 3.

## Lần 3 — 27/11/2026 · spec-converge-skill

Người chạy: phiên QC do PO `toilatrung` giao, không mang kết luận của phiên làm PR. Mã nguồn: PR #118, nhánh `dev-tools/provider-keys`. QC đánh giá `29e9402` (`29e94029e814e2c5df365bb26a4312eb1d320660`, 2 commit, gốc `origin/main` `c9e745b`), rồi thêm `4e334f2` (`4e334f245317d584ef0b1739297f009fe081d7b2`). Đầu nhánh đã QC: `4e334f2`.

Quyết định áp dụng: D-KEY (PO, 26/11/2026, nguyên văn ở `side-session-notes/…/provider-keys-handover.md`): “vấn đề API Key của provider điều chỉnh cho phép test và sử dụng key proxy vì đây là key mà của chúng tôi tự cung cấp”; “tôi chỉ đưa proxy key thôi … cứ dùng như bình thường đi, đừng phân biệt”. G9 Lần 1: SCOPE-13, kiến trúc 8.2 (key chỉ dùng cho kết nối của nó).

Đã đối chiếu: G9 Lần 1; toàn bộ diff (10 file: `scripts/development/set-provider-keys.ps1` mới, `README.md` của scripts/development, `apps/agent-core/spikes/spk-01/` `common.py`, `base_url.py`, `errors.py`, `scan_secrets.py`, `README.md`, `.gitignore`, `scripts/docs/add-license.mjs`, `AGENT.md`); `git log -p` của mọi commit trên nhánh.

### Kiểm lại việc còn lại

| G | Kết quả Lần 3 | Bằng chứng |
| --- | --- | --- |
| G9 LOW: `base_url.py` gửi key của cổng tới endpoint chính thức | Đã xử lý | `common.py` `connection()`: key và base URL lấy từ cùng một nguồn (biến môi trường, không có thì file), base URL trùng endpoint chính thức coi là chính thức. `official_key()`: chỉ trả key kết nối khi kết nối là endpoint chính thức, còn không thì chỉ `*_API_KEY_OFFICIAL`. `base_url.py compare`: có base URL riêng thì probe chính thức chỉ chạy với key chính thức, thiếu thì ghi “bỏ qua”. `errors.py`: `timeout_client` gửi tới endpoint của kết nối, `network_refused`, `network_dns` dùng key giả. QC chạy 12 ca với file key giả (bảng Lệnh): đạt |
| G8 LOW: request id, tên nhóm trong evidence | Không đổi | PR không sinh lại evidence; `scan_secrets.py` thêm quét host của cổng và key chính thức |
| G1, G2, G4–G7, G10 | Không đổi | Ngoài phạm vi PR |

### Khoảng trống

| Mã | Nguồn | Loại | Mức | Bằng chứng | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G11 | `README.md` của spike (“`SPK01_MODEL_*` … biến môi trường hoặc một dòng trong file key”); handover (“thêm `SPK01_MODEL_OPENAI` vào file”) | partial | LOW | `set-provider-keys.ps1:237-241` (ở `29e9402`) ghi lại file chỉ với tên key, base URL, key chính thức: chạy lại script làm mất mọi dòng khác, kể cả `SPK01_MODEL_*`. QC tái hiện bằng `Read-Host` giả trên file thử: dòng mất | **Đã sửa ở `4e334f2`** (QC): giữ dòng khác ở mục “Dòng khác”, bỏ tên cũ `SPK01_BASE_URL_*`, `GOOGLE_API_KEY` (để key không đi tới base URL cũ còn sót); `-Check` liệt kê tên dòng khác, không in giá trị; README ghi điều này, sửa “script rồi ghi file”. Chạy lại: dòng còn |
| G12 | Quy tắc 1.4.1 (một PR một luồng); CODEOWNERS | quy trình | LOW | `check-tracks.mjs --base origin/main`: `PR touches 2 tracks (agent-core, infra)` — `scripts/development/` (luồng infra, `@congminh1705`) và `apps/agent-core/spikes/` | Không chặn: PR của PO, theo D-KEY; handover đã nêu. Khi merge: PO bypass hoặc `@congminh1705` duyệt `scripts/development/` |
| G13 | PC-05 P37 (PR sửa theo QC thêm “Lần N” vào `self-qc.md` của PID liên quan) | partial | LOW | PR sửa G9 của PID-00021 nhưng không chạm `agent/execution/PID-00021/` (`report.md`, `self-qc.md`); kết quả thử ở handover, không ở hồ sơ PID | Không chặn. Phiên làm PR (hoặc PO) thêm mục Lần 3 vào `self-qc.md`, `report.md` của PID-00021, hoặc PO nhận handover và qc-report này làm bản ghi |

Không có CRITICAL, HIGH, MEDIUM.

Ghi nhận, không tính G:

1. **Nguồn của key và base URL.** Nếu biến môi trường có key mà không có base URL (ví dụ sau này xóa `SPK01_BASE_URL_*` cấp User nhưng giữ `*_API_KEY`), `connection()` coi là endpoint chính thức và gửi key đó tới endpoint chính thức, dù file có base URL cổng. Đây là đúng thiết kế “một nguồn” và lựa chọn `[y]`, `[x]` của script giữ hai biến đi cùng nhau. Hiện máy PO có đủ key và `SPK01_BASE_URL_*` cấp User (script `-Check` báo), nên không xảy ra.
2. **File key.** `.sires/` có `.gitignore` riêng (`*`), `.gitignore` gốc thêm `.sires/`, `provider-keys.env`; `add-license` bỏ qua `.sires`. Giá trị ghi trong nháy đơn, key và URL bị từ chối nếu có khoảng trắng, nháy, `\`, `$`, nên `set -a; . file` an toàn. ACL: `icacls /inheritance:r /grant:r <SID>:F`.
3. Mọi câu trả lời gõ ẩn (`Read-Host -AsSecureString`); script chỉ in độ dài, loại tiền tố và URL đã che host. QC chạy script thật với `Read-Host` giả: đầu ra không có giá trị key nào.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| Quét `git log -p origin/main..origin/dev-tools/provider-keys`, toàn bộ lịch sử nhánh, thông điệp commit, mô tả, comment PR, tìm key và host của cổng (giá trị đọc từ `.sires/provider-keys.env` của máy, chỉ in số lần khớp; bộ quét tự kiểm trên chính file key: khớp 3/3) | 0 key, 0 host, ở cả `29e9402` và `4e334f2` |
| Chạy `set-provider-keys.ps1 -Path <thư mục tạm>` với `Read-Host` giả, file thử có `SPK01_MODEL_OPENAI`, `SPK01_BASE_URL_GOOGLE`, `GOOGLE_API_KEY` (key giả `sk-test-…`), trả lời Enter ở câu biến cấp User | Ở `29e9402`: `SPK01_MODEL_OPENAI` mất. Ở `4e334f2`: còn; hai tên cũ bị bỏ; biến cấp User không đổi; đầu ra không chứa key |
| `set-provider-keys.ps1 -Check -Path <file thử>` | Liệt kê “Dòng khác: SPK01_MODEL_OPENAI”, không in giá trị |
| `[Parser]::ParseFile` của PowerShell | 0 lỗi; file giữ BOM UTF-8 (cần cho PowerShell 5.1) |
| 12 ca kiểm `common.py` trong container `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` (`python -I`, file key giả qua `SIRES_PROVIDER_KEYS_FILE`) | 12/12 đạt: key và base URL cùng từ file; key cổng không thành `official_key`; không base URL thì key là key chính thức; `model_for` đọc file; `redact` che host (không phân biệt hoa thường) và key; `*_OFFICIAL` từ file; tên cũ `SPK01_BASE_URL_*` vẫn đọc; base URL bằng endpoint chính thức → chính thức; key ở môi trường không ghép base URL của file; host trong file vẫn được che; thiếu file → không key |
| `node scripts/docs/add-license.mjs --check` | 0 thiếu |
| `node scripts/development/check-tracks.mjs --base origin/main` | Cảnh báo 2 luồng (G12) |
| `gh api repos/toilatrung/sires/pulls/118/commits` | 3/3 `verified: true`; không có dòng ghi công AI trong commit, mô tả |
| `gh pr checks 118` (run 45868638387 trên `4e334f2`) | 25/25 đạt, gồm `python` (ruff chạy mới trên `apps/agent-core`, gồm `spikes/`), `secrets`, `tracks`, `build` |
| Gọi thật qua cổng | Không chạy (không cần cho phần đổi mã; handover 27/11/2026 đã ghi kết quả gọi qua cổng) |

### Lệch với lời khai

Handover nói `-Check` “báo dạng key … không in giá trị” và mọi câu trả lời gõ ẩn: QC xác nhận. Handover không nêu việc ghi lại file làm mất dòng khác (G11, đã sửa).

### Việc còn lại

1. Phiên điều phối merge #118 (PO bypass, hoặc `@congminh1705` duyệt `scripts/development/`).
2. Ghi D-KEY và cách xử lý G9 vào PC-05 hoặc `docs/docs_context.md` (PO, `docs/`), như handover đã nêu.
3. G13: tùy PO.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
