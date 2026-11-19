# PID-00008 — Self-QC của Dev

**Kết luận:** Lần 2 — còn G2 HIGH chờ PO quyết về TS message.data. G1/G3 đã sửa và test đạt; G4b/c đã cải thiện, G4a còn lưu ý. Không đặt Xong — chờ QC. Lịch sử Lần 1 bên dưới giữ để truy vết.

- **Ticket:** [PID-00008](../../../docs/tickets/issues/PID-00008/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 19/11/2026

## 1. Lệnh

Kiểm chính trong WSL Ubuntu 24.04 trên bản sao validation, đồng bộ main `eb31e4d` và đúng source của ticket. Node 24.22.3, pnpm 10.34.9, Python 3.12, uv; dependency đã cài bằng frozen pnpm lockfile và uv workspace. Không sửa spec thật để tạo ca lỗi.

| Lệnh/kiểm | Kết quả thật |
| --- | --- |
| `check-pid.mjs PID-00008` | Hồ sơ đủ, 0 cảnh báo; PID-00007 đã merge |
| `pnpm nx run @sires/contracts:generate --skip-nx-cache` | Đạt: TS công khai, 9 API nội bộ, 42 message và model/client Python |
| `pnpm nx run @sires/contracts:typecheck --skip-nx-cache` | Đạt |
| `pnpm nx run @sires/contracts:check-drift` | Đạt trên 14 project TS và agent-core, knowledge, sires-common. Có in danh sách; sinh TS/Python trước khi kiểm |
| Dời cả hai đầu ra generated khỏi bản sao validation rồi chạy lại check-drift | Đạt, tự sinh lại từ nguồn; không cần đầu ra hoặc dist mới có sẵn |
| `pnpm nx run @sires/contracts:test --skip-nx-cache` | 10/10 đạt, không skip: 7 test check-drift và 3 test generate có sẵn |
| CLI --ts-only với fixture read-extra.ts / valid.ts | File có fieldNotInSpec thoát 1, in file:dòng:cột và ResearchProject; fixture đúng thoát 0 |
| CLI --python-only với read-extra.py / valid.py | File có fieldNotInSpec thoát 1, in file:dòng:cột và AgentRunAssignment; fixture đúng thoát 0 |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=3` | Đạt: 14 project và 1 target phụ thuộc. Gồm contracts lint/typecheck/test/build; không gắn check-drift vào workflow |
| `uv run ruff check libs/ts/contracts/scripts/check-drift-python.py` | Đạt |
| Redocly 2.11.1 bundle public OpenAPI vào file tạm; parse YAML so với dist | Đạt; nội dung YAML bằng nhau, không sửa dist |
| Assertion TS trên output sinh và Pydantic model_json_schema | Đạt: usage.recorded, aggregate bắt buộc với type/id/version, metadataVersion bắt buộc |
| `node scripts/docs/add-license.mjs --check` | Toàn repo local còn 9 file cache thiếu header; source của ticket đủ header. Không chỉnh công cụ infra hoặc thêm header vào cache |
| File đổi qua check-tracks --stdin; git diff --check | Chỉ contracts và báo cáo repo; không có docs/, service, libs/py hay workflow; diff sạch |
| UI | Không có màn hình |

Trong quá trình làm, test EC03 ban đầu trỏ sai vị trí fixture; đã sửa. Test Python cô lập ban đầu báo lỗi implementation của model sinh khi MYPYPATH biến chúng thành module local; đã dùng follow-imports=silent cho chế độ fixture để chỉ kiểm consumer, vẫn giữ kiểu. Lượt project gốc không bị bỏ: mọi lỗi của lượt đó vẫn làm lệnh thoát lỗi. Các kết quả đạt ở bảng là sau sửa, không đổi lỗi thành “đạt”.

## 2. AC → test

| AC | Test/bằng chứng | Kết quả |
| --- | --- | --- |
| PID-00008-AC01 (TS) | check-drift.spec.mjs › trường không có trong spec; CLI read-extra.ts/valid.ts | Đạt: đọc/ghi field thừa có đúng file, dòng, tên trường, schema; bỏ field thì đạt |
| PID-00008-AC01 (Python) | test Python EC06: model.root, client, class local trùng tên, project cấu hình skip imports; CLI read-extra.py/valid.py | Đạt, không cần plugin hoặc sửa config service |
| PID-00008-AC02 | Report › Baseline hợp đồng: phiên bản, commit nguồn, DBQ-03/04 trong spec/type/model, generate/typecheck/check-drift, public bundle, routing key còn mở | Đạt ở mức sẵn sàng trình PO; không tự ghi đã duyệt |

## 3. Edge case

| Mã | Trạng thái | Cách kiểm/bằng chứng |
| --- | --- | --- |
| EC01 | Đã giải quyết | Fixture TS read-extra và write-extra đều thoát lỗi, nêu fieldNotInSpec, ResearchProject và vị trí |
| EC02 | Đã giải quyết | Sai kiểu number/string và class local trùng tên schema giữ lỗi gốc; không gắn nhãn hợp đồng |
| EC03 | Đã giải quyết | YAML lỗi trong workspace tạm làm generate thất bại, lỗi có tên test.yaml |
| EC04 | Đã giải quyết | Output TS tạm bị sửa cú pháp hoặc thêm field giả đều bị sinh lại; không che được drift |
| EC05 | Đã giải quyết | Lệnh repo in 14 project TS theo graph, không yêu cầu service đã có import; test graph phủ cả dependency gián tiếp và chu trình |
| EC06 | Đã giải quyết | Mypy bắt field thừa trên model Pydantic và client sinh; đúng thì đạt, class nội bộ cùng tên không bị gắn nhãn sai |
| EC07 | Đã giải quyết | Env không có uv: TS vẫn kiểm; Python báo thiếu uv và kết quả chung lỗi |
| EC08 | Đã giải quyết theo hồ sơ | Routing key có hai đoạn trích và file:dòng trong report; giữ nguyên hợp đồng để PO quyết |
| EC09 | Đã giải quyết | Bundle lại public spec bằng Redocly đúng phiên bản, parse và so YAML bằng nhau |
| Mới: cấu hình skip model | Đã giải quyết | Test project tạm có follow_imports=skip vẫn bắt field sai nhờ lượt kiểm consumer strict bằng root config hiện có |
| Mới: CI chạy song song | Đã giải quyết | Test Python sinh vào workspace tạm riêng, không thay output của sires-common:test |
| Mới: chẩn đoán không chứng minh được provenance | Cần lưu ý | Giữ chẩn đoán checker gốc và vẫn thoát lỗi; không đoán schema theo tên class. Ví dụ kiểu động hoặc alias đi qua module tùy ý có thể không được gắn nhãn bổ sung |
| Mới: môi trường Windows | Cần lưu ý | Lượt kiểm repo đầu tiên thiếu link dependency platform; đã pnpm install --frozen-lockfile. Kiểm đầy đủ theo hồ sơ thực hiện trong WSL |

## 4. Tự kiểm

- [x] Đã chạy các lệnh của S01/S02/S03; kết quả ở bảng, fixture không sửa source service.
- [x] Nguồn API và docs chỉ đọc; không sửa bundle đã commit, file sinh thật hay migration.
- [x] Mọi output thuộc scripts/package/README của contracts và report; không sửa mypy config project khác hoặc CI workflow.
- [x] Giữ mọi lỗi typecheck làm mã thoát lỗi; không có cờ skip-generate hoặc cache cho check-drift.
- [x] Không dùng model/provider/API key hoặc dữ liệu thật; log chỉ là thông tin compiler/generator.
- [x] APR, state machine, provenance runtime, cách ly tài khoản/project, outbox và UI: không áp dụng cho công cụ build này.
- [x] Không có yêu cầu ngoài scope, TODO không có chủ hoặc mã debug; stdout của CLI/helper là giao diện kết quả kiểm.
- [x] Đã tự chạy spec-converge-skill ở chế độ Dev; không tạo qc-report.md và không còn CRITICAL/HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đọc lại P1–P4, N1–N8, O1, B1/B2, AC01/AC02 và từng slice. O1 có script, target/test và fixture theo phạm vi. N2–N4/N6 vẫn ngoài scope; baseline chưa được PO duyệt. Tự đối chiếu mã và lệnh, không lấy report “xong” làm bằng chứng.

| G | Loại | Mức | Bằng chứng và xử lý |
| --- | --- | --- | --- |
| G1 | partial | HIGH, đã đóng | Model có thể thành Any khi project skip generated. Python helper giữ check gốc và thêm strict consumer pass không sửa config; test project skip vẫn bắt field |
| G2 | partial | MEDIUM, đã đóng | Test Python không được publish vào output workspace khi Nx chạy song song. Test sinh trong workspace tạm riêng, MYPYPATH trỏ rõ artifact tạm |
| G3 | partial | MEDIUM, đã đóng | Tên class/schema trùng không đủ chứng minh lỗi hợp đồng. TS dùng declaration, Python dùng AST/import/annotation; test class nội bộ cùng tên giữ chẩn đoán gốc |
| G4 | partial | LOW, còn lưu ý | Nếu checker không cung cấp kiểu truy vết được, chẩn đoán gốc vẫn có trường/type và mã lỗi, không được gắn nhãn bổ sung. Không làm lỗi lọt qua |
| G5 | partial | LOW, ngoài quyền sửa | Mâu thuẫn routing key và thiếu quy tắc version nội bộ được ghi trong baseline, PO xử lý; spec xác nhận không chặn slice |

Kết luận Lần 1: Không còn missing/contradicts/unrequested ở AC chính. Bước sau: PR, CI remote và PO QC độc lập bằng spec-converge-skill; PO quyết baseline. Kết luận này đã được QC độc lập Lần 1 chỉ ra giới hạn; xem Lần 2.

## Lần 2 — 19/11/2026 · spec-execution-skill / Dev tự QC

Đối chiếu lại AC01/AC02, EC01–EC09, S01–S03 và QC độc lập Lần 1 trên nhánh đã cập nhật `dd0a434` (main `f88adb4`). Không sửa qc-report.md hoặc docs. Test là bằng chứng tự QC của Dev, chưa thay QC độc lập.

### 1. Lệnh đã chạy

| Lệnh | Kết quả thật |
| --- | --- |
| check-pid PID-00008 | Đủ hồ sơ, không cảnh báo |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=3` | Thoát 1 do generate-ts không đổi tên được thư mục generated (Windows EPERM). Trong lượt này contracts:test đạt 12/12, 0 skip; contracts:lint đạt. Các target phụ thuộc generate chưa chạy, không ghi đạt |
| `pnpm --filter @sires/contracts typecheck` và `build` | Đạt, dùng output generated hiện có; không thay thế việc xác nhận generate mới |
| `uv run ruff check libs/ts/contracts/scripts/check-drift-python.py libs/ts/contracts/scripts/__fixtures__/python` | Đạt |
| `pnpm nx run @sires/contracts:check-drift` | Thoát 1 vì EPERM khi rename thư mục generated TS/Python; không ghi đạt |
| WSL thử generate/check-drift | Không đạt: EACCES khi rename generated; Nx native của node_modules Windows không chạy được trong Linux. Không sửa generator để né lỗi môi trường |
| Workspace tạm mới, sao source hiện tại và liên kết dependency; gọi checkDrift với graph Nx thật | Generate TS/Python đạt (9 API nội bộ, 42 message); Python agent-core/knowledge/sires-common đạt. Lượt tổng hợp đầu thoát 1 do thiếu liên kết jose mới từ main. Sau pnpm install --frozen-lockfile, gọi checkTypeScript lại trên đúng workspace tạm và graph thật: 14 project đạt, thoát 0. Không ghi lệnh tổng hợp ban đầu là đạt |
| `node scripts/docs/update-index.mjs --check` | Đạt: 159 PID, không sửa index/taskboard |
| `node scripts/docs/add-license.mjs --check` | Thoát 1: 9 file cache thiếu license, cùng giới hạn lịch sử; file source của thay đổi đều có header |
| `git diff --check`; file đổi qua check-tracks --stdin | Đạt; chỉ contracts và kết quả ticket ở repo |
| `check-pid PID-00008 --result` | KẾT QUẢ ĐỦ, 0 cảnh báo; trạng thái Đang làm — chờ PO G2 |

Fixture Python ban đầu dùng str thay cho model Id nên bản đúng lỗi arg-type; đã sửa sang Id(UUID(...)). Ruff tách import làm lệch số dòng kỳ vọng; đã sửa số dòng trước lượt đạt 12/12. Không ghi lỗi ban đầu thành đạt.

### 2. AC và edge case

- AC01 TS / EC01: test allOf ở spec tạm và hợp đồng thật nêu ResearchProject, UsageRecordedMessage; envelope đọc/ghi thoát lỗi, fixture đúng đạt. Partial và object lồng có nhãn ResearchProject, EventEnvelope.aggregate.
- AC01 Python / EC06: constructor có alias một dòng/nhiều dòng đều nêu fieldNotInSpec, Aggregate và đúng file:dòng:cột. Bỏ kwarg thì đạt. Class Aggregate nội bộ trùng tên giữ lỗi mypy gốc, không nhãn hợp đồng.
- G2: fixture `message-data-extra.ts` phủ đọc, gán thuộc tính và thay object. Test trên hợp đồng thật xác nhận cả ba hiện đạt do index signature; đây là test mô tả giới hạn, chưa phải AC01 phần data đã đạt. Cần PO quyết; không tự coi giới hạn được chấp nhận.
- EC02–EC04, EC07: test hồi quy đạt trong 12/12. EC05: graph và kiểm tạm phủ đủ 14 project. EC08/EC09: giữ bằng chứng baseline Lần 1, không chạy bundle lại vì không sửa nguồn hợp đồng; baseline Lần 2 nêu commit mới và giới hạn data. Không có UI.
- AC02: report có bổ sung baseline Lần 2, giới hạn của dòng check-drift đạt; chưa được PO duyệt, N7 không phải điều kiện merge riêng.

### 5. Tự đối chiếu (spec-converge-skill, DEC-58)

| G từ QC độc lập Lần 1 | Loại / mức | Đối chiếu và trạng thái |
| --- | --- | --- |
| G1 | partial / HIGH, đã sửa | generatedSchemas tra kiểu components.schemas trước thành phần allOf; test ResearchProject và UsageRecordedMessage trên hợp đồng thật đạt |
| G2 | partial / HIGH, còn mở | Có fixture và test envelope/data/valid, report ghi Cần PO. Chưa có quyết định của PO nên chưa đóng, chưa đặt Xong |
| G3 | partial / MEDIUM, đã sửa | AST ghép call-arg theo span call; test constructor một/nhiều dòng, alias, valid và local cùng tên đạt |
| G4b/c | partial / LOW, đã sửa | Inline path EventEnvelope.aggregate và mapped Partial truy về schema; test đạt |
| G4a | partial / LOW, còn lưu ý | Nhãn Data29 là tên model Python thật từ generator; chưa đổi tên model hoặc bộ sinh |

Không có thay đổi ngoài phạm vi, service, CI hoặc docs. Bước tiếp theo: PO chọn G2 trong phiên; Dev thực hiện phần phụ thuộc rồi tự QC lại trước trạng thái Xong — chờ QC. Giới hạn môi trường của lượt kiểm repo được ghi riêng, không dùng kết quả Lần 1 thay cho Lần 2.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
