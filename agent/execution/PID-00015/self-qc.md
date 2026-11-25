# PID-00015 — Self-QC của Dev

**Kết luận:** Đạt (Lần 2, 24/11/2026) — 0 CRITICAL, 0 HIGH, 0 MEDIUM; 6 LOW còn mở (QC-G4, QC-G5 chuyển PID-00038)

- **Ticket:** [PID-00015](../../../docs/tickets/issues/PID-00015/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 25/11/2026 (Lần 2: chuyển kết quả rà 24/11/2026 theo PC-04 A7)

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

Chạy 18/11/2026 trên nhánh `gateway/spk-02-oidc-stub` (từ `origin/main` `de98a18`), Linux, Node 22.23.3, pnpm 10.34.9.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm --filter @sires/gateway exec vitest run --dir spikes/spk-02` | Đạt: 1 file, 4/4 test (`luồng đầy đủ trên stub (discovery)`, `(static)`, `không khả dụng`, `hết hạn`) |
| `pnpm nx run @sires/gateway:test` | Đạt: 2 file, 5/5 test (gồm test spike và `app.module.spec.ts`) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Đạt: 19 project |
| `tsc --noEmit` riêng cho `rp.ts`, `flow.spec.ts` (tsconfig tạm extends `tsconfig.base.json`, ngoài repo) | Đạt, 0 lỗi. Spike nằm ngoài `include` của `apps/gateway/tsconfig.json` nên `nx typecheck` không kiểm nó (G2) |
| `pnpm --filter @sires/gateway exec eslint spikes` | Đạt, 0 lỗi |
| Kiểm test bắt được lỗi: tạm làm hỏng `toUnavailable` (luôn trả `undefined`), rồi tạm bỏ single-flight trong `ensureFresh`, chạy lại spike, sau đó khôi phục file | Lần 1: `không khả dụng` lỗi; lần 2: `hết hạn` lỗi; các test khác đạt. File đã khôi phục (so khớp byte với bản lưu) |
| `node scripts/docs/add-license.mjs --check` | File của ticket đủ ghi chú giấy phép. Lệnh báo 7 file thiếu, đều là cache công cụ bị `.gitignore` bỏ qua trên máy (`.pytest_cache/`, `.ruff_cache/`, `*/.mypy_cache/`), không thuộc ticket và không có trong checkout sạch của CI |
| `check-tracks.mjs --stdin` trên file đã đổi và file chưa theo dõi | `gateway, infra, repo`; cảnh báo 2 luồng. `infra` chỉ do `pnpm-lock.yaml` sinh lại khi thêm phụ thuộc vào `apps/gateway/package.json` (quy tắc 1.4.7); `repo` là `agent/execution/PID-00015/`. Xem G3 |
| `check-ui.mjs`, preview | Không có màn hình |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00015 --result` | Đạt (ghi ở mục 5) |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00015-AC01 | `apps/gateway/spikes/spk-02/flow.spec.ts › luồng đầy đủ trên stub (discovery)`, `› luồng đầy đủ trên stub (static)` | Đạt trên stub |
| PID-00015-AC02 | [report.md](report.md) mục 3.3: dòng “ASM-13: chưa kết luận” và bảng K1–K14 | Đạt |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | Đã giải quyết (thao tác tay) | Điểm stub khác tài liệu eTroy ghi ở `report.md` mục 3.3 (K1, K4, K5, K6, K12); đề xuất sửa stub ở mục 6, không sửa `libs/ts/testing` |
| EC02 | Đã giải quyết | `flow.spec.ts › không khả dụng`: 503 và cắt kết nối → `OidcUnavailableError` trước khi chuyển hướng; phiên đang có vẫn dùng tới khi token hết hạn; cách xử lý cho INT-OIDC-004 ở `report.md` mục 3.2 |
| EC03 | Đã giải quyết | `flow.spec.ts › hết hạn`: access token hết hạn → refresh; refresh token hết hạn hoặc bị thu hồi → `ReloginRequiredError` |
| Mới 1 | Cần lưu ý | Refresh đồng thời trên một phiên làm eTroy thu hồi cả family → người dùng bị đăng xuất. Spike chứng minh bằng test và xử lý bằng single-flight; PID-00038 cần khóa theo phiên khi nhiều instance gateway |
| Mới 2 | Cần lưu ý | Nếu eTroy không trả `nonce` (K3) thì đăng nhập thất bại khi kiểm `nonce` như INT-OIDC-001 yêu cầu; PO hỏi đội eTroy |
| Mới 3 | Cần lưu ý | Logout của eTroy là `POST` kèm CSRF (K4), còn openid-client dựng URL `GET`; PID-00038 cần cách làm đã được eTroy xác nhận |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- Agent đề xuất, System kiểm soát, Researcher quyết định: không áp dụng (không có thao tác APR).
- Chuyển trạng thái theo PRD 18.2: không áp dụng.
- Context cách ly theo project và task: không áp dụng.
- [x] Gọi model qua Model Gateway: không gọi model. Token, secret không được log; bảng số đo chỉ in nhãn bước và thời gian.
- [x] Không import mã, không đọc database của service khác; chỉ dùng thư viện dùng chung `@sires/testing` (type:lib).
- Sự kiện qua outbox: không áp dụng.
- Migration: không áp dụng.
- Giao diện: không áp dụng.
- [x] Không sửa file trong điểm dừng, file sinh tự động, thư mục luồng khác; không ghi `docs/`. `pnpm-lock.yaml` thay đổi do `pnpm add` sinh lại, không sửa tay (quy tắc 1.4.7).
- [x] Không làm việc ngoài phạm vi; không có yêu cầu thêm.
- [x] Không còn mã gỡ lỗi. `console.info` duy nhất là bảng số đo của spike, chỉ chạy khi `SPK02_TIMINGS=1`. Không có TODO. Tên test theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Chế độ Dev tự QC, 18/11/2026. Đối chiếu với `acceptance.html`, `scope.html` (P1–P3, N1–N3, EC01–EC03), slice S01, spec mục 3 (O1, O2), 5 (B1–B5), 6, 7, và tự chạy lại lệnh ở mục 1. `check-pid.mjs PID-00015 --result`: đạt.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | LOW | Tên test AC01 trong hồ sơ là `luồng đầy đủ trên stub`; mã chạy hai biến thể `(discovery)`, `(static)` | `flow.spec.ts:112` | Giữ: tên gốc vẫn là tiền tố, hai biến thể cùng phủ AC01. PO đổi tên trong `acceptance.html` nếu muốn |
| G2 | partial | LOW | `nx typecheck` không kiểm mã spike (ngoài `include: ["src"]`) | `apps/gateway/tsconfig.json`; mục 1 | Kiểm bằng `tsc --noEmit` riêng; vitest vẫn chạy được. Không sửa tsconfig của service chỉ vì spike |
| G3 | partial | LOW | `check-tracks.mjs` cảnh báo 2 luồng vì `pnpm-lock.yaml` bị xếp vào `infra` | lệnh ở mục 1 | Đúng quy tắc 1.4.7; đề xuất cho PO ở `report.md` mục 6, điểm 5 |
| G4 | unrequested | LOW | Thêm kiểm sai `state`, sai `nonce`, refresh đồng thời và chế độ metadata tĩnh, ngoài danh sách bước của P1 | `flow.spec.ts:112–170`, `flow.spec.ts:207–245` | Giữ: phục vụ INT-OIDC-001-AC02 (ASM-13), bước refresh của P1 và K1; không đổi phạm vi hay hành vi service |

Không có CRITICAL, HIGH, MEDIUM.

## Lần 2 — 24/11/2026

Chuyển từ bản rà ngày 24/11/2026 (QC Lần 2 ở commit `53abe59` của nhánh `qc/t1xnth-qc-pid-1124`, PR #85) theo PC-04 A7: PO quyết không merge bản rà này dưới dạng QC độc lập; kết quả ghi ở đây như Dev tự QC (spec-converge-skill, chế độ Dev tự QC), QC độc lập do PO chạy riêng. `qc-report.md` không đổi.

Người chạy: Dev T1xNTH. Mã đã rà: `origin/develop` `083795b` (PR của ticket đã merge), worktree riêng. Môi trường: Linux (Ubuntu, kernel 6.8), Node 22.23.3, pnpm 10.34.9, Docker Engine 29.9.2. Cột “Sau 24/11” đối chiếu `origin/main` `a367f0b` ngày 25/11/2026 (đọc mã, không chạy lại test).

Lần 1 của QC không tự chạy được test (không có mạng tới npm); lần này chạy lại các lệnh ở ticket mục 8 trên worktree mới (`pnpm install --frozen-lockfile`, `--skip-nx-cache`).

### 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt |
| `pnpm --filter @sires/gateway exec vitest run --dir spikes/spk-02` (trước khi build phụ thuộc) | **Lỗi** — 1 suite fail, 0 test: `Failed to resolve entry for package "@sires/testing"` (QC-G6) |
| `pnpm nx run @sires/gateway:lint` | Đạt |
| `pnpm nx run @sires/gateway:typecheck` | Đạt (không phủ `spikes/`, QC-G2) |
| `pnpm nx run @sires/gateway:test` | Đạt — 2 file, 5/5 (`spikes/spk-02/flow.spec.ts` 4, `src/app.module.spec.ts` 1) |
| `pnpm nx run @sires/gateway:build` | Đạt |
| `SPK02_TIMINGS=1 pnpm --filter @sires/gateway exec vitest run --dir spikes/spk-02` (sau khi build phụ thuộc) | Đạt — 1 file, 4/4 |
| `tsc --noEmit --strict --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck --types node spikes/spk-02/rp.ts spikes/spk-02/flow.spec.ts` (trong `apps/gateway`) | Đạt, exit 0 — bù cho QC-G2 |
| `eslint spikes` (trong `apps/gateway`) | Đạt, exit 0 |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00015 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| `check-tracks.mjs`, `nx affected` | Không chạy — PR #29 đã merge, không còn diff riêng của PID này |

### 2. AC và edge case

| AC | Kết quả |
| --- | --- |
| PID-00015-AC01 | Đạt: `flow.spec.ts › luồng đầy đủ trên stub (discovery)`, `› (static)` trong 4/4 (sau khi build phụ thuộc, QC-G6) |
| PID-00015-AC02 | Đạt (đọc báo cáo): `report.md` mục 3.3, ASM-13 chưa kết luận, bảng K1–K14 không đổi |

EC02 `› không khả dụng` (`flow.spec.ts:172`), EC03 `› hết hạn` (`flow.spec.ts:207`) đạt; EC01 thao tác tay, không đổi.

### 5. Tự đối chiếu (spec-converge-skill, chế độ Dev tự QC)

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) ngày 24/11 | Sau 24/11 |
| --- | --- | --- | --- | --- | --- |
| QC-G1 | partial | LOW | Tên test AC01 có hậu tố `(discovery)`, `(static)` so với `acceptance.html` (trùng G1 mục 5) | `apps/gateway/spikes/spk-02/flow.spec.ts:111` | Còn mở; PO đổi tên trong `acceptance.html` khi tiện |
| QC-G2 | partial | LOW | `nx typecheck` không kiểm `spikes/` (trùng G2 mục 5) | `apps/gateway/tsconfig.json` `include: ["src"]` | Còn mở; bù bằng `tsc` riêng ở mục 1. PID-00038 viết mã trong `src/` |
| QC-G3 | partial | LOW | `check-tracks` báo `infra` chỉ do `pnpm-lock.yaml` (trùng G3 mục 5) | lệnh `check-tracks.mjs` của Lần 1 | Còn mở; cần ticket luồng infra |
| QC-G4 | partial | LOW | Mọi `TypeError` trong chuỗi `cause` bị xếp là “không khả dụng” (EC02, INT-OIDC-004) | `apps/gateway/spikes/spk-02/rp.ts:262` | Chuyển PID-00038 |
| QC-G5 | partial | LOW | `PendingLogin.createdAt` không được kiểm hạn ở callback (INT-OIDC-001) | `rp.ts:39`, `rp.ts:123` | Chuyển PID-00038 |
| QC-G6 | partial | LOW | Hướng dẫn chạy lại (O1, B2) thiếu bước build `@sires/testing`: lệnh spike lỗi trên worktree mới | `agent/execution/PID-00015/report.md:30–31`; lệnh ở mục 1 | Còn mở; đề xuất PO ghi `pnpm nx run @sires/gateway:test` ở ticket mục 8, spec mục 6, slice S01 |

Không có `contradicts`, không có CRITICAL, HIGH, MEDIUM. Lệch với mục 1 Lần 1: lệnh spike ghi chạy được ngay sau `pnpm install`; trên worktree mới cần build `@sires/testing` trước (QC-G6). Số test 4/4 khớp. Đề xuất 1 của Lần 1 (`nonce` trong ID token của eTroy) vẫn là điều kiện cho PID-00038.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
