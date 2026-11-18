# PID-00008 — Self-QC của Dev

**Kết luận:** Đạt — 2/2 AC, 9/9 edge case có kiểm/bằng chứng; không còn CRITICAL/HIGH. Baseline chờ PO duyệt, không phải đã duyệt.

- **Ticket:** [PID-00008](../../../docs/tickets/issues/PID-00008/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 18/11/2026

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

Không còn missing/contradicts/unrequested ở AC chính. Bước sau: PR, CI remote và PO QC độc lập bằng spec-converge-skill; PO quyết baseline.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
