# PID-00014 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC (Lần 11, 27/11/2026: G8 đóng theo PC-05 P32, chốt theo đề xuất do PO ủy quyền 26/11/2026)

- **Ticket:** [PID-00014](../../../docs/tickets/issues/PID-00014/index.html) · **Luồng:** `gateway` · **Giai đoạn:** PH-01
- **Nhánh:** `gateway/pid-00014-session` · **PR:** [#63](https://github.com/toilatrung/sires/pull/63) vào `main`
- **Cập nhật:** 27/11/2026 (Lần 11)
- **Người làm:** phiên do PO `toilatrung` giao (24/11/2026), làm thay assignee cũ `Vietanhhhhhh2003`
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

Lần 10 (25/11/2026) đóng G2: DBQ-10 đã đóng bằng DBD-14 (PO 24/11/2026, DDL ở #107); migration đầu
dựng lại từ `00-common.sql` (sau EC09, #94) và `gateway.sql` (có policy `owner_lookup`) hiện tại trên `main`.
Mọi test, kể cả fixture HTTP, migrate bằng migrator thật và chạy service bằng `_app`; test DBQ-10 đạt với
assertion không đổi. G1, G3, G5–G7 (QC Lần 1) và G9, G10 (QC Lần 2) đã đóng từ các lần trước; G4 đóng theo
phân công của PO ngày 24/11/2026. Lần 11 (27/11/2026) đóng G8: PC-05 P32 chốt theo đề xuất (PO ủy quyền
26/11/2026), giữ sửa `infra/ci/check-helm-images.sh` (luồng infra) trong PR này. Còn G11 LOW, làm sau merge (P44).
Các số liệu ở Lần 2–9 là lịch sử; kết quả mã hiện tại ở Lần 10 (Lần 11 không đổi mã).

## 2. Trạng thái công việc

| Slice | Mục tiêu                                  | Trạng thái | File tạo / sửa                                                                                                                                                                                         |
| ----- | ----------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S01   | Migration, lệnh migrate, Helm và test DDL | Xong       | `apps/gateway/migrations/`, `src/db/`, `src/migrate.ts`, `src/migration.spec.ts`, `drizzle.config.ts`, `package.json`, `vitest.config.ts`, `deploy/values.yaml`, `README.md`; `pnpm-lock.yaml` tự sinh |
| S02   | Tra phiên, hết hạn và gia hạn             | Xong       | `apps/gateway/src/session/`, `src/app.module.ts`, `src/app.module.spec.ts`                                                                                                                             |
| S03   | Kiểm CSRF                                 | Xong       | `apps/gateway/src/session/session.service.ts`, `session.guard.ts`, `session.interceptor.ts`, `session.spec.ts`                                                                                         |
| S04   | Gia hạn GET /auth/session                 | Xong       | `apps/gateway/src/session/session.guard.ts`, `session.spec.ts`                                                                                                                                         |
| S05   | Tạo phiên, CSRF token và cookie           | Xong       | `apps/gateway/src/session/session.crypto.ts`, `session.schema.ts`, `session.service.ts`, `session.spec.ts`, `README.md`                                                                                |

## 3. Kết quả

Kết quả Lần 1–3 dưới đây dùng fixture migration bằng superuser; không phải nghiệm thu quyền production.
Kết quả mới nhất, với mọi fixture migrate bằng vai trò thật, ghi ở Lần 10.

- Migration custom drizzle-kit dựng schema khớp nguyên văn DDL trên PostgreSQL 16 + pgvector; thiếu vai trò lỗi,
  chạy lại không áp lại. RLS kiểm bằng vai trò `_app` thật (không SUPERUSER/BYPASSRLS).
- Module phiên gắn toàn cục: hết hạn idle/tuyệt đối hoặc thu hồi → 401; CSRF thiếu/sai → 403.
  Chỉ lệnh ghi thành công và GET `/auth/session` gia hạn; SSE/GET khác và lệnh bị từ chối không gia hạn.
- Hàm cấp phiên, HMAC CSRF và cookie sẵn cho PID-00038; cookie bền Secure/HttpOnly/SameSite=Lax,
  Expires theo hạn tuyệt đối; không lộ id, cookie hay token trong log.
- Lượt cuối kiểm riêng gateway: 4 file, 29 test đạt, không skip, 14.98 giây; lint/typecheck/build đạt.
- Gói production không có drizzle-kit hoặc @sires/testing; CLI chạy migration trên DB rỗng và app trả /health 200.
- Kết luận tự QC cũ đã bị QC độc lập thay thế: G2 HIGH / DBQ-10 chặn merge, xem Lần 4.
- Lượt sửa hiện tại không sửa docs; spike ngoài gateway đã đưa về main theo H9.

## 4. Việc còn lại

G2/DBQ-10: đã đóng ở Lần 10 (DBD-14). G4: đã đóng (PO giao PID-00014 cho `toilatrung` ngày 24/11/2026;
`/apps/gateway/` có code owner `T1xNTH`, PO duyệt hoặc bypass khi merge).
G8: đã đóng ở Lần 11. PC-05 P32 chốt theo đề xuất (PO ủy quyền 26/11/2026, YC4 ở mục 5): giữ bản sửa Helm smoke
`infra/ci/check-helm-images.sh` trong PR này; PR chạm hai luồng (gateway, infra) có chủ đích. Khi merge, code owner
`/infra/` (`@congminh1705`) duyệt hoặc PO bypass. G11 LOW (fixture HTTP tự kiểm vai trò thật): PC-05 P44, PR nhỏ của
luồng gateway sau khi #63 merge; không chặn merge.
Đoạn sau chỉ là lịch sử lượt trước.

Kết quả lượt đầu (đã được giải quyết ở Lần 2): `nx affected` chọn 19 project do lockfile, dừng ở
`apps/knowledge/spikes/spk_05/test_text_layer.py:152` (`test_corrupt_never_hangs`: expected `exited`, actual `timeout`).
Knowledge 21 đạt, 1 lỗi, 2 skip; platform 167/167 đạt. Các target bị Nx bail không tính là đạt.
Nhận định ban đầu về diff knowledge đã sai sau YC1; Lần 4 khôi phục đúng main. Kiểm giấy phép sau pytest còn 2 cảnh báo trên cache tự sinh
`.pytest_cache/.gitignore`, `.pytest_cache/README.md`; các nguồn ticket có SPDX.

## 5. Yêu cầu thêm

| #   | Người yêu cầu                                                 | Nguyên văn                                                                     | Phân loại                                        | Quyết định                                               | Đã làm, kiểm bằng                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| YC1 | Người dùng trong phiên                                        | “test nốt đi”, “tìm lỗi và sửa luôn”                                           | Mở rộng ngoài gateway ở Lần 2                    | QC bác căn cứ mở rộng; H9 yêu cầu bỏ khỏi PR             | Đã khôi phục bốn file spike về main ở Lần 4; Lần 2 giữ làm lịch sử                                                                                                                                                                |
| YC2 | Người dùng trong phiên trước                                  | “Giữ blocker, sửa phần còn lại”                                                | Sửa ngoài gateway ở Lần 7                        | Chờ PO quyết theo G8; chưa phải lời đồng ý của PO        | Commit `2355737` sửa `infra/ci/check-helm-images.sh`: cấp DSN thử và khóa CSRF ngẫu nhiên để gateway khởi động trong Helm smoke; CI Helm đạt. Cần PO quyết giữ kèm code owner `/infra/` duyệt, hoặc tách PR infra merge trước #63 |
| YC3 | PO Trịnh Quang Trung, 25/11/2026, qua phiên điều phối giao PR | “Còn một số pr chưa xong, hãy qc và hoàn thiện cho tới khi đủ điều kiện merge” | Trong phạm vi: sửa theo QC Lần 1–2, H7 và DBD-14 | Làm trong gateway; không sửa `docs/`, infra; không merge | Lần 10: gộp `main`, dựng lại migration đầu theo DDL hiện tại, fixture vai trò thật, timeout chung PC-04 A6; G8 không tự quyết                                                                                                     |
| YC4 | PO Trịnh Quang Trung, 26–27/11/2026, qua phiên điều phối | “PH-01 đang trong giai đoạn hoàn thiện, các vấn đề còn chưa đạt thì tự đề xuất và hoàn thiện cho xong giúp tôi … Các vấn đề phát sinh hãy chốt theo đề xuất … Hãy gọi các phiên để thực hiện song song, ngoài ra theo dõi pr để qc cho các phiên qc chéo khi nào đạt thì merge”; “mục tiêu trong phiên này bạn phải qc và đảm bảo chất lượng hoàn thiện tốt với các task đã đủ điều kiện tiến hành và các task bạn có phương án đề xuất” | Ủy quyền chốt các điểm còn mở theo đề xuất; áp vào G8 (sửa ngoài luồng gateway, YC2) | PC-05 P32 chốt theo đề xuất (PO ủy quyền 26/11/2026): phương án 1, giữ bản sửa `infra/ci/check-helm-images.sh` trong PR #63, PR chạm hai luồng có chủ đích; QC độc lập rồi merge. Đây là lời đồng ý cho YC2 | Lần 11: ghi quyết định vào mục 4, 5, 6; trạng thái `Xong — chờ QC`; gộp `main` (#109–#111, chỉ `docs/`). Không sửa mã, `infra/`, `docs/`, `qc-report.md` |

## Lần 2 — 22/11/2026

Người dùng yêu cầu kiểm nốt rồi tìm và sửa lỗi. Đã tái hiện riêng test knowledge:
`test_corrupt_never_hangs` thất bại khi worker chết bị báo timeout. Đang sửa race giữa EOF
của pipe và trạng thái tiến trình con; giữ nguyên phân loại lỗi và ngân sách timeout đã có.
Bộ affected đang chạy không `--nxBail` để kiểm hết target còn lại.

Lượt này phát hiện thêm `agent-core:test` lỗi khi xuất báo cáo SPK-08 vào TEMP trên C:,
trong khi LICENSES.md ở D:. Đang sửa fallback liên kết giấy phép khi không thể tạo đường dẫn
tương đối giữa hai ổ, kèm test hồi quy; thuộc YC1 “tìm lỗi và sửa luôn”.

Kết quả cuối:

- `knowledge:test`: 24 đạt, 2 skip (test FULL cần SPK04_SCALE_DB và bộ PDF mẫu chưa tải), 39.32 giây.
- `agent-core:test`: 23 đạt, 47.15 giây.
- `pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=2 --output-style=static`:
  exit 0; 19 project, 72 task đạt, 66 dùng cache; không còn failed target.
- `ruff check` cho bốn file Python sửa: đạt. Không hạ assertion, tăng timeout hoặc bỏ test lỗi.
- Tại thời điểm Lần 2 chưa commit/push; Lần 3 đã đẩy PR.

Log Lần 2 chỉ lưu cục bộ, không có trong repo; không dùng làm bằng chứng lượt sửa hiện tại.

## Lần 3 — 22/11/2026 · Đẩy PR

Theo yêu cầu “đẩy pr đi”: đã commit mã và kết quả, đồng bộ `origin/main` a2e7bf6 (PR #61),
giải quyết xung đột worker bằng cách giữ chờ exit trong ngân sách timeout còn lại và kiểm tra
worker đóng pipe rồi treo. Kiểm affected sau merge đạt 19 project, 72/72 task (toàn bộ dùng cache
của các lượt kiểm mã tương ứng). Hồ sơ kết quả và update-index đạt; working tree sạch trước cập nhật link PR.

PR [#63](https://github.com/toilatrung/sires/pull/63), base `main`, đã mở. Mọi commit đã push được
GitHub xác nhận `verified: true`. Chưa merge; PO review và QC độc lập là bước tiếp theo.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** Các mục “Phải sửa ở nguồn” của hồ sơ vẫn do PO xử lý (mô tả getSession, PID-00012,
  kiến trúc cookie/CSRF, secret PID-00035, điểm nối PID-00038 và job dọn phiên); không sửa docs ở lần này.
- **Yêu cầu hợp đồng:** Không có.
- **Đề xuất cho PO (Lần 10):** issue [#83](https://github.com/toilatrung/sires/issues/83) (DBQ-10) vẫn mở
  trên GitHub dù DBQ-10 đã đóng bằng DBD-14; PO đóng khi #63 merge. Hồ sơ ticket mục 3, mục 5 “Còn mở”
  vẫn ghi “DBQ-10 chặn merge PR #63” và G4; PO cập nhật khi nghiệm thu. Repo nên thêm `*.sql text eol=lf`
  (đã có trong phiếu PC-04 mục C): trên checkout Windows, test so schema chỉ đạt vì migration và DDL cùng CRLF.
  Đề xuất của QC Lần 2 `REVOKE ALL ON FUNCTION app.find_session(bytea) FROM PUBLIC` chưa có trong `gateway.sql`
  sau DBD-14; migration chép đúng DDL nên cũng chưa có. PO quyết có thêm vào DDL không.
- **Yêu cầu hợp đồng:** Không có.
- **Còn mở:** G11 LOW (fixture HTTP tự kiểm vai trò thật), làm sau khi #63 merge theo PC-05 P44; không chặn merge.
  G8 đóng ở Lần 11 (PC-05 P32); G2 (DBQ-10) và G4 đã đóng ở Lần 10.
- **Bước tiếp theo:** QC độc lập Lần 4 trên đầu nhánh sau Lần 11; đạt thì phiên điều phối của PO merge (PO bypass
  hoặc code owner `/apps/gateway/`, `/infra/` duyệt).
- **Tài liệu đi kèm:** Không có.

## Lần 4 — 22/11/2026 · Sửa PR #63 theo QC độc lập

Yêu cầu trong phiên: “check và fix pr này”; sau đó “kiểm tra xem PO có quyết định chưa,
nếu chưa thì giữ nguyên”. Đã fetch và kiểm PR #63, PR #67 (đã merge), tìm DBQ-10 trên GitHub,
nhánh hồ sơ DBQ và `origin/main` tại `3dd4c15`: chưa có quyết định thay H7. Giữ nguyên DDL/migration.

- G1/H9: bốn file spike knowledge/agent-core khớp `origin/main`; không còn diff ngoài luồng này.
- G3/H8: guard dùng route Fastify đã khớp; HTTP test đăng ký controller dưới `/api/v1`,
  có kiểm route công khai, query, route tham số và gia hạn session. `/health` giữ làm probe chart chung.
- G5: bỏ đường dẫn máy và liên kết log không có trong repo, sửa lời khai và trạng thái, đưa chân giấy phép về cuối.
- G6: sau handler ghi thành công, gia hạn lỗi vẫn trả kết quả handler; cảnh báo cố định không kèm lỗi thô.
  Test HTTP kiểm thu hồi ngay trong handler và lỗi database ở bước gia hạn; không hồi sinh phiên.
- G7: README cảnh báo `generate` thiếu `--custom` sinh lại bảng từ snapshot trống.
- G2: migration test đăng nhập bằng migrator/owner không BYPASSRLS; `_app` gọi `find_session`
  trước tenant context trả 0 dòng. Test giữ assertion cần một phiên hợp lệ, không skip/expected failure.
  Fixture HTTP còn migration bằng superuser để cô lập mã guard/CSRF, không phải kiểm quyền production.
- G4: giữ chờ PO xác nhận người làm; không sửa task-registry hoặc qc-report.md độc lập.

Kiểm gateway mới nhất: **34 đạt, 1 lỗi / 35 test**, lỗi duy nhất là DBQ-10/G2 như mô tả trên;
lint, typecheck và build đạt. Schema khớp DDL, migration chạy lại, RLS tài khoản đều đạt bằng vai trò thật.
Kiểm affected (`--base=origin/main --parallel=2 --output-style=static`) chọn 20 project:
chỉ `@sires/gateway:test` và `agent-core:test` lỗi. Gateway lỗi DBQ-10; agent-core có
20 test đạt, 1 lỗi SPK-08 do `os.path.relpath` giữa D: và C: trên Windows. Giữ nguyên
spike theo H9, báo PO xử lý trong luồng của mình. Knowledge 22 đạt, 2 skip theo điều kiện dữ liệu.
`check-pid --result`: 0 cảnh báo; `update-index --check`, `git diff --check` đạt.
Giấy phép có 14 cảnh báo cache/report tự sinh ngoài nguồn Git; file nguồn sửa có SPDX.
Bàn giao bản sửa lên nhánh PR #63 theo yêu cầu “đẩy lên đi”; không merge PR.

## Lần 5 — 22/11/2026 · Xử lý lỗi còn lại trên nhánh riêng

Yêu cầu “sửa nốt đi”; sau khi trình phương án policy SELECT cho owner, người dùng chọn
“Giữ blocker, chưa thay đổi DDL”. Đã kiểm lại GitHub và fetch: DBQ-10 vẫn mở, H7 không đổi.
Không sửa DDL, migration, task-registry hoặc qc-report độc lập; G2 và G4 giữ trạng thái chờ.

Lỗi SPK-08 Windows được xử lý trên nhánh riêng `agent-core/fix-spk08-license-cross-drive`
từ main, trong worktree tách biệt. Khi không thể tạo đường dẫn tương đối giữa hai ổ,
footer dùng URI của file LICENSES.md có sẵn trong repo; không còn ném ValueError, không
ghi cứng liên kết GitHub vào báo cáo. Đường dẫn cùng ổ vẫn tương đối như trước.
Có test đường dẫn cùng repo, mô phỏng khác ổ và end-to-end xuất báo cáo vào TEMP thật.
Không đưa bản sửa agent-core vào PR #63 (H9); diff gateway với main ở agent-core/knowledge vẫn trống.

Kiểm nhánh riêng: **23/23 test agent-core đạt**, không skip (36.58 giây), gồm migration trên
PostgreSQL thật và SPK-08 end-to-end. Ruff hai file sửa và diff-check đạt. Lượt kiểm đầu ở
worktree thiếu Alembic khi subprocess tự dùng venv mới; đã trỏ `UV_PROJECT_ENVIRONMENT`
về môi trường đã cài và kiểm lại toàn bộ đạt. Không thay dependency hoặc lockfile.
Chưa commit/push cả bản sửa gateway và nhánh SPK-08; PR #63 vẫn chặn bởi DBQ-10.

## Lần 6 — 22/11/2026 · Bàn giao lên remote

Người dùng yêu cầu “đẩy lên đi”: commit có chữ ký và đẩy bản sửa gateway vào nhánh của PR #63;
đẩy bản sửa SPK-08 trên nhánh riêng `agent-core/fix-spk08-license-cross-drive`.
Mô tả PR cập nhật phạm vi và kết quả kiểm ở Lần 4–5, bỏ lời khai spike Windows thuộc PR gateway.
Không merge PR; DBQ-10/H7 và G4 vẫn giữ nguyên. Test G2 tiếp tục báo lỗi, không skip.

## Lần 7 — 23/11/2026 · Đồng bộ main và kiểm CI mới

Người dùng yêu cầu kéo code mới và sửa PR #63, sau đó chọn “Giữ blocker, sửa phần còn lại”.
Đã đồng bộ `origin/main` tại `f9da4af` và commit gộp main trên remote `c3b6983`;
lockfile gộp sạch, cài dependency gateway bằng frozen lockfile thành công. Không cần đổi
mã phiên để tương thích Vitest 4.1.12; DDL, migration và assertion DBQ-10 giữ nguyên.

- Windows: gateway **34 đạt, 1 lỗi / 35 test**, 5 file, 48.47 giây; lỗi duy nhất DBQ-10/G2.
  Lint, typecheck và build trực tiếp của gateway đạt. Nx build tại workspace này bị EPERM
  khi đổi tên thư mục mã hợp đồng sinh sẵn; không tính lượt đó là đạt.
- [CI mới, run 45110694858](https://github.com/toilatrung/sires/actions/runs/45110694858):
  TypeScript chỉ lỗi `@sires/gateway:test`, đúng DBQ-10 (34 đạt, 1 lỗi, 18.21 giây).
  Image gateway và 11 image còn lại, Python, contracts, contract-test, asyncapi-payload,
  dependencies, secrets, docs, tracks và Terraform đã đạt. Không tuyên bố toàn bộ CI đạt.
- Helm smoke của run đó lỗi thêm vì khởi động gateway thiếu `DATABASE_URL` và
  `GATEWAY_CSRF_KEY`. Trong phạm vi yêu cầu sửa phần còn lại, cập nhật duy nhất
  `infra/ci/check-helm-images.sh`: cấp DSN thử không kết nối database và khóa CSRF ngẫu nhiên
  cho container gateway. Không dùng secret triển khai hoặc nới cấu hình bắt buộc của app.
- Build Docker Linux từ bản nguồn Git sạch đạt, gồm Nx build đầy đủ và deploy production.
  Chạy image với cấu hình smoke trả `/health` 200, PID 1 có UID 1000; `bash -n` đạt.
  Lần thử PowerShell đầu sinh khóa sai do quoting nên container dừng; đã sửa lệnh kiểm,
  chạy lại đạt và dọn container. Kiểm này chỉ xác nhận khởi động/probe, không nghiệm thu DBQ-10.
- Diff với main ở knowledge/agent-core trống theo H9. `check-pid --result` 0 cảnh báo,
  `update-index --check`, Prettier nguồn TS gateway và `git diff --check` đạt.

G2/DBQ-10 và G4 vẫn mở; PR chưa đủ điều kiện merge. Các sửa G1, G3, G5–G7 ở Lần 4
tiếp tục vượt qua test trên Vitest mới. Không sửa task-registry hoặc báo cáo QC độc lập.

## Lần 8 — 23/11/2026 · Báo lỗi DBQ-10 và bàn giao riêng SIRes

Người dùng yêu cầu đẩy commit và lỗi, sau đó xác nhận chỉ đẩy phần liên quan SIRes,
không đẩy bản sửa eTroy One. Mở [issue #83 — DBQ-10](https://github.com/toilatrung/sires/issues/83)
để theo dõi G2/H7: có bước tái hiện, nguyên nhân, ảnh hưởng và việc cần PO/Tech lead chốt.

- Kiểm lại gateway bằng `pnpm --filter @sires/gateway test`: **34 đạt, 1 lỗi / 35**,
  5 file, 20.91 giây trên Windows; lỗi duy nhất DBQ-10 tại `migration.spec.ts:139`.
- [CI 45111435549](https://github.com/toilatrung/sires/actions/runs/45111435549), mã `2355737`:
  Helm smoke gateway và agent-core đạt `/health` 200, PID 1 non-root. Image, contracts,
  Python và các job còn lại đạt; TypeScript chỉ lỗi DBQ-10, `build` tổng hợp báo lỗi theo.
- Kiểm nối spike SIRes với eTroy One đã chỉnh cục bộ: 14/14 kiểm tra đạt, gồm Basic exchange,
  PKCE/nonce, UserInfo, refresh và logout. Đây là bản provider local chưa commit/push,
  không chứng minh bản provider trên remote tương thích và không đóng ASM-13 hay DBQ-10.
- Không thay mã SIRes, DDL, migration, task-registry hoặc báo cáo QC độc lập trong lượt bàn giao này.
  G2/DBQ-10 và G4 vẫn mở; PR #63 chưa được merge.

## Lần 9 — 24/11/2026 · Sửa QC độc lập Lần 2

Yêu cầu trong phiên: “check xem PO chốt chưa rồi fix”. Đã fetch và kiểm thảo luận
PR #63, issue #83 cùng `origin/main`: DBQ-10 vẫn mở, issue chưa có phản hồi;
H7 và DDL chưa đổi. Chưa có quyết định PO cho G4, G8. Không sửa DDL/migration,
test DBQ-10 hoặc hồ sơ QC độc lập.

- G9: `tsconfig.build.json` loại `src/**/*.testkit.ts` khỏi build production.
- G10: README nêu đủ năm vai trò, migrator đăng nhập và tự SET role owner;
  owner cần sở hữu database hoặc có CREATE. Nêu SQLSTATE 42501 khi thiếu quyền.
- G8: mục 5 ghi lại sửa Helm smoke ở commit `2355737` và phần chờ PO;
  cập nhật ngày, nguồn cảnh báo tracks và hiện trạng build image trong `implement.md`.
- Workspace chính bị tiến trình khác chuyển nhánh khi đang làm, trước khi sửa thành công;
  bản sửa nằm trong worktree riêng, nhánh `fix/pr63-qc2-20261124`, từ đầu PR `1a6940f`.
- Frozen install đạt; Nx chạy không cache: build, lint, typecheck đạt;
  test **34 đạt, 1 lỗi / 35**, 5 file, 44.43 giây trên Windows với PostgreSQL 16 thật.
  Lỗi duy nhất là DBQ-10 tại `migration.spec.ts:139`, không skip/expected failure.
- Build sạch: 36 file trong `dist`, không có spec/testkit hoặc tham chiếu `@sires/testing`.
  Kiểm giấy phép, chỉ mục tài liệu và `git diff --check` đạt. Diff lượt này chỉ thuộc gateway
  và hồ sơ Dev; toàn PR vẫn cảnh báo gateway + infra theo G8.

PR tiếp tục bị chặn: G2 HIGH, G8 HIGH, G4 MEDIUM; G9, G10 đã sửa để QC kiểm lại.
Chưa commit/push bản sửa hoặc merge PR.

## Lần 10 — 25/11/2026 · DBD-14, vai trò thật, gộp main

Yêu cầu: YC3 (PO, 25/11/2026). Người làm: phiên do PO `toilatrung` giao, làm thay assignee cũ `Vietanhhhhhh2003`.
Làm trong worktree riêng, không chuyển nhánh của checkout chính.

- Gộp `origin/main` hai lần bằng merge (không rebase, không force-push): `a53e3c9` (#105, #107: DBD-14,
  `gateway.sql` có `owner_lookup`) rồi `8c5581d` (#106, #108: hằng timeout chung). Không có xung đột.
- G2/DBQ-10: dựng lại `apps/gateway/migrations/0000_init.sql` từ `00-common.sql` (sau EC09, #94) và `gateway.sql`
  hiện tại trên `main`, bỏ ba dòng giấy phép đầu mỗi file, theo cách `apps/identity` (#107). Journal, snapshot giữ
  nguyên (một mục `0000_init`); gateway không có state machine nên không cần helper PID-00158.
- H7: testkit dựng năm vai trò theo database 3.2, owner sở hữu database; cả `migration.spec.ts` và fixture HTTP
  migrate bằng `sires_gateway_migrator` thật, service chạy bằng `_app`. Database tham chiếu cũng dựng bằng migrator
  nên phép so `pg_dump --schema-only` giữ cả chủ sở hữu, quyền, policy; `dumpSchema` qua base64 như #100.
  EC13 chạy ở container riêng chưa có vai trò. Lệnh migrate in thêm SQLSTATE (không in DSN).
- `apps/gateway/vitest.config.ts` dùng `TESTCONTAINERS_TIMEOUTS` của `@sires/testing/vitest` (PC-04 A6, #108).
- README: bỏ đoạn “Chặn merge — DBQ-10”, ghi DBD-14, SQLSTATE `42704`, cách so schema và timeout.

Kết quả (chi tiết ở `self-qc.md` Lần 10):

- Gateway `lint`, `typecheck`, `test`, `build` (`--skip-nx-cache`) đạt; test **35/35**, gồm
  `DBQ-10 / G2: app.find_session phải đọc được phiên trước tenant context với vai trò thật` với assertion không đổi.
  Thử bỏ policy `owner_lookup` thì 15/35 lỗi (test DBQ-10, so schema, 13 test HTTP), nên test bắt được lỗi cũ.
- `nx affected` (20 project do lockfile): mọi tác vụ TypeScript đạt, pytest của agent-core, knowledge, eval đạt;
  10 tác vụ lỗi đều do Windows chặn công cụ Python (Smart App Control): ruff, mypy kiểm lại riêng đều đạt;
  `@sires/contracts:test`, `sires-common:test` không chạy được ở máy này, dựa vào CI Linux.
- [CI run 45641867310](https://github.com/toilatrung/sires/actions/runs/45641867310) trên `4980f6f` (commit mã của
  lượt này): **mọi job đạt**, gồm `typescript` (gateway chạy mới, 35/35), `python`, `contracts`, `contract-test`,
  `asyncapi-payload`, 12 image, `helm` (smoke gateway với sửa của G8), `terraform`, `tracks`, `build` bắt buộc.
  `@sires/contracts:test` và `sires-common:test` (133 đạt) trúng cache Nx vì đầu vào không đổi so với `main`.
- `add-license --check` 0 thiếu, `update-index --check` đạt, `git diff --check` đạt;
  `check-pid.mjs PID-00014 --result`: KẾT QUẢ ĐỦ, 0 cảnh báo.
- AC01, AC02, NFR-AUTH-001-AC01 và EC01–EC17 đạt ở mức Xây với quyền database thật; chưa có staging.

G1–G7, G9, G10 đã đóng (G2, G4 ở lượt này). **G8 HIGH còn mở**, chờ PO quyết; trạng thái giữ `Bị chặn — G8`.
Khi PO chọn giữ sửa infra trong PR này, Dev ghi nguyên văn lời đồng ý vào mục 5 và đặt `Xong — chờ QC`.
Không sửa `docs/`, `qc-report.md`; không merge PR.

## Lần 11 — 27/11/2026 · PC-05 P32, gộp main

Yêu cầu: YC4 (PO, 26–27/11/2026, qua phiên điều phối). Người làm: phiên QC do PO `toilatrung` giao, theo chỉ đạo
của phiên điều phối (không ai đẩy lên nhánh này từ 25/11/2026). Làm trong worktree riêng, không chuyển nhánh của
checkout chính.

- G8: PC-05 P32 chốt theo đề xuất (PO ủy quyền 26/11/2026) — giữ bản sửa `infra/ci/check-helm-images.sh` (commit
  `2355737`) trong PR này. Ghi nguyên văn ủy quyền ở mục 5 (YC4); sửa mục 4, mục 6 và dòng trạng thái thành
  `Xong — chờ QC`. QC độc lập Lần 3 đã đánh giá bản sửa cần và đúng (chỉ áp cho gateway, DSN giả, khóa ngẫu nhiên).
- Gộp `origin/main` `c9e745b` (#109, #110, #111) bằng merge, không rebase, không force-push. Ba PR này chỉ sửa
  `docs/`; không có xung đột.
- Không sửa mã gateway, `infra/`, `docs/`, `qc-report.md`; không merge PR. G11 LOW để PR sau theo PC-05 P44.
- `self-qc.md`: dòng Kết luận thành `Đạt` (G8 đóng, G11 LOW để sau) và thêm mục Lần 11 (PC-05 P37).
- Kiểm: `check-pid.mjs PID-00014 --result` KẾT QUẢ ĐỦ (0 cảnh báo); `add-license --check` 0 thiếu;
  `update-index --check` khớp; `git diff --check` đạt. CI chạy lại trên đầu nhánh mới; kết quả ở QC độc lập Lần 4.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->

SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).
