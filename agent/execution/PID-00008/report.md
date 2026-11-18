# PID-00008 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00008](../../../docs/tickets/issues/PID-00008/index.html) · **Luồng:** `contracts` · **Giai đoạn:** PH-01
- **Nhánh:** `contracts/check-drift-baseline` (mã: `3f7ca0f`, ký SSH) · **PR:** [#35](https://github.com/toilatrung/sires/pull/35)
- **Cập nhật:** 18/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

- Slice: 3/3 xong. Bị chặn: không có.
- AC: 2/2 đạt ở mức kiểm cục bộ bằng compiler/mypy và báo cáo baseline. Edge case: 9/9 đã kiểm/ghi bằng chứng.
- Yêu cầu thêm: 0.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Sinh lại type, kiểm project TS theo Nx, báo đúng trường/schema; fixture và test | Xong | tạo check-drift.mjs, check-drift.spec.mjs, fixture TS/YAML; sửa package.json, README của contracts |
| S02 | Kiểm project Python và fixture dùng model/client sinh; thiếu uv | Xong | tạo check-drift-python.py, fixture Python; mở rộng script/test trong contracts |
| S03 | Kiểm baseline DBQ-03/04, bản gộp và mâu thuẫn hợp đồng | Xong | mục Baseline hợp đồng bên dưới |

## 3. Kết quả

- Hồ sơ check-pid đạt, không cảnh báo. PID-00007 đã merge qua PR #33 tại `eb31e4d`; nhánh xuất phát từ main này.
- check-drift sinh lại TS/Python, kiểm 14 project TS từ đồ thị Nx và ba project Python; mọi lỗi thoát khác 0. Cờ --ts-only/--python-only và đường dẫn fixture hỗ trợ kiểm riêng.
- Lỗi hợp đồng có file:dòng:cột, trường, schema/model; lỗi nội bộ giữ nguyên. Không sửa service, cấu hình mypy của service, docs hay workflow CI.
- 10/10 test đạt. Generate/typecheck/check-drift đạt; affected lint/typecheck/test/build đạt trên 14 project và 1 target phụ thuộc trong WSL. Ruff của helper đạt.
- Bản public OpenAPI gộp lại bằng Redocly 2.11.1 khớp ngữ nghĩa YAML với dist đã commit. DBQ-03/04 được kiểm trong nguồn, type TS và model Pydantic. Baseline có mâu thuẫn routing key cần PO quyết, theo đúng hồ sơ không chặn slice.
- Đã tự chạy spec-converge-skill ở chế độ Dev; chi tiết AC/EC và giới hạn trong self-qc.md. Chưa có QC độc lập hoặc quyết định duyệt baseline của PO.

## 4. Việc còn lại

Không còn việc triển khai trong phạm vi. PO review PR, QC độc lập và quyết baseline. Gắn lệnh vào pipeline là PID-00009; quy tắc version nội bộ và sửa routing key thuộc PO.

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** Giải quyết các điểm routing key ghi ở mục Baseline; thêm quy tắc version nội bộ trước khi bật kiểm thay đổi phá vỡ (ngoài scope, H2). Các đoạn ticket ghi PID-00007 “chưa làm” đã cũ so với main `eb31e4d`.
- **Yêu cầu hợp đồng:** Không có.
- **Còn mở:** Không có điểm mới đang chặn.
- **Bước tiếp theo:** Thực thi các slice, tự QC, commit/push và mở PR theo yêu cầu trong phiên; PO QC độc lập và duyệt baseline.
- **Tài liệu đi kèm:** Không có.

## Baseline hợp đồng

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

**Kết luận: Baseline sẵn sàng cho PO duyệt.**

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
