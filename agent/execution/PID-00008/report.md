# PID-00008 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00008](../../../docs/tickets/issues/PID-00008/index.html) · **Luồng:** `contracts` · **Giai đoạn:** PH-01
- **Nhánh:** `contracts/check-drift-baseline` (mã: `3f7ca0f`, ký SSH) · **PR:** [#35](https://github.com/toilatrung/sires/pull/35)
- **Cập nhật:** 19/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

- Lần 3: 3/3 slice xong. Đã merge main `989d65f` (H5/P5/EC10), sửa G2/G5 và cập nhật baseline hiện hành (G6). Contracts 14/14 test đạt; check-drift toàn repo đạt. Giới hạn lệnh generate/affected trên Windows ghi rõ bên dưới, platform:test chạy riêng một worker đạt 68/68.
- Slice: 3/3 xong. Không còn việc triển khai chặn trong phạm vi; G4a LOW còn lưu ý.
- AC01: test mới bắt đủ đọc, gán và thay data với trường lạ, nêu đúng message; string[] cục bộ giữ chẩn đoán TS gốc. AC02: baseline Lần 3 gắn main `989d65f`; chưa được PO duyệt.
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Sinh lại type, kiểm project TS theo Nx, báo đúng trường/schema; fixture và test | Xong | generate.mjs, generate.spec.mjs, check-drift.mjs, check-drift.spec.mjs, fixture TS/YAML; README của contracts |
| S02 | Kiểm project Python và fixture dùng model/client sinh; thiếu uv | Xong | tạo check-drift-python.py, fixture Python; mở rộng script/test trong contracts |
| S03 | Kiểm baseline DBQ-03/04, bản gộp và mâu thuẫn hợp đồng | Xong | mục Baseline hợp đồng bên dưới |

## 3. Kết quả Lần 1 (18/11/2026, giữ lịch sử)

- Hồ sơ check-pid đạt, không cảnh báo. PID-00007 đã merge qua PR #33 tại `eb31e4d`; nhánh xuất phát từ main này.
- check-drift sinh lại TS/Python, kiểm 14 project TS từ đồ thị Nx và ba project Python; mọi lỗi thoát khác 0. Cờ --ts-only/--python-only và đường dẫn fixture hỗ trợ kiểm riêng.
- Lỗi hợp đồng có file:dòng:cột, trường, schema/model; lỗi nội bộ giữ nguyên. Không sửa service, cấu hình mypy của service, docs hay workflow CI.
- 10/10 test đạt. Generate/typecheck/check-drift đạt; affected lint/typecheck/test/build đạt trên 14 project và 1 target phụ thuộc trong WSL. Ruff của helper đạt.
- Bản public OpenAPI gộp lại bằng Redocly 2.11.1 khớp ngữ nghĩa YAML với dist đã commit. DBQ-03/04 được kiểm trong nguồn, type TS và model Pydantic. Baseline có mâu thuẫn routing key cần PO quyết, theo đúng hồ sơ không chặn slice.
- Đã tự chạy spec-converge-skill ở chế độ Dev; chi tiết AC/EC và giới hạn trong self-qc.md. Chưa có QC độc lập hoặc quyết định duyệt baseline của PO.

## 4. Việc còn lại

Không còn việc triển khai trong phạm vi sau H5/G5. PO QC độc lập Lần 3 và quyết baseline. Gắn lệnh vào pipeline là PID-00009; duyệt baseline là việc của PO, không phải điều kiện merge riêng của PR này (N7).

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** Giải quyết các điểm routing key ghi ở mục Baseline; thêm quy tắc version nội bộ trước khi bật kiểm thay đổi phá vỡ (ngoài scope, H2). Các đoạn ticket ghi PID-00007 “chưa làm” đã cũ so với main `eb31e4d`.
- **Yêu cầu hợp đồng:** Không có.
- **Còn mở:** G2 đã triển khai H5, test và check-drift đạt; không còn HIGH/MEDIUM sau tự QC. Routing key/version nội bộ vẫn là việc ngoài phạm vi của PO; G4a Data29 không chặn merge.
- **Bước tiếp theo:** Thực thi các slice, tự QC, commit/push và mở PR theo yêu cầu trong phiên; PO QC độc lập và duyệt baseline.
- **Tài liệu đi kèm:** Không có.

## Baseline hợp đồng — Lần 1

**Nguồn đã kiểm:** main `eb31e4d805daefd624aa1f83089ea39361b05e5a` (merge PID-00007); mã checker được ghi trong commit `3f7ca0f`. Thư mục docs/api-design không thay đổi trong PID-00008. Kiểm trên source của nhánh hiện tại sau khi sinh lại, không dựa vào file generated đã commit. Baseline chưa được PO duyệt.

### Phiên bản các hợp đồng

| Hợp đồng | info.version | Bằng chứng |
| --- | --- | --- |
| OpenAPI công khai | 0.1.0-mvp | `docs/api-design/openapi.yaml:8` |
| Public bundle đã commit | 0.1.0-mvp | `docs/api-design/dist/openapi.bundled.yaml:4` |
| agent-core, identity, knowledge | 0.1.0-mvp | `docs/api-design/internal/agent-core.yaml:8`, `identity.yaml:8`, `knowledge.yaml:8` |
| library, manuscript, orchestration | 0.1.0-mvp | `docs/api-design/internal/library.yaml:8`, `manuscript.yaml:8`, `orchestration.yaml:8` |
| planning, research, workspace | 0.1.0-mvp | `docs/api-design/internal/planning.yaml:8`, `research.yaml:8`, `workspace.yaml:8` |
| AsyncAPI | 0.1.0-mvp | `docs/api-design/events/asyncapi.yaml:8` |

internal/schemas.yaml, internal/responses.yaml và các component schema là fragment tham chiếu, không có info.version độc lập; không phải client/API root riêng.

### Danh sách kiểm và bằng chứng

| Mục | Kết quả | Bằng chứng file:dòng / kiểm thật |
| --- | --- | --- |
| DBQ-03: usage.recorded có trong AsyncAPI | Đạt | `events/asyncapi.yaml:1234`; name usage.recorded ở 1235 |
| DBQ-03: knowledge phát, orchestration nhận | Đạt | `events/asyncapi.yaml:1245` x-producer knowledge; `:1246` x-consumers orchestration |
| DBQ-04: EventEnvelope.aggregate bắt buộc | Đạt | `internal/schemas.yaml:399` required có aggregate; property ở `:409` |
| DBQ-04: aggregate có type/id/version bắt buộc | Đạt | `internal/schemas.yaml:422` required [type, id, version] |
| DBQ-04: reference.status_changed có metadataVersion bắt buộc | Đạt | `events/asyncapi.yaml:1113`, `:1133` required metadataVersion, định nghĩa ở `:1138` |
| Type TS sinh có DBQ-03/04 | Đạt | `libs/ts/contracts/src/generated/messages.ts:363` UsageRecordedMessage; `:315` ReferenceStatusChangedMessage; `:460` EventEnvelope, `:482` aggregate, `:326` metadataVersion. Assertion TypeScript xác nhận aggregate và type/id/version không optional; usage.type đúng literal; metadataVersion không optional |
| Model Python sinh có DBQ-03/04 | Đạt | `libs/py/sires_common/src/sires_common/generated/messages.py:903` UsageRecordedMessage; `:854` ReferenceStatusChangedMessage; `:320` EventEnvelope, `:314` Aggregate, `:329` aggregate, `:847` metadataVersion. model_json_schema xác nhận required và usage.recorded |
| Sinh TS công khai/nội bộ/AsyncAPI và Python | Đạt | `pnpm nx run @sires/contracts:generate --skip-nx-cache`: 9 client nội bộ, 42 message; tool không báo lỗi |
| Typecheck với type vừa sinh | Đạt | `pnpm nx run @sires/contracts:typecheck --skip-nx-cache` |
| check-drift toàn repo | Đạt | `pnpm nx run @sires/contracts:check-drift`: 14 project TS và agent-core/knowledge/sires-common đạt |
| Public bundle khớp source | Đạt | Redocly CLI 2.11.1 bundle openapi.yaml vào file tạm, parse YAML cả hai bản rồi so bằng nhau. Không sửa dist |

Các đường dẫn nguồn API viết gọn trong bảng đều tương đối docs/api-design. File generated không theo dõi Git; số dòng là đầu ra đã sinh từ nguồn baseline trên, có thể tái tạo bằng generate.

### Mâu thuẫn còn mở và phần ngoài phạm vi

1. **Quy tắc routing key chung.** `internal/schemas.yaml:398` ghi “Routing key = `type`”. `events/asyncapi.yaml:12–14` ghi routing key = type, nhưng với sự kiện đổi trạng thái thì “thêm một đoạn con = trạng thái đích”. Hai đoạn chưa thống nhất về ngoại lệ; PO sửa nguồn, checker không tự chọn quy tắc.
2. **Routing key cho object status.** `events/asyncapi.yaml:1273` ghi “Routing key con `research.object_status_changed.<objectType>`”, trong khi data kế thừa StateChange ở `:1286`. Tương tự `:1296` ghi “Routing key con `manuscript.object_status_changed.<objectType>`”, data là StateChange ở `:1307`. Quy tắc chung `:12–14` lại yêu cầu suffix trạng thái đích cho data StateChange. PO cần chốt suffix objectType hay trạng thái (hoặc dạng kết hợp).
3. **Phiên bản OpenAPI nội bộ.** H2/I2 của PID-00008 xác nhận chưa có quy tắc major cho internal/*.yaml. Kiến trúc 3.6.6 yêu cầu giữ phiên bản cũ khi đổi phá vỡ; README API chỉ có major công khai và schemaVersion của message. Chưa bật kiểm breaking/version trong ticket này; PO bổ sung quy tắc trước PID riêng hoặc PID-00009.

Các mục trên được hồ sơ ghi nhận không chặn S01/S02; S03 phải trình bằng chứng để PO quyết. Không tự sửa hợp đồng, không coi baseline đã được duyệt.

**Kết luận Lần 1: Baseline sẵn sàng cho PO duyệt.** Phạm vi kết quả được làm rõ ở Lần 2 bên dưới.

## Lần 2 — 19/11/2026

Căn cứ: yêu cầu trong phiên “fix pr theo cmt”, QC độc lập Lần 1 ở PR #35; đã fast-forward nhánh lên `dd0a434` (gồm main `f88adb4`) trước khi sửa. Không sửa docs hoặc qc-report.md. Baseline Lần 1 giữ để truy vết; nguồn hợp đồng hiện tại có thêm mã lỗi 415/429 từ main.

| Góp ý | Xử lý | Kết quả |
| --- | --- | --- |
| G1 HIGH | Lập bảng kiểu components.schemas và tra kiểu bao ngoài trước thành phần allOf; test spec tạm allOf và hợp đồng thật | ResearchProject và UsageRecordedMessage đúng tên khi đọc/ghi trường thừa |
| G2 HIGH | Thêm fixture message envelope, data (đọc, gán property, thay object) và hợp lệ; test trên hợp đồng thật; README ghi giới hạn | Cấp envelope bị bắt; data vẫn đạt theo index signature hiện tại. Cần PO, chưa đóng |
| G3 MEDIUM | Ghép lỗi call-arg theo span của lời gọi constructor; fixture một dòng/nhiều dòng, import alias và class local trùng tên | Hai lỗi có file:dòng:cột, fieldNotInSpec và model Aggregate; bản đúng đạt; class local giữ lỗi gốc |
| G4 LOW | Tên object lồng có đường dẫn EventEnvelope.aggregate; Partial truy về ResearchProject | Đã kiểm TS. Python Data29 giữ tên model thực tế, chưa đổi bộ sinh |

**Cần PO (G2):** Theo review và điểm dừng “Không đoán hành vi” của spec-execution-skill: (1) chấp nhận giới hạn, (2) giao sửa bộ sinh để thay data của envelope bằng schema riêng, hoặc (3) PO sửa hợp đồng qua contract-updating-skill. Chưa có câu trả lời nên không tự chốt, chưa đặt Xong — chờ QC.

**Baseline Lần 2:** kết quả check-drift đạt (nếu có) không chứng minh TS chặn trường lạ trong data của message có index signature. Bằng chứng là test `real contracts: allOf names and current additionalProperties data limitation` và fixture `message-data-extra.ts`. Baseline chưa được PO duyệt; N7 không phải điều kiện merge PR này.

**Kiểm Lần 2:** contracts:test 12/12 đạt (0 skip), lint/Ruff/typecheck/build riêng contracts đạt. Lệnh affected và check-drift trực tiếp bị EPERM khi thay thư mục generated; không ghi đạt. Trong workspace tạm mới, generate TS/Python và cả ba project Python đạt; sau đồng bộ dependency bằng frozen lockfile, kiểm lại đủ 14 project TS đạt. Chi tiết và lỗi môi trường trong self-qc.md. check-pid --result đạt, 0 cảnh báo; diff sạch. Kiểm license toàn repo còn 9 file cache thiếu header, file source thay đổi đủ license.

## Lần 3 — 19/11/2026

Căn cứ: comment PO/QC Lần 2 ở PR #35 và hồ sơ H5/P5/EC10 đã vào main qua PR #37. Đã merge main trước khi triển khai. Không còn chờ quyết định G2; không sửa docs hoặc qc-report.md. Làm ở worktree riêng, không đụng thay đổi PID-00025 trong workspace chính.

| Góp ý | Triển khai / bằng chứng | Kết quả |
| --- | --- | --- |
| G2 HIGH, H5 | generate.mjs biến đổi AST type message: dùng Omit bỏ data gốc rồi ghép data riêng, theo ref/allOf; giữ required và các trường envelope. Test EC10 và CLI trên hợp đồng thật | Đọc, gán thuộc tính và thay data có fieldNotInSpec đều lỗi, nêu UsageRecordedMessage.data; payload đúng đạt |
| G5 MEDIUM, EC02 | Chỉ gắn nhãn cho type có declaration generated; thêm local-array.ts, spec tạm có array property và test trên hợp đồng thật | string[] cục bộ trong file import contracts giữ TS2339 nguyên văn, không nhãn hợp đồng |
| G6 LOW | Baseline hiện hành ở mục dưới, thay nguồn cũ bằng main 989d65f / lần đổi API f8c2eba | Đã dựng lại bundle, kiểm DBQ-03/04 và nguồn/type/model mới |
| G4a LOW | Giữ tên model Python Data29, không đổi generator Python | QC xác nhận không chặn merge |

### Baseline hợp đồng — Lần 3, hiện hành

**Nguồn đã kiểm:** main `989d65f5589fb28eed77bc8cf4ada4701e2cf938` đã merge vào nhánh này; commit gần nhất đổi `docs/api-design` là `f8c2eba1b2ee460f44157ae4637af609a0e5f75f` (415/429). `eb31e4d` ở Baseline Lần 1 chỉ là lịch sử. Hợp đồng hiện hành vẫn có info.version `0.1.0-mvp` cho public, 9 API nội bộ và AsyncAPI; không thay hợp đồng trong lần sửa này.

| Mục | Kết quả / bằng chứng hiện hành |
| --- | --- |
| DBQ-03 usage.recorded và producer/consumer | events/asyncapi.yaml:1234–1246; knowledge → orchestration, không đổi |
| DBQ-04 aggregate bắt buộc với type/id/version | internal/schemas.yaml:399, :409, :422; assertion TS và model_json_schema Python đạt |
| DBQ-04 metadataVersion bắt buộc | events/asyncapi.yaml:1133, :1138; assertion TS và model_json_schema Python đạt |
| TS mới sinh | generated/messages.ts:605 UsageRecordedMessage; :524 ReferenceStatusChangedMessage; :731 EventEnvelope, :753 aggregate. Type message dùng data riêng; EventEnvelope vẫn giữ data mở. Kiểm trường bắt buộc qua compiler đạt |
| Model Python | generated/messages.py:903 UsageRecordedMessage, :854 ReferenceStatusChangedMessage, :320 EventEnvelope, :314 Aggregate; messages.py giống từng byte với generator 652dcad trên cùng hợp đồng |
| Đầu ra Python giữ nguyên nghĩa | 572 file .py/.json so với generator 652dcad; 45 client chỉ khác thứ tự import do generator, AST sau chuẩn hóa nhóm import bằng nhau; schema message và manifest không đổi |
| Public bundle khớp nguồn | Redocly 2.11.1 bundle ra file tạm; so YAML với dist đã commit bằng nhau, không sửa dist |
| check-drift toàn repo | Đạt: sinh mới cả hai ngôn ngữ; kiểm 14 project TS và 3 project Python |
| Test contracts / lint / typecheck / build | 14/14 test, 0 skip; lint/typecheck/build của contracts đạt trong lượt affected |
| Giới hạn môi trường | Lệnh generate chạy lại gặp EPERM rename thư mục Python đã sinh; hai lượt affected gặp timeout/ECONNRESET tại platform:test ngoài contracts. Platform chạy riêng một worker đạt 68/68, 11/11 file; các target khác của affected đạt. Chi tiết ghi self-qc.md, không ghi lệnh affected ban đầu đạt |

Mâu thuẫn routing key và thiếu quy tắc version nội bộ ở Baseline Lần 1 vẫn mở, không đổi: internal/schemas.yaml:398 với events/asyncapi.yaml:12–14; suffix objectType tại :1273/:1296 với quy tắc suffix trạng thái. PO xử lý nguồn bằng việc riêng. Duyệt baseline (N7) không phải điều kiện merge riêng của PR này.

**Kết luận baseline: Baseline sẵn sàng cho PO duyệt.** Chưa ghi PO đã duyệt. Giới hạn G2 “trường lạ trong data vẫn đạt” ở Lần 2 đã được H5 khắc phục trong Lần 3.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
