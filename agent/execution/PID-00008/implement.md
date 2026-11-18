# PID-00008 — Triển khai

- **Ticket:** [PID-00008](../../../docs/tickets/issues/PID-00008/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 18/11/2026

## 1. Luồng đã triển khai

`pnpm nx run @sires/contracts:check-drift` chạy script check-drift.mjs, không cache kết quả. Script đọc đồ thị Nx bằng CLI có sẵn, sinh lại TS, kiểm các project TS phụ thuộc contracts trực tiếp/gián tiếp; tiếp tục sinh Python và kiểm agent-core, knowledge, sires-common. Có lỗi ở bất kỳ phần nào thì thoát 1. Lệnh không sửa hợp đồng hoặc mã service.

1. `readGraph()` ghi đồ thị JSON vào thư mục tạm hệ thống, đọc rồi dọn. `contractProjects()` duyệt dependency có chống vòng lặp; hiện gồm 14 project, kể cả contracts để kiểm type sinh.
2. TypeScript đọc tsconfig của từng project và chạy compiler API tương đương noEmit. Giữ compiler options, bỏ giới hạn rootDir chỉ trong lần kiểm, trỏ các package workspace về src/index.ts để kiểm type hợp đồng mới thay vì declaration cũ trong dist. Không cần build lại hoặc sửa cấu hình service.
3. Với lỗi đọc property hoặc object literal có trường lạ, lấy contextual type/receiver type và lần về declaration trong contracts/src/generated. Nếu chứng minh được nguồn, in file:dòng:cột, trường, schema/message. Lỗi khác giữ chẩn đoán TypeScript gốc. Mọi lỗi đều làm kiểm thất bại.
4. Python chạy helper qua uv của workspace. Helper gọi mypy API theo cấu hình project, giữ các lỗi của lần kiểm đó. Với project, kiểm thêm bằng cấu hình strict ở root, follow-imports=silent và chỉ loại generated khỏi việc tìm source: giữ type của dependency khi cấu hình project thường skip model sinh, không sửa cấu hình của project. Với fixture, chỉ kiểm consumer được truyền vào, giữ type của import và không báo lỗi implementation của dependency import.
5. Helper đọc AST các model/client sinh để lập inventory field và inheritance. Nó ghép lỗi attr-defined/call-arg của mypy với import alias, annotation, receiver và vị trí truy cập trong AST consumer. Chỉ gắn nhãn hợp đồng khi xác nhận được kiểu đến từ sires_common.generated; class nội bộ trùng tên vẫn giữ chẩn đoán gốc. Tất cả chẩn đoán và trạng thái mypy trả về JSON cho Node; JSON ASCII escape để chạy được trên Windows codepage khác UTF-8.
6. Thiếu uv: vẫn sinh/kiểm TS, báo rõ phần Python chưa kiểm và thoát lỗi. CLI nhận --ts-only, --python-only và các đường dẫn fixture; cờ ngôn ngữ không khớp fixture hoặc cờ lạ đều bị từ chối.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Bất biến | Test |
| --- | --- | --- | --- | --- | --- | --- |
| checkDrift | Điều phối | `scripts/check-drift.mjs:158` | Sinh lại rồi kiểm hai ngôn ngữ, tổng hợp mã lỗi | Điểm vào AC01/AC02 | Không báo đạt nếu có lỗi hoặc thiếu uv | check-drift.spec.mjs › EC03/EC04/EC07, lệnh toàn repo |
| contractProjects | Duyệt graph | `scripts/check-drift.mjs:36` | Tìm consumer trực tiếp/gián tiếp qua graph Nx | Không bỏ sót project chỉ khai phụ thuộc | Chống vòng lặp, không quét project ngoài dependency | test Nx graph |
| typescriptDiagnostics | Compiler API | `scripts/check-drift.mjs:68` | Kiểm semantic và xác nhận declaration của kiểu | Báo đúng trường/schema cho AC01 | Không gán lỗi nội bộ thành lệch hợp đồng chỉ vì tên giống nhau | EC01 đọc/ghi object; EC02 lỗi nội bộ và class trùng tên |
| checkPython | Adapter | `scripts/check-drift.mjs:130` | Chạy helper tại project/fixture, tổng hợp lỗi | Nối Node CLI với mypy | Giữ mã lỗi, stdout/stderr của checker | EC06, lệnh toàn repo |
| generated_accesses | Phân tích AST | `scripts/check-drift-python.py:78` | Xác nhận kiểu receiver từ import/annotation, theo root/nested field | Gắn model chuẩn cho lỗi Python | Phân biệt generated với class nội bộ | model root, client, local-model và project skip imports |
| main | Mypy adapter | `scripts/check-drift-python.py:144` | Giữ project check, thêm consumer check, xuất JSON | Không bỏ qua model vì cấu hình follow_imports=skip | Không sửa config hay file sinh | Python valid/invalid, fixture project có override skip |

### Thuật toán: nhận diện lỗi thuộc hợp đồng

- TS dùng type checker và declaration thực tế; không chỉ dựa vào nội dung tên type trong chuỗi lỗi. Chỉ declaration dưới thư mục generated mới được coi là hợp đồng. Generic/nguồn kiểu không xác minh được giữ nguyên chẩn đoán và vẫn thoát lỗi.
- Python dùng chẩn đoán mypy làm nguồn lỗi, AST chỉ bổ sung provenance của kiểu để gắn nhãn. Chạy hai lượt khi cần để giữ lỗi theo project đồng thời tránh model bị Any do skip imports. Không suy rằng mọi lỗi có tên class giống model đều là lỗi hợp đồng.
- Chi phí chính là sinh mã và compiler/mypy. TS chạy tuần tự từng project để giới hạn bộ nhớ. Python inventory được đọc theo lần gọi helper, chỉ phân tích AST consumer khi có lỗi cần gắn nhãn.

## 3. Quyết định kỹ thuật trong phạm vi

- Dùng Node test runner, TypeScript và Nx đã có; không thêm dependency hoặc sửa lockfile.
- Dùng mypy và cấu hình strict hiện có ở root, không thêm plugin hoặc sửa pyproject của service. Lượt kiểm bổ sung giữ type import nhưng không thay thế lỗi của lượt kiểm project.
- TypeScript compiler API giữ configFilePath để resolve các type như vite/client đúng thư mục project. Source aliases tránh lỗi do dist stale; rootDir được bỏ chỉ cho noEmit khi kiểm source nhiều package.
- Fixture cố ý sai nằm trong scripts/__fixtures__, không nằm trong src hoặc service thật; không bị đưa vào build TypeScript của contracts. Test Python sinh model vào workspace tạm riêng để không đụng đầu ra của sires-common:test khi CI chạy song song.
- Không gắn check-drift vào workflow: thuộc PID-00009. Không kiểm thay đổi phá vỡ/phiên bản, route controller hoặc routing key tĩnh (N2–N4, N6); mâu thuẫn nguồn chỉ ghi trong baseline.
- Mọi đường gọi checker đều kiểm lại sau generate; không có --skip-generate hoặc cache kết quả có thể che type cũ.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
