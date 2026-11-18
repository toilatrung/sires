# PID-00008 — Báo cáo QC độc lập

**Kết luận mới nhất:** Còn việc — 0 CRITICAL, 2 HIGH, 1 MEDIUM, 1 LOW (Lần 1, 18/11/2026). AC02 đạt; AC01 một phần: chạy trên hợp đồng thật, check-drift nêu sai tên schema (G1) và không bắt trường lạ trong `data` của message AsyncAPI phía TypeScript (G2). Việc PO duyệt baseline không phải điều kiện nghiệm thu của ticket này (xem “Đề xuất cho PO”)

- **Ticket:** [PID-00008](../../../docs/tickets/issues/PID-00008/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 18/11/2026 · spec-converge-skill

Người chạy: agent QC độc lập do PO giao, không mang kết luận của Dev. Mã nguồn: PR #35, nhánh `contracts/check-drift-baseline`, commit `4199045` (`41990456662a3318416a98597e8539d862fd2626`), gốc là `origin/main` `eb31e4d` (PID-00007 đã merge).

Phạm vi đã đọc: `libs/ts/contracts/scripts/check-drift.mjs`, `check-drift-python.py`, `check-drift.spec.mjs`, `__fixtures__/` (TS, Python, `invalid-spec.yaml`), `package.json` (target Nx), `README.md`; `generate.mjs` (phần gọi `uv`, thư mục tạm); `project.json`, `pyproject.toml` của `agent-core`, `knowledge`, `sires-common` và `pyproject.toml` gốc; `.github/workflows/ci.yml`. Đối chiếu `acceptance.html`, `scope.html` (P1–P4, N1–N8, EC01–EC09), `specs/index.html` mục 3–7, slice S01–S03, `designs/notes.html`, trang ticket (H1–H4, “Phải sửa ở nguồn”). Kiểm từng dòng bằng chứng của mục “Baseline hợp đồng” trong `docs/api-design/` và trong type, mô hình sinh lại ở commit này (`src/generated/`, `sires_common/generated/` không theo dõi Git, số dòng dưới đây là của bản QC vừa sinh).

QC dùng thêm fixture thăm dò đặt trong scratchpad, ngoài repo; chạy qua CLI `node scripts/check-drift.mjs --ts-only|--python-only <file>`, không sửa file nào trong repo.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-00008-AC01 (“in đúng … tên schema”) · EC01 · S01 | partial | HIGH | `libs/ts/contracts/scripts/check-drift.mjs:48–66` (`generatedSchema`): lấy khai báo đầu tiên nằm trong `src/generated`; kiểu giao không có symbol nên duyệt `type.types` (`:61–64`) và trả thành viên đầu. Hợp đồng thật dựng schema bằng `allOf`: `src/generated/public.ts:3651` `ResearchProject: components["schemas"]["EntityMeta"] & {…}` (24 schema công khai như vậy), `messages.ts:363` `UsageRecordedMessage: components["schemas"]["EventEnvelope"] & {…}` (37/42 message). QC chạy chính fixture AC01 của Dev trên `docs/api-design`: `read-extra.ts:5:103: trường không có trong spec: 'fieldNotInSpec' — EntityMeta`, `write-extra.ts:5:95: … — EntityMeta` (đúng phải là `ResearchProject`); fixture thăm dò đọc trường lạ trên `UsageRecordedMessage` → `— EventEnvelope`. Test đạt chỉ vì spec tạm dựng `ResearchProject` phẳng, không có `allOf` (`check-drift.spec.mjs:21–23`, kiểm ở `:59`) | Nêu tên schema hoặc message mà mã dùng (bao ngoài phần giao), không phải thành phần `allOf` đầu tiên. Thêm test chạy trên hợp đồng thật hoặc spec tạm có `allOf` như `EntityMeta`, kỳ vọng `ResearchProject`; và một ca message kỳ vọng `UsageRecordedMessage` |
| G2 | PID-00008-AC01 (TS, message AsyncAPI) · S01 “Xong khi”: “fixture dùng type message AsyncAPI cũng bị bắt như trên” | partial | HIGH | `docs/api-design/internal/schemas.yaml:428–430` `EventEnvelope.data` có `additionalProperties: true` → `src/generated/messages.ts:493–495` `data: { [key: string]: unknown }`; mỗi message là `EventEnvelope & { data?: {…} }` (`:363–366`), nên chỉ mục index nuốt mọi trường lạ trong `data`. Thăm dò: đọc `m.data?.fieldNotInSpec` trên `UsageRecordedMessage` → `check-drift: đạt`, thoát 0; ghi `{ source: 'embedding', model: 'm', fieldNotInSpec: 1 }` vào `UsageRecordedMessage['data']` → thoát 0. Cùng ca phía Python bị bắt (`… — sires_common.generated.messages.Data29`), nên hai ngôn ngữ cho kết quả khác nhau. `check-drift.spec.mjs` không có fixture message nào (`__fixtures__/ts/*.ts` chỉ dùng `PublicApi…ResearchProject`); tiêu chí “Xong khi” của S01 chưa được kiểm | Thêm fixture và test message AsyncAPI (trường lạ ở cấp envelope và trong `data`). Phần `data`: hồ sơ chưa nói cách xử lý khi hợp đồng cho `additionalProperties: true` → theo điểm dừng của ticket, ghi “Cần PO” trong `report.md` và làm theo PO quyết (xem “Đề xuất cho PO”). G2 đóng khi có test và có quyết định của PO được thực hiện |
| G3 | PID-00008-AC01 (Python, “ghi (hoặc đọc)”, “cùng kỳ vọng”) · S02 (“in thành một dòng: file:dòng, tên trường, mô hình”) · EC06 | partial | MEDIUM | `libs/ts/contracts/scripts/check-drift-python.py:130–136` ghi vị trí của từng keyword; `:183–186` so dòng, cột lỗi với vị trí keyword, nhưng mypy báo `[call-arg]` tại cột của lời gọi, nên nhánh “Unexpected keyword argument” (`:173`) không bao giờ gắn nhãn. Thăm dò: `Aggregate(type='task', id=i, version=1, fieldNotInSpec=1)` (một dòng) và `AgentRunAssignment(…, fieldNotInSpec=1)` (nhiều dòng) đều thoát 1 nhưng in nguyên văn hai dòng mypy (`error: Unexpected keyword argument … [call-arg]` và `note: … defined in …`), không có dạng “trường không có trong spec”. Test Python (`check-drift.spec.mjs:101–134`) chỉ có ca đọc thuộc tính | Gắn nhãn lỗi `call-arg` theo vị trí lời gọi (hoặc dòng đầu lời gọi) khi lời gọi dựng mô hình sinh; thêm test ghi: khởi tạo mô hình sinh với trường thừa, một dòng và nhiều dòng |
| G4 | PID-00008-AC01 (tên schema, mô hình) · self-qc G4 | partial | LOW | Nhãn chưa nêu đúng tên mà người đọc cần, mã thoát vẫn đúng: (a) phía Python, trường lạ trong `data` của message báo `Data29` (lớp đánh số do bộ sinh đặt, `sires_common/generated/messages.py:888`, `:905`), không nêu `UsageRecordedMessage`; (b) phía TS, object lồng báo tên trường bao ngoài: `aggregate` thay vì `EventEnvelope` (`check-drift.mjs:55–57` lấy `PropertySignature` gần nhất); (c) kiểu bọc `Partial<…>` hay kiểu ánh xạ khác: in nguyên văn TS2353, không nhãn (thoát 1) | Khi sửa G1, cân nhắc nêu tên gốc kèm đường trường (ví dụ `UsageRecordedMessage.data`, `EventEnvelope.aggregate`). Không chặn merge |

Không có `contradicts`, `unrequested`. Không vi phạm nguyên tắc: không sửa `docs/`, service, cấu hình mypy của project khác hay workflow CI; `check-tracks` chỉ luồng `contracts` và `repo`.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00008-AC01 | một phần (G1, G2, G3) | test fixture + CLI trên hợp đồng thật | `libs/ts/contracts/scripts/check-drift.spec.mjs › trường không có trong spec…(EC01)`; `› Python: trường không có trong mô hình sinh…(EC06)` | Test đạt (QC chạy, CI đạt). CLI trên `docs/api-design`: mã thoát, tên trường, file:dòng:cột đúng ở mọi ca đọc, ghi object literal; tên schema TS sai với schema dùng `allOf` (G1); trường lạ trong `data` message TS không bị bắt (G2); ghi trường thừa phía Python thoát 1 nhưng không gắn nhãn (G3). Bỏ trường thì đạt (`valid.ts`, `valid.py` thoát 0) |
| PID-00008-AC02 | đạt | lệnh thật + đối chiếu file:dòng | Mục kiểm `agent/execution/PID-00008/report.md › Baseline hợp đồng`; `pnpm nx run @sires/contracts:generate`, `:typecheck`, `:check-drift` | Ba lệnh đạt trên máy QC. Mọi dòng bằng chứng trong báo cáo khớp nguồn (asyncapi `:8`, `:12–14`, `:1113`, `:1133`, `:1138`, `:1234–1246`, `:1273`, `:1286`, `:1296`, `:1307`; schemas `:398`, `:399`, `:409`, `:422`; info.version của 9 file nội bộ, OpenAPI, bundle) và bản sinh. Báo cáo có phiên bản, commit, bảng mục kiểm, kết quả lệnh, hai mâu thuẫn routing key kèm hai đoạn trích, kết luận “Baseline sẵn sàng cho PO duyệt”, không ghi “PO đã duyệt”. Lưu ý: dòng “check-drift toàn repo đạt” chưa phủ trường trong `data` của message phía TS (G2) |

Edge case: EC01 một phần (G1); EC02 đạt (`internal-error.ts`, `local-model.ts` in nguyên văn TS2322, TS2339, thoát 1); EC03 đạt (test, lỗi nêu `test.yaml`); EC04 đạt (test sửa tay, làm hỏng bản sinh tạm rồi kiểm lại); EC05 đạt (in 14 project TS theo đồ thị Nx, khớp đồ thị QC dựng: mọi project `lang:ts` phụ thuộc `@sires/contracts`, trừ `@sires/e2e`); EC06 một phần (đọc đạt, ghi xem G3); EC07 đạt (test, `PATH` rỗng: TS vẫn kiểm, Python báo “thiếu uv”, kết quả lỗi); EC08 đạt (routing key, hai đoạn trích, file:dòng); EC09 đạt (QC tự bundle, xem bảng lệnh). Không có màn hình nên không chạy `sires-ui-review`.

### Lệnh đã chạy

Máy QC: Windows 11, Node 24.21.0, pnpm 10.34.9, uv 0.13.7, trong worktree ở commit `4199045`. `uv run` chạy được trên máy này lần này (Smart App Control không chặn), nên phần Python chạy tại chỗ, không cần runner thay thế.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (cảnh báo bỏ build script của `cpu-features`, `protobufjs`, `ssh2`) |
| `uv sync --all-packages` | Đạt, tạo `.venv` (gitignore) |
| `pnpm nx run @sires/contracts:generate --skip-nx-cache` | Đạt: TS 9 API nội bộ, 42 message; Python 9 API nội bộ, 42 message. Cảnh báo `NamingHintWarning: 33 of 122 class names are numbered collisions (Data1…Data31)` (liên quan G4a) |
| `pnpm nx run @sires/contracts:typecheck --skip-nx-cache`, `:lint --skip-nx-cache` | Đạt |
| `pnpm nx run @sires/contracts:test --skip-nx-cache` | 10/10 đạt, 0 skip (7 test check-drift, gồm test Python EC06 chạy thật khoảng 44 s; 3 test generate) |
| `pnpm nx run @sires/contracts:check-drift` (toàn repo) | Đạt: 14 project TS (`audit`, `contracts`, `gateway`, `identity`, `library`, `manuscript`, `orchestration`, `planning`, `platform`, `research`, `sandbox-runner`, `testing`, `web`, `workspace`) và `agent-core`, `knowledge`, `sires-common`; khoảng 1 phút 53 giây |
| `pnpm nx run @sires/contracts:check-drift --ts-only` | Đạt, cùng 14 project TS |
| CLI `--ts-only` với `__fixtures__/ts/read-extra.ts`, `write-extra.ts` | Thoát 1: `…read-extra.ts:5:103: trường không có trong spec: 'fieldNotInSpec' — EntityMeta (TypeScript)`, `…write-extra.ts:5:95: … — EntityMeta` (G1) |
| CLI `--ts-only` với `valid.ts`; `internal-error.ts`; `local-model.ts` | 0; 1 (TS2322 nguyên văn); 1 (TS2339 nguyên văn, không gắn nhãn) |
| CLI `--python-only` với `__fixtures__/python/read-extra.py`; `client-extra.py`; `valid.py`; `local-model.py` | 1 `… — sires_common.generated.messages.AgentRunAssignment`; 1 `… — …orchestration.client.AuthenticatedClient`; 0; 1 (lỗi `attr-defined` nguyên văn, không gắn nhãn) |
| Thăm dò TS (fixture ngoài repo) | Đọc trường lạ cấp envelope của `UsageRecordedMessage`: 1, `— EventEnvelope` (G1). Đọc, ghi trường lạ trong `data`: 0, “đạt” (G2). Đọc trên `AgentRunRequestedMessage`: 1, `— AgentRunAssignment`. Object lồng `EventEnvelope['aggregate']` thừa trường: 1, `— aggregate` (G4b). Đọc trên `AgentCoreInternal…AgentDefinition`: 1, `— AgentDefinition`. Ghi vào `Partial<ResearchProject>`: 1, TS2353 nguyên văn (G4c). Message dùng đúng trường: 0 |
| Thăm dò Python (fixture ngoài repo) | Đọc trường lạ cấp envelope `UsageRecordedMessage`: 1, có nhãn. Đọc trong `data`: 1, `— …Data29` (G4a). Import cả module (`import sires_common.generated.messages as msgs`): 1, có nhãn. Khởi tạo mô hình với kwarg thừa, một dòng và nhiều dòng: 1, không nhãn (G3). Dùng đúng trường: 0 |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --head=HEAD --parallel=3` | Đạt: 14 project và 1 tác vụ phụ thuộc |
| `uv run ruff check libs/ts/contracts/scripts/check-drift-python.py libs/ts/contracts/scripts/__fixtures__/python` | Đạt |
| `npx --offline @redocly/cli@2.11.1 bundle openapi.yaml -o <scratchpad>` (lệnh ở `docs/api-design/README.md`, lấy từ cache, không tải) rồi so với `dist/openapi.bundled.yaml` | Khớp sau khi bỏ khác biệt CRLF/LF; không sửa `dist/` |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: contracts, repo` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00008 --result` | KẾT QUẢ ĐỦ, 0 cảnh báo; trạng thái `Xong — chờ QC` |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID) |
| `node scripts/docs/add-license.mjs --check` | Thoát 1: 5 file thiếu header, đều là `.gitignore` trong `.mypy_cache/` (gốc, `agent-core`, `knowledge`, `sires_common`) và `.ruff_cache/` do mypy, ruff tạo khi QC chạy lệnh (thư mục đã gitignore; CI chạy lệnh này trước khi cài nên không gặp). File của ticket và `qc-report.md` này đủ header |
| CI trên `4199045` (run `44274395698`) | `tracks` success; `build` success: `nx affected` 14 project; `contracts:test` 10 pass, 0 skip (test Python chạy với `uv`). `check-drift` chưa có trong CI (đúng N2, thuộc PID-00009) |

### Lệch với Self-QC

- `self-qc.md` mục 1 ghi CLI `--ts-only` với `read-extra.ts` “in file:dòng:cột và ResearchProject”; mục 2 AC01 (TS) “đúng … schema”; mô tả PR ghi “nêu đúng trường/model/vị trí”. QC chạy đúng lệnh đó trên hợp đồng thật: in `EntityMeta` (G1). Test đạt chỉ vì dựng spec tạm không có `allOf`.
- Self-QC không kiểm fixture message AsyncAPI, dù S01 “Xong khi” yêu cầu; QC thấy trường lạ trong `data` của message không bị bắt phía TS (G2).
- Self-QC EC06 “Mypy bắt field thừa trên model Pydantic và client sinh”: đúng với đọc thuộc tính; ghi (khởi tạo với kwarg thừa) bị bắt nhưng không gắn nhãn, không có test (G3).
- Self-QC G4 (LOW, nhãn không chứng minh được nguồn): QC đồng ý mức LOW cho phần nhãn thiếu (G4c), nhưng phần nhãn sai tên schema là G1 (HIGH).
- Các kết quả lệnh khác khớp `self-qc.md` (generate, typecheck, test 10/10, check-drift toàn repo, affected, bundle Redocly, bằng chứng baseline).

### Việc còn lại, theo thứ tự phụ thuộc

1. G1: sửa cách lấy tên schema hoặc message trong `check-drift.mjs` (`generatedSchema`) để nêu schema mà mã dùng khi schema dựng bằng `allOf`; thêm test trên hợp đồng thật hoặc spec tạm có `allOf` (PID-00008-AC01, EC01).
2. G2: thêm fixture, test message AsyncAPI (cấp envelope và trong `data`) vào `check-drift.spec.mjs`; ghi “Cần PO” về trường lạ trong `data` (chỉ mục index do `additionalProperties: true`) ở `report.md`, rồi làm theo quyết định của PO (PID-00008-AC01, S01 “Xong khi”).
3. G3: gắn nhãn lỗi `call-arg` cho lời gọi dựng mô hình sinh trong `check-drift-python.py`; thêm test ghi một dòng và nhiều dòng (PID-00008-AC01 phần Python, EC06).
4. G4 (không chặn): làm cùng G1 nếu tiện.
5. Chạy lại lệnh spec mục 6 và CLI fixture; cập nhật “Baseline hợp đồng” nếu kết quả check-drift đổi; ghi “Lần 2” ở `self-qc.md`, `report.md`.

### Đề xuất cho PO

- **Duyệt baseline có chặn merge không:** không. AC02 chỉ đòi báo cáo có kết luận “Baseline sẵn sàng cho PO duyệt” (`acceptance.html`), “Duyệt baseline hợp đồng” là N7 (ngoài phạm vi, quyết định của PO), S03 “Xong khi” là PO đọc báo cáo quyết được. Báo cáo hiện đủ để quyết. Việc duyệt là điều kiện của cổng PH-01 (trước khi các luồng code song song), không phải của PR này. Trước khi duyệt, PO cần quyết: (a) hai mâu thuẫn routing key (`internal/schemas.yaml:398` với `events/asyncapi.yaml:12–14`; `:1273`, `:1296` với `:12–14`) — sửa bằng `contract-updating-skill`; (b) G2, vì nó quyết định dòng “check-drift đạt” trong baseline có phủ trường `data` của 37/42 message phía TS hay không. Sau khi PO sửa hợp đồng, baseline gắn với commit hợp đồng mới; nên chạy lại generate, check-drift và ghi commit đã duyệt.
- **G2 cần PO chọn:** (1) chấp nhận giới hạn: ghi vào hồ sơ rằng phía TS không bắt trường lạ trong `data` khi hợp đồng cho `additionalProperties: true` (Python vẫn bắt), Dev chỉ thêm test cấp envelope; (2) giao `contracts` xử lý ở bộ sinh (type message thay hẳn `data` của envelope thay vì giao với chỉ mục index) — đổi hành vi bộ sinh của PID-00007, cần làm rõ lại PID-00008 hoặc lập PID riêng; (3) PO đổi hợp đồng (`EventEnvelope.data` không còn `additionalProperties: true`, hoặc message không kế thừa nó) qua `contract-updating-skill`. Chưa có quyết định thì G2 còn mở.
- **Kiểm route `/internal/*` có guard service-auth và x-callers** (PO giao cho PID-00008 trong `agent/execution/PID-00003/qc-report.md` trên nhánh `platform/ts-service-auth`, chưa vào `main`; ghi “PO ghi vào hồ sơ khi làm rõ”): hồ sơ `docs/tickets/issues/PID-00008/` hiện chưa có yêu cầu này, nên QC không tính vào khoảng trống. Yêu cầu này cũng ngược H1 và N6 (PID-00008 không kiểm tĩnh route controller; kiểm route lúc chạy thuộc PID-00009). Đề xuất đưa vào PID-00009 (contract test lúc chạy: mọi route `/internal/*` trả 401 khi thiếu token, 403 với caller ngoài x-callers) hoặc một PID riêng; nếu muốn ở PID-00008 thì phải làm rõ lại, đổi H1, N6, và nên làm sau PR này.
- **Hồ sơ đã cũ (không chặn):** trang ticket mục 3, 4 và S01–S03 ghi PID-00007 “chưa làm”, nay đã merge ở `eb31e4d`; đầu `specs/index.html` còn “Chờ duyệt · Đề xuất — chờ PO duyệt” trong khi trang ticket ghi PO duyệt 18/11/2026. Sửa khi làm rõ lần sau.
- **Ngoài luồng (để PO biết):** `node scripts/docs/add-license.mjs --check` quét cả `.mypy_cache/.gitignore`, `.ruff_cache/.gitignore` dù đã gitignore, nên trên máy Dev, QC luôn báo thiếu sau khi chạy mypy, ruff (check-drift, typecheck, lint Python); CI không gặp. Thuộc luồng scripts, không phải PID-00008. Tên lớp `Data1…Data31` của bộ sinh Python (G4a) có thể xử lý cùng việc còn lại của PID-00007 nếu PO muốn.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
