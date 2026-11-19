# PID-00008 — Báo cáo QC độc lập

**Kết luận mới nhất:** Còn việc — 0 CRITICAL, 1 HIGH, 1 MEDIUM, 2 LOW (Lần 2, 19/11/2026). G1, G3, G4b/c đã đóng. Còn G2 (HIGH): phía TypeScript không bắt trường lạ trong `data` của 37/42 message; PO đã chọn hướng 2 ngày 19/11/2026 (sửa bộ sinh TS trong PR này, hồ sơ ghi H5), chờ Dev làm. Mới: G5 (MEDIUM) — lỗi trên `string[]` cục bộ bị gắn nhãn “trường không có trong spec” (EC02); G6 (LOW) — mục baseline vẫn gắn commit `eb31e4d` dù hợp đồng đã đổi ở `f88adb4`. AC02 đạt; AC01 một phần (G2)

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

## Lần 2 — 19/11/2026 · spec-converge-skill

Người chạy: agent QC độc lập do PO giao, không mang kết luận của Dev. Mã nguồn: PR #35, nhánh `contracts/check-drift-baseline`, commit `e976977` (`e97697780335028e13a6b961d8fbe3f1aa58a19b`); nhánh đã chứa `origin/main` `f88adb4` (PR #31, mã lỗi 415/429), nên không lệch main. Trạng thái trong `report.md`: `Đang làm — chờ PO G2`.

Phạm vi đã đọc: `check-drift.mjs` (nhất là `generatedSchemas`, `generatedSchema` mới ở `:48–107`), `check-drift-python.py` (ghép `call-arg` theo span lời gọi `:130–138`, `:185–190`), `check-drift.spec.mjs` (12 test), mọi fixture TS, Python mới; `package.json`, `README.md` của contracts; phần AsyncAPI của `generate.mjs` (`:105–136`). Đối chiếu lại AC01, AC02, EC01–EC09, S01–S03, H1–H4 và từng việc còn lại của Lần 1. Đọc `report.md`, `implement.md`, `self-qc.md` Lần 2 như lời khai cần kiểm.

Như Lần 1, QC dùng fixture thăm dò đặt ngoài repo (scratchpad) và chạy qua CLI `node scripts/check-drift.mjs --ts-only <file>`; phần Python gọi thẳng helper `check-drift-python.py` (xem “Lệnh đã chạy” về Smart App Control). Không sửa file nào trong repo ngoài `qc-report.md` này.

### Việc của Lần 1

| Mã | Lần 1 | Lần 2 | Bằng chứng QC tự chạy |
| --- | --- | --- | --- |
| G1 | HIGH | Đã đóng | Trên `docs/api-design` thật: `read-extra.ts:5:103`, `write-extra.ts:5:95` → `— ResearchProject`; `message-extra.ts:5:73`, `:6:57` (đọc envelope, ghi `Partial<UsageRecordedMessage>`) → `— UsageRecordedMessage`; `AgentCoreInternal…AgentDefinition` → `— AgentDefinition`. `AgentRunRequestedMessage` báo `— AgentRunAssignment`: đúng, vì message này là alias của schema payload (`src/generated/messages.ts:407`, `asyncapi.yaml:1357`). Test mới chạy cả spec tạm có `allOf` và hợp đồng thật (`check-drift.spec.mjs:76–107`) |
| G2 | HIGH | **Còn mở — chờ PO** | Đã thêm fixture, test cấp envelope (bị bắt) và test mô tả giới hạn `data` (`check-drift.spec.mjs:104–105`, `__fixtures__/ts/message-data-extra.ts`). QC chạy CLI: `message-data-extra.ts` (đọc, gán thuộc tính, thay object trong `data`) → `check-drift: đạt`, thoát 0; thăm dò `ReferenceStatusChangedMessage['data'].fieldNotInSpec` → không báo. Nguyên nhân giữ nguyên: `internal/schemas.yaml:428–430` `data: additionalProperties: true`, 37/42 message dạng `components["schemas"]["EventEnvelope"] & {…}` (`messages.ts:363`). Phía Python cùng ca bị bắt (`… — sires_common.generated.messages.Data29`). Dev đã ghi “Cần PO” đúng điểm dừng; chưa có quyết định của PO nên AC01 phần message TS chưa đạt |
| G3 | MEDIUM | Đã đóng | `write-extra.py:9:10`, `:10:13` (alias `Aggregate as Entity`, một dòng và nhiều dòng) → `trường không có trong spec: 'fieldNotInSpec' — sires_common.generated.messages.Aggregate`; thăm dò `msgs.Aggregate(…, fieldNotInSpec=1)` và lời gọi trong list → có nhãn; `write-valid.py` thoát 0; `Aggregate` cục bộ cùng tên (`local-model.py:21–22`) giữ lỗi `[call-arg]` nguyên văn. Dòng `note:` của mypy vẫn in kèm, không ảnh hưởng |
| G4 | LOW | (b), (c) đã đóng; (a) còn | (b) `nested-extra.ts:6:84` và thăm dò `ReferenceStatusChangedMessage['aggregate']` → `— EventEnvelope.aggregate`; (c) `Partial<ResearchProject>` → `— ResearchProject`. (a) phía Python, trường lạ trong `data` của `UsageRecordedMessage` vẫn báo `— sires_common.generated.messages.Data29` (`sires_common/generated/messages.py:888`) — tên lớp do bộ sinh đặt, không chặn |

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G2 | PID-00008-AC01 (TS, message AsyncAPI) · S01 “Xong khi” | partial | HIGH | Như bảng trên: `internal/schemas.yaml:428–430`; `messages.ts:363–366`; `check-drift.spec.mjs:105` khẳng định `message-data-extra.ts` **đạt** | PO chọn một trong ba hướng ở “Đề xuất cho PO”, ghi vào hồ sơ; Dev làm theo. Nếu chọn sửa bộ sinh hay sửa hợp đồng, đổi kỳ vọng `:105` thành `false` và kiểm nhãn `— UsageRecordedMessage.data` |
| G5 | PID-00008-AC01 · EC02 (“lỗi không do type sinh … không gắn nhãn”, H3) | partial | MEDIUM | `check-drift.mjs:65–79` (`visit`/`descend`) gán tên cho mọi kiểu đi tới được từ schema sinh, kể cả kiểu TypeScript dùng chung như `string[]` (một đối tượng kiểu duy nhất trong cả chương trình) và cả các method của `Array`; `:86` tra trúng bảng này nên lỗi trên giá trị cục bộ bị gắn nhãn hợp đồng. Thăm dò: file import contracts rồi đọc `xs.fieldNotInSpec` với `xs: string[]` cục bộ → `trường không có trong spec: 'fieldNotInSpec' — AgentDefinition.requiredCapabilities (TypeScript)` (do `internal/agent-core.ts:72` `requiredCapabilities?: string[]`). Mã thoát vẫn 1, nên không có ca lọt; nhưng lỗi nội bộ bị báo thành lệch hợp đồng, trái EC02 và trái câu trong `README.md` “Nếu không chứng minh được nguồn kiểu, giữ chẩn đoán gốc”. Cùng file: `string`, `number[]`, `{ id: string }`, union chuỗi cục bộ giữ lỗi gốc. Lỗi mới do bản sửa G1/G4b; test EC02 (`local-model.ts`) không import contracts nên không thấy | Chỉ ghi tên cho kiểu có khai báo nằm trong `src/generated` (schema gốc và object literal sinh), bỏ qua kiểu của thư viện chuẩn (`Array`, `String`…) và kiểu dùng chung; thêm test EC02: file import contracts, đọc trường lạ trên `string[]` cục bộ → lỗi TS2339 nguyên văn, không nhãn |
| G4a | PID-00008-AC01 (Python, tên mô hình) | partial | LOW | `sires_common/generated/messages.py:888` `class Data29` | Không chặn merge. Xử lý cùng việc còn lại của PID-00007 nếu PO muốn |
| G6 | PID-00008-AC02 (mục “Baseline hợp đồng”: commit đã kiểm) · S03 | partial | LOW | `report.md` “Baseline hợp đồng — Lần 1” ghi nguồn `eb31e4d`; nhánh nay chứa `f88adb4`, đổi `docs/api-design/components/responses.yaml`, `components/schemas/common.yaml`, `dist/openapi.bundled.yaml` (PR #31). `self-qc.md` Lần 2 ghi “không chạy bundle lại vì không sửa nguồn hợp đồng” — nguồn hợp đồng có đổi qua main. QC tự kiểm lại ở `e976977`: mọi dòng bằng chứng của bảng baseline vẫn đúng, bundle khớp `dist/`, generate, typecheck, check-drift đạt (xem “Lệnh đã chạy”) | Khi PO sắp duyệt baseline: ghi commit hợp đồng được kiểm (hiện là `f88adb4`, hoặc commit sau khi PO sửa routing key, G2), kết quả bundle và lệnh trên commit đó. Không chặn merge |

Không có `contradicts`, `unrequested`. Không vi phạm nguyên tắc: không sửa `docs/`, service, cấu hình mypy của project khác, workflow CI hay file sinh; `check-tracks` chỉ `contracts`, `repo`.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00008-AC01 | một phần (G2; G5 nhãn phụ) | test fixture + CLI trên hợp đồng thật | `check-drift.spec.mjs › trường không có trong spec…(EC01)`, `› AsyncAPI allOf…(G1/G2/G4)`, `› real contracts…(G1/G2)`, `› Python: trường không có trong mô hình sinh…(EC06)` | Test 12/12 đạt trên CI; tại máy QC 11/12 (EC06 bị Smart App Control chặn, không phải lỗi mã). CLI trên `docs/api-design`: đọc, ghi trường lạ ở schema công khai, nội bộ, cấp envelope message đều thoát 1 với file:dòng:cột, tên trường, tên schema đúng; bỏ trường thì thoát 0. Python: đọc, ghi (kwarg) trên mô hình, client sinh đều có nhãn. Còn: trường lạ trong `data` message phía TS thoát 0 (G2) |
| PID-00008-AC02 | đạt | lệnh thật + đối chiếu file:dòng | `report.md › Baseline hợp đồng`; `generate`, `:typecheck`, `check-drift` | Ba lệnh đạt ở `e976977` (check-drift: TS toàn repo qua CLI, Python ba project qua helper). Mọi dòng bằng chứng khớp nguồn hiện tại. Báo cáo có kết luận “Baseline sẵn sàng cho PO duyệt”, ghi rõ giới hạn G2, không ghi “PO đã duyệt”. Lưu ý G6: commit trong báo cáo cũ hơn hợp đồng hiện tại |

Edge case: EC01 đạt (G1 đóng; G5 là nhãn thừa trên kiểu cục bộ, xem EC02); EC02 một phần (G5; `internal-error.ts`, `local-model.ts` vẫn in nguyên văn TS2322, TS2339); EC03, EC04, EC07 đạt (test chạy tại máy QC và CI); EC05 đạt (CLI in 14 project TS, khớp Lần 1); EC06 đạt (đọc và ghi, xem G3); EC08 đạt (hai mâu thuẫn routing key, dòng `:398`, `:12–14`, `:1273`, `:1286`, `:1296`, `:1307` vẫn đúng ở HEAD); EC09 đạt (QC tự bundle lại ở `e976977`). Không có màn hình nên không chạy `sires-ui-review`.

### Lệnh đã chạy

Máy QC: Windows 11, Node 24.21.0, pnpm 10.34.9, uv 0.13.7; worktree tách ngoài repo (scratchpad) ở `e976977`. Lần này Smart App Control chặn `.venv/Scripts/python.exe` (“An Application Control policy has blocked this file”), nên `uv run` và test EC06 không chạy được tại máy; phần Python chạy bằng interpreter gốc của uv (`cpython-3.12.16`) nạp `site-packages` của `.venv` rồi gọi thẳng `check-drift-python.py`, đúng tham số `checkPython` truyền (`--workspace <repo> --fixture <file>` hoặc `src` trong thư mục project). WSL trên máy này không có Node, uv nên không dùng.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile`; `uv sync --all-packages` | Đạt |
| `pnpm nx run @sires/contracts:generate-ts --skip-nx-cache`; `node scripts/generate.mjs --python-only` | Đạt: TS 9 API nội bộ, 42 message; Python 9 API nội bộ, 42 message. Không gặp EPERM như Dev ghi |
| `pnpm nx run-many -t typecheck lint build -p @sires/contracts --skip-nx-cache` | Đạt (kèm 1 tác vụ phụ thuộc `generate-ts`) |
| `node --test scripts/generate.spec.mjs scripts/check-drift.spec.mjs` | 11/12 đạt, 0 skip; EC06 hỏng vì Smart App Control chặn `python.exe` của `.venv` (`os error 4551`) — lỗi môi trường |
| CI trên `e976977` (run `44442213224`, merge `c9d14c6` vào `f88adb4`) | `tracks`, `build` success; `contracts:test` 12/12 đạt, 0 skip, gồm EC06 chạy thật (27,9 s); `nx affected` 14 project và 1 tác vụ phụ thuộc đạt; `add-license --check` đạt |
| `node scripts/check-drift.mjs --ts-only` (toàn repo) | Đạt: 14 project TS (`audit`, `contracts`, `gateway`, `identity`, `library`, `manuscript`, `orchestration`, `planning`, `platform`, `research`, `sandbox-runner`, `testing`, `web`, `workspace`); 1 phút 34 giây |
| Helper Python trên `apps/agent-core`, `apps/knowledge`, `libs/py/sires_common` (`src`) | Cả ba `status 0` |
| CLI `--ts-only` trên 9 fixture TS của Dev | `read-extra`, `write-extra` → `ResearchProject`; `message-extra` → 2 lỗi `UsageRecordedMessage`; `nested-extra` → `ResearchProject`, `EventEnvelope.aggregate`; `message-data-extra`, `valid`, `message-valid` → thoát 0; `internal-error`, `local-model` → thoát 1, nguyên văn |
| Thăm dò TS (ngoài repo) | Xem G1, G2, G4, G5 ở trên |
| Helper Python trên 6 fixture của Dev | `client-extra` → `AuthenticatedClient`; `read-extra` → `AgentRunAssignment`; `write-extra` → `Aggregate` ở `:9`, `:10`; `valid`, `write-valid` → 0; `local-model` → 1, nguyên văn |
| Thăm dò Python (ngoài repo) | `data` của `UsageRecordedMessage` → `Data29` (G4a); cấp envelope → `UsageRecordedMessage`; `msgs.Aggregate(…)`, lời gọi trong list → `Aggregate`; `list[str]` cục bộ → nguyên văn, không nhãn |
| `ruff check` helper và `__fixtures__/python` (qua interpreter gốc) | Đạt |
| `npx --offline @redocly/cli@2.11.1 bundle openapi.yaml -o <scratchpad>` rồi so với `dist/openapi.bundled.yaml` | Khớp cả nội dung YAML và văn bản (sau khi đổi CRLF thành LF); không sửa `dist/` |
| Đối chiếu từng dòng bằng chứng baseline ở `e976977` | Khớp: asyncapi `:8`, `:12–14`, `:1113`, `:1133`, `:1138`, `:1234–1246`, `:1273`, `:1286`, `:1296`, `:1307`; schemas `:398`, `:399`, `:409`, `:422`; `info.version` 9 file nội bộ, OpenAPI, bundle |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --head=HEAD --parallel=3 --skip-nx-cache` | Thoát 1 chỉ vì `@sires/contracts:test` EC06 (Smart App Control, như dòng test ở trên). Chạy lại với `--exclude=@sires/contracts`: 13 project và 2 tác vụ phụ thuộc đạt; `contracts` lint, typecheck, build đạt riêng. Bản đủ 14 project đạt trên CI |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: contracts, repo` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00008 --result` | KẾT QUẢ ĐỦ, 0 cảnh báo; trạng thái `Đang làm — chờ PO G2` |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID) |
| `git diff --check origin/main...HEAD` | Sạch |
| `node scripts/docs/add-license.mjs --check` | Thoát 1: 5 file `.gitignore` trong `.mypy_cache/`, `.ruff_cache/` do mypy, ruff tạo khi QC chạy (giới hạn đã nêu ở Lần 1, ngoài luồng). CI đạt |

### Lệch với Self-QC

- `self-qc.md` Lần 2 mục 2: “Class Aggregate nội bộ trùng tên giữ lỗi mypy gốc” và EC02 giữ lỗi gốc; `README.md` “không chứng minh được nguồn kiểu, giữ chẩn đoán gốc”. Đúng với lớp, type cục bộ cùng tên; sai với kiểu dùng chung như `string[]` trong file có import contracts (G5).
- `self-qc.md` Lần 2 mục 2: EC08/EC09 “không chạy bundle lại vì không sửa nguồn hợp đồng”. Nhánh đã gộp `f88adb4`, có đổi nguồn hợp đồng và `dist/`. QC tự bundle lại: vẫn khớp (G6 chỉ là ghi chép).
- `self-qc.md`, `report.md` Lần 2: `check-drift` và `affected` trên máy Dev bị EPERM khi đổi tên thư mục generated. Trên máy QC (Windows) không gặp; generate, check-drift chạy bình thường. Khả năng là có tiến trình giữ thư mục `src/generated` trên máy Dev (IDE, TS server); không phải khoảng trống của PID-00008.
- Các kết quả khác khớp: G1, G3, G4b/c đã sửa; test 12/12 trên CI; G2 được ghi “Cần PO”, chưa tự chốt; không đặt `Xong — chờ QC`.

### Việc còn lại, theo thứ tự phụ thuộc

1. ~~PO quyết G2~~ — PO chọn hướng 2 ngày 19/11/2026; hồ sơ PID-00008 ghi H5, P5, EC10 (nhánh `docs/pid-00008-decisions`, vào `main` qua PR riêng). Dev pull `main` sau khi PR đó merge.
2. Dev làm H5: sửa phần sinh type message trong `generate.mjs`, đổi `check-drift.spec.mjs:105` sang kỳ vọng thoát lỗi, thêm test `message: trường không có trong data` kiểm nhãn tên message (PID-00008-AC01, EC10, S01 “Xong khi”).
3. G5: chỉ gắn tên schema cho kiểu khai báo trong `src/generated`; thêm test EC02 với `string[]` cục bộ trong file có import contracts (PID-00008-AC01, EC02).
4. G6: cập nhật “Baseline hợp đồng” với commit hợp đồng hiện hành (sau khi G2 và routing key được quyết) — làm cùng bước PO duyệt baseline.
5. Chạy lại lệnh spec mục 6, CLI fixture; ghi “Lần 3” ở `report.md`, `self-qc.md`; đặt `Xong — chờ QC` khi không còn HIGH.

### Đề xuất cho PO

- **G2 là điểm chặn duy nhất còn lại ở mức HIGH, và chỉ PO quyết được.** Ba hướng (như Lần 1):
  1. *Chấp nhận giới hạn:* ghi vào hồ sơ PID-00008 rằng TS không bắt trường lạ trong `data` khi hợp đồng cho `additionalProperties: true`. Merge được ngay sau G5. Hệ quả: `check-drift` mù với phần payload của 37/42 message ở mọi service TS — đúng phần dễ lệch nhất của sự kiện — cho tới khi có việc sửa.
  2. *Sửa bộ sinh TS (luồng `contracts`, cùng người làm):* ở bước dựng schema message trong `generate.mjs` (`:105–136`), thay `data` của envelope bằng `data` của message thay vì giao hai kiểu (ví dụ `Omit<EventEnvelope, 'data'> & { data: … }`, hoặc gộp `allOf` trước khi gọi `openapi-typescript`). Đổi hành vi của PID-00007 nên PO cần ghi quyết định vào hồ sơ (spec-clarify, thêm H5 cho PID-00008, hoặc PID riêng). Hiện chưa service nào import type message (EC05), nên ảnh hưởng thấp.
  3. *Sửa hợp đồng* qua `contract-updating-skill`: cấu trúc lại để message không kế thừa `EventEnvelope.data` có `additionalProperties: true`. Đụng 37 message trong `events/asyncapi.yaml` và `internal/schemas.yaml`, tốn công nhất.

  Đề xuất của QC: **hướng 2, làm trong PR này**, vì nó giữ nguyên ý nghĩa hợp đồng (envelope là khung chung), đưa TS về cùng hành vi với Python, nằm trong luồng `contracts` và chưa có consumer. Nếu PO muốn merge sớm, làm hướng 1 kèm một PID sửa bộ sinh phải xong trước PID-00009 (gắn check-drift vào CI); nếu không, cổng CI của ADR-14 có lỗ ở payload sự kiện ngay khi bật.
- **Duyệt baseline (N7):** vẫn không phải điều kiện merge PR này. Trước khi duyệt: quyết hai mâu thuẫn routing key (Lần 1, không đổi), quyết G2, rồi cho Dev ghi lại commit hợp đồng được duyệt (G6).
- **Môi trường máy PO:** lần này Smart App Control chặn `python.exe` trong `.venv` (Lần 1 ghi `uv run` chạy được), nên `contracts:test` (EC06), `uv run` và mọi target Python không chạy được tại máy; WSL chưa có Node, uv. Kết quả Python của Lần 2 dựa trên helper chạy qua interpreter gốc và CI. Nếu muốn QC tại máy chạy đủ, cần cài Node 22+, pnpm, uv trong WSL Ubuntu-24.04 (đúng cổng “Môi trường” của ticket: Linux hoặc WSL2).
- **Hồ sơ đã cũ (không chặn, như Lần 1):** trang ticket mục 3, 4 và S01–S03 vẫn ghi PID-00007 “chưa làm”; `specs/index.html` vẫn “Chờ duyệt”.

**Quyết định của PO (19/11/2026, trong phiên):** G2 — “Hướng 2 trong PR”. Ghi vào hồ sơ thành H5 (trang ticket mục 5, phiên 19/11/2026), P5, EC10, AC01, S01; cùng lần cập nhật trạng thái PID-00007 đã merge ở mục 3, 4 và S01–S03. `specs/index.html` không sửa.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
