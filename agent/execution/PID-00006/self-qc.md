# PID-00006 — Self-QC của Dev

**Kết luận:** S01–S06 đạt; chưa đạt toàn ticket — S07 chưa có PR/số đo và cần xử lý EC11.

- **Ticket:** [PID-00006](../../../docs/tickets/issues/PID-00006/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 21/11/2026

Môi trường chính: Windows, Node 24.22.3, pnpm 10.34.9, Docker Engine 29.8.2 trong WSL.
Database thật PostgreSQL 16.16 + pgvector 0.8.7. Bộ test riêng không dùng mock database.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00006` | Đủ để thực thi, 0 cảnh báo |
| `pnpm install --frozen-lockfile --offline` | Đạt; lockfile chỉ thêm 49 dòng importer của sample-service, không đổi phiên bản gói khác |
| `NX_DAEMON=false pnpm nx run @sires/sample-service:test` | Đạt: 3 file, 13 test, 0 skip; lần chạy Nx 61,93 giây. Test kiểm trên PostgreSQL thật |
| `pnpm nx run @sires/sample-service:lint` | Đạt, 0 lỗi; Nx đã tạo project graph cho luật import |
| `pnpm nx run @sires/sample-service:typecheck` | Đạt |
| `pnpm nx run @sires/sample-service:build` | Đạt; build loại spec/testkit khỏi dist |
| `node agent/execution/PID-00006/check-migrate.cjs` | Đạt: target Nx migrate tự build, chạy CLI hai lần mã 0, journal giữ đúng 1 migration |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | Không đạt toàn bộ. Lockfile khiến 20 project affected. Test riêng sample-service 13/13 đạt trong lượt này; platform 5 suite lỗi khởi động PostgreSQL: log readiness không xuất hiện sau 60 giây, 131 test đạt và 36 skip vì hook lỗi. Một số pytest ở agent-core/knowledge/sires-common không kết thúc, đã dừng đúng cây tiến trình của lệnh kiểm sau khoảng 10 phút; không coi các tác vụ bị dừng là đạt. Log cục bộ `.nx/pid00006-affected.log` |
| `linux-qc.sh prepare`, `linux-qc.sh offline` | Đạt toàn bộ 13 test trong 28,14 giây trên Linux Node 22. Firewall namespace runner: OUTPUT DROP IPv4/IPv6, chỉ loopback và gateway Docker; kiểm kết nối Internet bị chặn trước test. Test target chạy thật, 4 build phụ thuộc dùng cache. Lượt Docker internal ban đầu lỗi Reaper, 1 fail/12 skip, không coi là đạt; đã sửa cách dựng môi trường và chạy lại đạt. Bằng chứng `validation-offline.txt` |
| `node scripts/docs/add-license.mjs --check` | Trước kiểm diện rộng: 0 file thiếu. Sau Python test: 8 cache file ngoài ticket thiếu notice (`.pytest_cache`, `.ruff_cache`, các `.mypy_cache`); không sửa file cache hoặc script ngoài luồng. Mọi TS, SQL, MD, shell và Dockerfile của ticket có SPDX |
| `node scripts/docs/update-index.mjs --check` | Đạt: 159 PID, taskboard và docs index khớp; không ghi docs |
| `git diff --check` | Đạt |
| File đổi và chưa theo dõi → `check-tracks.mjs --stdin` | `infra, repo`; infra chỉ do importer lockfile, mẫu đang bị tính repo vì script chưa có mapping sample-service (N13). Không sửa script ngoài luồng |
| `nx show projects --affected --files=libs/ts/sample-service/package.json --json` | Chỉ `@sires/sample-service`; xác nhận mẫu không có project phụ thuộc. Đây là kiểm graph, không thay phép đo PR toàn bộ file (EC11) |
| UI | Không có màn hình |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00006-AC01 | `sample.spec.ts › trạng thái, Audit Event và outbox cùng một giao dịch` | Đạt: trạng thái Active/version 2, một event, một audit, cả ba `xmin` bằng nhau |
| PID-00006-AC02 | `sample.spec.ts › sự kiện trùng tác động đúng một lần` và hai EC02/03 | Đạt: FakeBroker phát trùng, bản đến sau và hai transaction song song; tác động 1, inbox 1, kết quả applied/duplicate |
| PID-00006-AC03 | `sample.spec.ts › RLS chặn đọc chéo tài khoản` | Đạt: A thấy 1, B thấy 0; kiểm current_user đúng `_app`, không superuser/BYPASSRLS |
| PID-00006-AC04 | `ddl-pg16.spec.ts › dựng 11 database từ DDL tham chiếu` | Đạt: 12 file/11 database, PostgreSQL 16.16; knowledge vector 0.8.7, vector(1536), HNSW |
| PID-00006-AC05 | `sample.spec.ts › endpoint nội bộ kiểm token nội bộ` | Đạt: client token hợp lệ 200; thiếu/hết hạn/sai chữ ký đều 401 problem+json, invalid_service_token; handler giữ nguyên số lần gọi |
| NFR-MAINT-004-AC01 | Toàn bộ 13 test trong runner chặn Internet | Đạt, 13/13, không skip; `validation-offline.txt` |

## 3. Edge case

| # | Trạng thái | Bằng chứng hoặc việc còn lại |
| --- | --- | --- |
| EC01 | Đã giải quyết | Deferred constraint trigger trong test gây lỗi tại commit sau state/event/audit; state vẫn Created/version 1, outbox rỗng |
| EC02 | Đã giải quyết | Gửi lại cùng envelope sau lần commit đầu: duplicate, effects=1, inbox=1 |
| EC03 | Đã giải quyết | Promise.all hai lần handle dùng pool `_system` nhiều connection: một applied, một duplicate; effects=1, inbox=1 |
| EC04 | Đã giải quyết | Sau transaction của A, truy vấn `_app` thiếu context thấy 0 dòng |
| EC05 | Đã giải quyết | B INSERT account A bị SQLSTATE 42501, UPDATE dòng A trả 0 dòng |
| EC06 | Đã giải quyết | Sau S05/S06, cả 13 test đạt trong namespace runner chặn Internet, chỉ giữ loopback và gateway Docker cho container cục bộ |
| EC07 | Chưa xử lý — S07 | Chưa có 5 số đo để so 600 giây; report có bảng chờ và quy tắc chuyển PID-00009 |
| EC08 | Đã giải quyết | Container riêng chưa có roles: migrate lỗi, command mã 1, bảng mẫu không tồn tại và journal 0 dòng |
| EC09 | Đã giải quyết | Test so pg_dump schema + journal trước/sau; thêm kiểm CLI Nx hai lần |
| EC10 | Đã giải quyết | Tất cả 12 DDL chạy đạt; code bọc lỗi với service/file/vị trí và SQL context, không bỏ qua file hoặc sửa nguồn |
| EC11 | Cần PO | Danh sách 20 affected project và nguyên nhân lockfile đã ghi report và báo trong chat; không tự thay PR hoặc cách đo |
| Mới | Không có | Không thêm hành vi ngoài hồ sơ |

## 4. Tự kiểm

- [ ] Mọi slice đã chạy đủ lệnh — S07 chưa đo CI; kiểm diện rộng chưa đạt.
- [x] Không có agent, APR hoặc gọi model trong mẫu; không làm thay Researcher.
- [x] Mẫu không thay state machine nghiệp vụ; audit có actor system và account.
- [x] Dữ liệu mẫu cách ly theo tenant; consumer đối chiếu account và id.
- [x] Không gọi provider; lỗi migrate không in DSN hoặc khóa.
- [x] Chỉ import API công khai platform/testing và thư viện; không import service khác.
- [x] Sự kiện và audit qua API outbox; consumer dùng inbox public API.
- [x] Migration mới, giữ journal drizzle-kit; không sửa migration có sẵn hay DDL tham chiếu.
- [x] UI không áp dụng.
- [x] Không ghi docs hoặc script ngoài luồng; catalog giữ nguyên. Lockfile là importer bắt buộc của package mới và đã ghi report.
- [x] Không thêm phạm vi; yêu cầu thêm: không có.
- [x] Không có console.log, TODO bỏ ngỏ; stdout DDL là bằng chứng reporter trong test.
- [ ] Đã tự đối chiếu bằng spec-converge-skill; còn G1 HIGH ở S07, chưa đặt Xong — chờ QC.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đã đọc mã hiện tại, đối chiếu Output O1–O4, B1–B6, AC01–05, NFR, EC01–11 và bảy slice.
O1–O4 đúng đường dẫn; project Nx độc lập không có incoming dependency; schema dựng bằng custom
migration thật; mẫu chỉ dùng API công khai. Không tạo qc-report.md của QC độc lập.

| G | Loại | Mức | Mô tả | Bằng chứng | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | missing | HIGH | B3/S07 thiếu năm lần CI trên PR, danh sách affected chọn ngoài một service | `report.md` phần SPK-10, chưa có PR chứa mã | Chưa; cần yêu cầu commit/mở PR theo AGENT.md và PO xử lý EC11 trước kết luận |
| G2 | partial | HIGH, đã đóng | Lượt Docker internal lỗi Reaper, chưa chứng minh EC06 | `validation-offline.txt`, lệnh offline | Đã sửa môi trường runner: namespace firewall, chạy lại toàn bộ 13/13 đạt trong 28,14 giây; NFR đạt |
| G3 | partial | MEDIUM | Kiểm toàn repo gặp timeout container và pytest không kết thúc | `.nx/pid00006-affected.log` | Không sửa thư viện/pytest ngoài ticket chỉ để làm xanh; kiểm riêng mẫu đã đạt |
| G4 | partial | LOW | check-tracks chưa nhận sample-service là platform (N13) | `scripts/development/check-tracks.mjs`, chỉ đọc | Đề xuất PO, theo N13 không thuộc sửa của ticket |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
