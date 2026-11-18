# PID-00007 — Self-QC của Dev

**Kết luận:** Đạt — 3/3 AC; không còn CRITICAL/HIGH; giới hạn môi trường và cảnh báo bên dưới.

- **Ticket:** [PID-00007](../../../docs/tickets/issues/PID-00007/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 18/11/2026

## 1. Lệnh

Kiểm trong WSL Ubuntu 24.04 trên bản sao `/tmp/sires-pid00007-validation`, lấy từ nhánh hiện tại rồi chép đúng file đã đổi. Node 24.22.3, pnpm 10.34.9, uv 0.12.23, Python 3.12.15, Docker có sẵn. Không sửa bản spec để chạy test.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile`; `uv sync --all-packages` | Đạt trên bản sao sạch trong WSL |
| `pnpm nx run @sires/contracts:generate` | Đạt: 9 client nội bộ, 42 payload TS và 42 model message Pydantic; giữ API TS công khai/nội bộ đang có |
| `pnpm nx run @sires/contracts:typecheck` | Đạt; inventory 42 message và lỗi thiếu attempt có kiểm TypeScript |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=3 --outputStyle=static` | Đạt trên 15 project bị ảnh hưởng trong WSL |
| `pnpm nx run-many -t lint typecheck test build --projects=@sires/contracts,sires-common --parallel=3 --outputStyle=static` | Đạt sau cập nhật formatter builtin, header giấy phép và cấu hình wheel; 3 test generator, 79 test sires-common |
| `pnpm nx run sires-common:test --outputStyle=static` sau cấu hình testpaths | 79/79 đạt trong WSL, còn 2 cảnh báo deprecation; không còn thu thập file generated như test |
| `uv run --package sires-common python -m pytest libs/py/sires_common/tests/test_contracts_import.py` | 13/13 đạt trên Windows và WSL; gồm 9 client, 2 môi trường thư mục consumer, validation và inventory model |
| `uv build --package sires-common --wheel --out-dir .nx/contracts/wheels` | Đạt; wheel có manifest, mã sinh, không có pyc |
| `uv run --isolated --no-project --with .nx/contracts/wheels/sires_common-0.0.0-py3-none-any.whl --python 3.12 python ...` | Import 570 module client/model từ wheel trong môi trường mới, không dùng editable source |
| `UV_PROJECT_ENVIRONMENT=/tmp/sires-pid00007-runtime uv run --no-dev --package sires-agent-core python ...`; tương tự sires-knowledge | Cả hai runtime import được service và client/model sinh, không cần dependency dev |
| Chuyển cả hai thư mục generated vào `.nx/contracts/cache-test-*`, chạy lại Nx generate | Nx báo local cache và khôi phục đủ cả hai thư mục; messages.ts và messages.py tồn tại |
| `node scripts/docs/add-license.mjs --check` | Toàn repo: còn 8 file cache thiếu header trên Windows, 4 trên bản sao WSL. Không thuộc source ticket; mã Python sinh đã mang header từ generator. Kiểm riêng file thay đổi: không thiếu header |
| Danh sách file đổi và mới qua `node scripts/development/check-tracks.mjs --stdin` | Thoát 0, cảnh báo contracts/infra/platform vì scanner phân loại sires-common và uv.lock. Mọi file là output hoặc cấu hình cần thiết của PID dùng chung, được spec brief/quy tắc 1.4.1 cho chạm nhiều thư mục dùng chung; không sửa app service hay docs |
| `git diff --check`; git check-ignore và git ls-files hai thư mục generated | Diff sạch; cả hai đầu ra bị ignore, không có file sinh được theo dõi |
| Windows: `pnpm nx affected -t lint typecheck test build` | Lần đầu lỗi EPERM khi rename thư mục generated do Nx giữ khóa; không ghi đạt. Sau `pnpm nx reset`, `node libs/ts/contracts/scripts/generate.mjs` đạt với mã cuối. Bộ affected đầy đủ được xác nhận bằng WSL ở trên |
| UI | Không có màn hình trong ticket |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00007-AC01 | `src/messages.check.ts` → typecheck; `scripts/generate.spec.mjs` → thêm message, sinh lại có type | Đạt; đủ 42 message, cả map và alias được xuất từ package |
| PID-00007-AC02 | `test_contracts_import.py` → test_import, test_import_from_service; kiểm wheel và runtime không dev | Đạt; 9 client, đủ 55 operationId từ hợp đồng; import 570 module; cả agent-core và knowledge import được |
| PID-00007-AC03 | `test_contracts_import.py` → test_message_model | Đạt; payload hợp lệ, bỏ từng trường bắt buộc đều lỗi, attempt 0/4 và agent không tồn tại đều bị từ chối |

## 3. Edge case

| # | Trạng thái | Cách giải quyết hoặc lưu ý |
| --- | --- | --- |
| EC01 | Đã giải quyết | Test spec sai cú pháp trên bản sao tạm, kiểm lỗi có tên file và đầu ra cũ còn nguyên; staging được dọn |
| EC02 | Đã giải quyết | Test subprocess bỏ uv khỏi PATH: Python lỗi rõ có hướng dẫn --ts-only; sinh TS riêng vẫn đạt |
| EC03 | Đã giải quyết | git check-ignore nhận cả đầu ra; git ls-files không có file sinh; git status chỉ có mã nguồn/cấu hình/báo cáo |
| Mới: schema alias allOf | Đã giải quyết | Generator ban đầu cảnh báo model trùng làm mất endpoint result/failure và response retrieval. Gộp alias chỉ có ref/annotation, bật fail-on-warning và đối chiếu toàn bộ operationId; 55/55 có module |
| Mới: wheel bỏ file gitignored | Đã giải quyết | Hatch artifacts bao gồm generated; build wheel rồi import toàn bộ module trong môi trường isolated đạt |
| Mới: pytest thu thập endpoint có tên test_* | Đã giải quyết | Cấu hình testpaths chỉ thư mục tests; generated không phải test nguồn |
| Mới: khóa thư mục trên Windows | Cần lưu ý | Dừng Nx daemon bằng pnpm nx reset rồi generate đạt; nền tảng hồ sơ yêu cầu Linux/WSL2, bộ đầy đủ đã kiểm WSL |
| Mới: naming hint và deprecation | Cần lưu ý | datamodel-code-generator đánh số model inline trùng tên (Data1…); alias message ổn định và mọi schema dùng được. Testcontainers/FastAPI có cảnh báo deprecation từ dependency; không đổi hợp đồng hay SDK trong ticket này |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh kiểm và kết quả ở trên.
- [x] Nguồn hợp đồng chỉ đọc, không đổi API/schema/required field; mã sinh không sửa tay và không commit.
- [x] Không import mã hoặc database của service khác; consumer dùng hợp đồng sinh.
- [x] Không có provider call, dữ liệu thật hay khóa API trong test/log; không thay APR, state machine, provenance hoặc context runtime.
- [x] Không có migration hay UI; các quy tắc migration/outbox/UI không áp dụng.
- [x] File thay đổi đều là output hoặc cấu hình cần thiết của S01/S02; không ghi docs hay app service khác.
- [x] Không có yêu cầu ngoài hồ sơ, mã gỡ lỗi hoặc TODO không có chủ; console của CLI chỉ báo kết quả/lỗi công cụ.
- [x] Đã tự chạy spec-converge-skill theo DEC-58, không tạo qc-report.md; không còn CRITICAL/HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đối chiếu lại mã hiện tại với P1/P2, N1–N3, O1–O5, B1/B2, S01/S02 và ba AC. O1–O5 đều có; index.ts có sẵn đã re-export generated/index.ts nên không cần sửa tay một lớp export khác. Chưa có QC độc lập của PO.

| G | Loại | Mức | Mô tả | Bằng chứng | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | HIGH, đã đóng | Client generator bỏ endpoint do alias làm trùng model inline | `generate.mjs:47`, `generate.mjs:158`, `test_contracts_import.py:27` | Fold alias không thay ràng buộc; fail-on-warning; đủ 55 operationId; import mọi module |
| G2 | partial | MEDIUM, đã đóng | Mã gitignored có thể thiếu trong wheel | `libs/py/sires_common/pyproject.toml:52`; wheel isolated import | Artifacts + build wheel + import 570 module đạt |
| G3 | partial | LOW, đã đóng | Formatter ruff không có trong môi trường tool WSL mới | `generate.mjs:152` | Dùng formatter builtin của phiên bản tool đã pin; generate WSL mới đạt |
| G4 | partial | LOW, đã đóng | Pytest thu thập file client có tên test_provider_connection | `libs/py/sires_common/pyproject.toml`, testpaths | Chỉ thu thập tests/; không sửa file sinh |
| G5 | partial | LOW, còn lưu ý | Công cụ kiểm license quét cache; scanner luồng không nhận ngoại lệ PID dùng chung | Bảng lệnh mục 1 | Không sửa công cụ infra ngoài scope; source ticket có license, mọi đường dẫn truy được về spec |

Không có missing/contradicts/unrequested còn mở ở chức năng chính; không có CRITICAL/HIGH còn lại. PO chạy QC độc lập sau khi có PR chứa mã.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
