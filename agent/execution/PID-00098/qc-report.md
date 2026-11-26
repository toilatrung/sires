# PID-00098 — Báo cáo QC độc lập

**Kết luận mới nhất:** Còn việc — 0 CRITICAL, 2 HIGH (Lần 1, 27/11/2026)

- **Ticket:** [PID-00098](../../../docs/tickets/issues/PID-00098/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 27/11/2026 · spec-converge-skill

Người chạy: phiên QC do PO `toilatrung` giao, không mang kết luận của Dev (spec-converge-skill chế độ QC độc lập, kèm sires-ui-review). Mã nguồn: PR #144, nhánh `web/library-pid-00098` (base `develop`), commit `dc4e48bec06ae8807b8b0aba0a2b1f163cec532e`, kiểm trên worktree tách rời ở đúng commit này. Hồ sơ ý định: `origin/docs/pid-00098-clarify` (PR #137) commit `ab1d5991959ce385d36d7776ff50bab6d368a399` (ticket, spec, acceptance, scope, S01–S09, designs/notes, H1–H20).

**Phạm vi thay đổi của PID.** So với `develop`, PR đổi 315 file vì mang theo nhánh tích hợp `preview/ui-ph02` (#120 docs, #138 shell, #131 mock). Commit riêng của PID (`git log origin/preview/ui-ph02..HEAD`): `67b5858`, `4476391`, `2600ba5`, `dc4e48b` (chỉ `features/library/**` và `agent/execution/PID-00098/`), merge `fbb0ac0` của #131 Lần 5 (head `612c94b`, không phải việc của PID này) và `78baa91` sửa `apps/web/src/shell/**` cho PID này. So với head của #131 (`612c94b`), phần shell do PID này tự sửa còn 6 file, 27 dòng thêm, 10 dòng bỏ: `shell/api/client.ts`, `shell/mock/{types,runtime,index,node}.ts`, `shell/topbar.spec.tsx` (xem G1).

**Cổng sẵn sàng của hồ sơ.** `check-pid.mjs PID-00098 --root <hồ sơ #137 + thư mục execution>`: ĐỦ để thực thi (35 AC có slice, 46 edge case; 2 cảnh báo: liên kết `LICENSES.md` không có trong thư mục tạm, report ở “Xong — chờ QC”). `--result`: KẾT QUẢ ĐỦ, 1 cảnh báo (self-qc còn 1 mục tự kiểm chưa đánh dấu, chính là mục “Không sửa file trong điểm dừng”).

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | Quy tắc 1.4.1, 1.4.9; spec mục 7 (“Không được sửa: thư mục ngoài luồng web/library”; “shell thiếu API cần dùng → dừng và hỏi”); README shell dòng 5 | contradicts | HIGH | Commit `78baa91` vẫn trong PR: `shell/api/client.ts:188-192` (gửi `FormData`), `shell/mock/types.ts:51`, `shell/mock/runtime.ts:245-301`, `shell/mock/index.ts:43,52`, `shell/mock/node.ts` (`MockRequest.emit`), `shell/topbar.spec.tsx`. `check-tracks.mjs --base origin/preview/ui-ph02`: “PR touches 2 tracks (web/library, web/shell)”. Mã của khu vực phụ thuộc các thay đổi này (`__mocks__/index.ts` dùng `emit`; `ManualImport.tsx:92`, `Reference.tsx:127` gửi `FormData`). Dev đã khai YC1, tách commit riêng, nhưng không dừng như mục 7 yêu cầu | Phiên điều phối giao 6 file này cho luồng `web/shell` (PID-00012 hoặc PID-00013), merge trước; sau đó PR này bỏ `78baa91` (rebase hoặc merge lại) để chỉ còn `features/library/**` và `agent/execution/PID-00098/`; chạy lại test |
| G2 | H14 (P9): “Gộp vào reference có sẵn (mergeReference, dialog nêu hệ quả)”; LIB-APPROVAL-001 luồng mục nghi trùng; design.md §4 Dialog; sires-ui-review “Quyết định … hệ quả” | partial | HIGH | `Library.tsx:271-283` và nút `:341`: bấm “Gộp” gọi `mergeReference` ngay, không hỏi, không nêu reference đích và hệ quả. Trình duyệt: bấm “Gộp” ở mục Chen 2024 → 0 dialog, mục rời panel ngay. Test `library.spec.tsx › gộp mục nghi trùng` khẳng định hành vi này | Mở dialog 480px nêu reference đích và hệ quả (selection, evidence, citation chuyển sang đích; key cũ vẫn phân giải), nút hủy gọi tên phương án an toàn, rồi mới gọi `mergeReference`; thêm test “hủy thì không gọi API” (EC34) |
| G3 | H14 (câu hệ quả cạnh nút duyệt), H17 (“Duyệt lại … dialog lý do tùy chọn”), H16 (“Thay PDF với dialog nêu tệp sẽ được index lại”) | partial | MEDIUM | `Library.tsx:249` + `i18n/vi.json:39` (`pending.hint` không nêu “Duyệt: n reference thành Trusted, dùng được cho citation; reference có PDF được đưa vào indexing”); `Reference.tsx:211-215` “Duyệt lại” gọi `reinstateReference` ngay (trình duyệt: 0 dialog, chip thành Trusted); `Reference.tsx:272-275` “Thay PDF” mở chọn tệp ngay | Thêm câu hệ quả cạnh nút “Duyệt n mục đã chọn”; dialog cho “Duyệt lại” (lý do tùy chọn gửi trong body) và cho “Thay PDF” |
| G4 | H17: “Xóa … → deleteReference → về /library”; “Gộp … → mở trang reference đích” | contradicts | MEDIUM | `Reference.tsx:337-340`: xóa xong gọi `onChanged()` → `getReference` 404 → màn “Không tìm thấy trang” của shell; thông báo “delete.done” mất. Trình duyệt: sau khi xóa `asai2024selfrag`, URL vẫn `/library/4e…0005`, trang chỉ còn hộp “Không tìm thấy trang · not_found”. `Reference.tsx:348-351`: gộp xong ở lại trang cũ (banner “đã được gộp vào”) | Xóa xong chuyển về `/library` kèm thông báo; gộp xong mở trang reference đích; thêm kiểm vào `reference.spec.tsx › xóa khi không dùng` |
| G5 | design.md §4 Dialog; sires-ui-review A11y; yêu cầu dialog có giữ focus | partial | MEDIUM | `common.tsx:54-71`: không giữ focus trong dialog, nền không `inert`. Trình duyệt (dialog thu hồi): Tab lần 3 đã ra khỏi dialog; Shift+Tab từ ô lý do ra ngay. Đạt: `aria-modal="true"`, `aria-labelledby`, Escape đóng, focus đầu vào ô lý do hoặc nút an toàn (“Giữ reference”) | Giữ focus vòng trong dialog (hoặc dùng `Dialog`/`ConfirmDialog` chung của shell khi nhánh có preview `1df54a9`) |
| G6 | H20 (“Từ 1280px: Discover là cột chính và cột phải 340–400px (Đã chọn, Nhập thủ công)”); màn tham chiếu `Discover.html`; H12 (“Nút ‘Thêm vào luồng duyệt’ gửi mọi phần đã điền”; PDF 202 → thẻ thao tác dài) | partial | MEDIUM | `Discover.tsx:246-379` một cột, `ManualImport` ở cuối trang (`:378`). Đo ở 1440: danh sách kết quả x=32, rộng 1280; panel nhập thủ công y=1259, rộng 1280. `ManualImport.tsx:117,130` hai nút gửi riêng; `:136` PDF gửi ngay khi chọn tệp; `:93` 202 chỉ hiện một dòng chữ | Dựng cột phải (Đã chọn · n, nút gửi lô, Nhập thủ công) ở ≥1280px, rơi xuống dưới khi hẹp; một nút “Thêm vào luồng duyệt” cho mọi phần đã điền; PDF 202 hiện thẻ `LongOperation` |
| G7 | H14, H20, EC44 (390px: panel chờ duyệt dùng được, “nút cao từ 44px”) | partial | MEDIUM | Đo ở 390×844: “Từ chối đã chọn”, “Duyệt 4 mục đã chọn” cao 40px; “Gộp”, “Giữ riêng và duyệt”, “Từ chối”, “Sửa metadata” cao 32px; ô chọn 18px. `library.css:158-163` không có luật cỡ nút khi hẹp; `Library.tsx:341-346` dùng `data-size="xs"` | Ở màn hẹp, nút và vùng bấm của panel chờ duyệt cao từ 44px |
| G8 | H11 (phần phải giữ, không thuộc phần tạm): “lọc theo năm, từ khóa trên các mục đã tải”; P6 “lọc trên mục đã tải” | missing | MEDIUM | `Discover.tsx:273` ẩn ô năm khi tab Tác giả; `:337-359` danh sách kết quả tác giả không có ô lọc | Thêm lọc năm và từ khóa trên các mục đã tải của lần tìm theo tác giả; test |
| G9 | H19, P14 (nghe `pending_action.changed` loại reference_approval, `prompt.status_changed`); H4 (mock phát `pending_action.changed`) | partial | MEDIUM | `Library.tsx:61` chỉ nghe `reference.status_changed`, `reference.indexing_status_changed`; `Discover.tsx:124-131` đăng ký `prompt.status_changed` nhưng bỏ qua; mock chỉ phát `workflow.status_changed` (`__mocks__/store.ts:131`) và `reference.*`, `project_reference.changed` (`__mocks__/index.ts`) | Library tải lại panel khi `pending_action.changed`; Discover đọc lại prompt khi `prompt.status_changed`; mock phát `pending_action.changed` khi có reference chờ duyệt mới hoặc đã quyết |
| G10 | DATA-IDEMP-001; H10, H12; README shell “Lệnh có tác động: idempotency.run” | partial | MEDIUM | `Discover.tsx:223-227` khóa `importDiscoveredResults:${attempt}` tăng mỗi lần bấm, nên bấm gửi lại sau 5xx hay lỗi mạng mang khóa mới; `ManualImport.tsx:50,69,92` tạo khóa mới mỗi lần (`createIdempotencyKey()`), dòng DOI lỗi mạng gửi lại có thể tạo reference trùng | Gửi lại cùng lô, cùng DOI, cùng BibTeX, cùng PDF sau lỗi chưa rõ kết quả thì dùng lại khóa (`idempotency.run` theo nội dung); “Thử lại các mục lỗi” vẫn là lô mới, khóa mới |
| G11 | UX-STATE-003 (lỗi tại phần); H8, H10 | contradicts | MEDIUM | `Discover.tsx:229-231` lỗi của `importDiscoveredResults` ghi vào `startError`, nên hiện hộp lỗi của lần tìm (`:240-244`: “Nguồn không phản hồi” hoặc “Không bắt đầu tìm được”) với nút “Tìm lại” (`:299`) chạy lại lần tìm và xóa kết quả, lựa chọn | Lỗi gửi lô hiện tại vùng lô (mã lỗi, “Gửi lại”), không đụng lần tìm |
| G12 | H17 (P12): form sửa metadata gồm tiêu đề, tác giả (danh sách, thêm, bớt, xếp lại), năm, venue, loại tài liệu, DOI, arXiv, ISBN, URL, tóm tắt | partial | MEDIUM | `Library.tsx:356-411` (`MetadataForm`) chỉ có tiêu đề, tác giả (một chuỗi ngăn bằng “;”), năm, venue. LIB-METADATA-001-AC02 vẫn đạt | Thêm các trường còn thiếu và ô tác giả dạng danh sách |
| G13 | H13 (Revoked đang dùng có cờ viền đứt “needs review”; trống tài khoản = `listReferences` không lọc rỗng; Unavailable ghi câu UX-REF-002); designs/notes (doe2023hd “needs review”) | partial | LOW | `Library.tsx:164-166` không có cờ; trình duyệt lọc Revoked: dòng doe2023hd chỉ ghi “1 project” (màn tham chiếu: “1 project · needs review”). `Library.tsx:108-115` xét trống theo bộ lọc mặc định Trusted, tài khoản chỉ có Revoked hoặc Rejected vẫn thấy “chưa có reference”. Dòng Unavailable ghi “Citation được, evidence không” | Thêm cờ needs review; xét trống bằng lần đọc không lọc; dùng câu đầy đủ hoặc ghi lý do theo màn tham chiếu |
| G14 | H15 | partial | LOW | `Reference.tsx:294-314` Provenance thiếu người tạo, `createdAt` (đang dùng `retrievedAt`), sửa gần nhất (`updatedAt`, `updatedBy`), index (`embeddingModel`), gộp; `:286` liên kết project là `/projects/{id}/overview` (H15: `/projects/{projectId}/evidence`; test `reference.spec.tsx › project đang dùng` còn khẳng định `/overview`); `:164` chip index không kèm số đoạn khi Indexed (số đoạn nằm ở Source Document) | Bổ sung các dòng Provenance theo H15; đổi liên kết sang `/evidence` và sửa test; thêm số đoạn vào chip |
| G15 | H17 (Gộp chỉ khi có `duplicateWarnings`, banner viền đứt; Pending Approval có `duplicateWarnings` thêm “Gộp vào reference có sẵn”) | partial | LOW | `Reference.tsx:203-210` mọi Trusted đều có “Gộp” với danh sách mọi Trusted (`MergeDialog`, `:432-463`); không có banner nghi trùng; `:193-202` Pending Approval không có “Gộp” | Theo H17: banner và “Gộp vào” reference kia khi có `duplicateWarnings`, ở cả Trusted và Pending Approval |
| G16 | H8, H9 | partial | LOW | Hộp lỗi thiếu câu “Trusted Library và reference đã có không bị ảnh hưởng” (`i18n/vi.json:173`); workflow Failed với `provider_unavailable`, `timeout`, `network_error`, `service_unavailable` hiện “Nguồn trả lỗi hoặc yêu cầu xác minh” thay vì “Nguồn không phản hồi” (`Discover.tsx:243`); dòng kết quả thiếu định danh DOI hoặc arXiv dạng mono (`:397-405`); “hoạt động gần nhất” luôn là `startedAt` (`:306`); lần tìm `Interrupted` không có giao diện | Sửa theo H8, H9 |
| G17 | H14 (panel 50 mục mỗi trang, “Tải thêm”), EC30 phần S07, EC33 | partial | LOW | `Library.tsx:190` đọc một lần tối đa 200 mục, không “Tải thêm”; `:212-227` khi mọi mục bị `skipped` thì không đọc lại metadata | Trang 50 mục và “Tải thêm”; đọc lại mục bị skipped |
| G18 | Chất lượng | partial | LOW | Console dev: “A component is changing a controlled input to be uncontrolled … at ResultRow” khi dòng chuyển Imported (`Discover.tsx:391-396`) | Giữ ô chọn luôn có `checked` |
| G19 | README shell dòng 5 (“chỉ dùng shell qua index.ts”), mock README bước 4 | partial | LOW | `index.tsx:7-8` import `../../shell/feature`, `../../shell/mock-enabled` thay vì `../../shell`; `test-utils.tsx:15-20` dùng `shell/hooks`, `shell/routes`, `shell/services` (chỉ trong test) | Import `mockEnabled`, `Feature` từ `../../shell`; test dùng helper công khai của shell khi có |
| G20 | H16 (“Tải PDF” 404 → báo không còn tệp) — theo dõi, không tính lỗi | partial | LOW | `Reference.tsx:271` “Tải PDF” là thẻ `<a href="/api/v1/references/{id}/document">` (GET, có cookie phiên, không cần CSRF) nên không báo được 404; `ManualImport.tsx:92`, `Reference.tsx:127` ép kiểu `FormData as never` | Khi nhánh có `getBlob` của shell (preview `1df54a9`), tải qua client của shell và báo 404 |

### AC

Mức kiểm: stub (mock của PID-00013 và mock của khu vực, Vitest + jsdom). Phần backend của các AC kiểm khi Hội tụ ở cổng PH-05 (N1, N10). Đã đọc từng test: tên test đúng tên ở `specs/acceptance.html`, assertion phủ Given–When–Then.

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00098-AC01 | đạt | stub | `discover.spec.tsx › kết quả không giống Trusted` | đạt (4 nhãn viền đứt, không `.sires-chip`, không BibTeX key, dòng trùng liên kết R, ô chọn vô hiệu) |
| PID-00098-AC02 | đạt | stub + trình duyệt | `reference.spec.tsx › indexing lỗi có thử lại` | đạt (alert, mã, retry gọi 1 lần, chip Queued, “Tải PDF khác” mở chọn tệp) |
| UX-REF-001-AC01 | đạt | stub | `discover.spec.tsx › nhãn đã có và chưa duyệt` | đạt |
| UX-REF-002-AC01 | đạt | stub + trình duyệt | `reference.spec.tsx › hai trạng thái và Unavailable`; `library.spec.tsx › hai trạng thái trên dòng` | đạt (dòng bảng dùng câu rút gọn, G13) |
| UX-REF-003-AC01 | đạt (trừ truy vấn gốc, N6) | stub | `reference.spec.tsx › provenance` | đạt; Provenance còn thiếu dòng theo H15 (G14) |
| UX-STATE-002-AC01 | đạt | stub | `library.spec.tsx › thư viện trống` | đạt |
| LIB-LIBRARY-001-AC01 | đạt | stub | `reference.spec.tsx › thêm vào project không duyệt lại` | đạt |
| LIB-LIBRARY-001-AC02 | đạt | stub | `reference.spec.tsx › project đang dùng` | đạt (liên kết sai đích, G14) |
| DISC-SCHOLAR-001-AC01 | đạt | stub | `discover.spec.tsx › metadata và bản ghi nguồn` | đạt |
| DISC-SCHOLAR-001-AC02 | đạt | stub | `discover.spec.tsx › nguồn yêu cầu xác minh` | đạt (không gọi lại tới khi bấm “Tìm lại”) |
| DISC-SCHOLAR-001-AC04 | đạt | stub | `discover.spec.tsx › nhãn đã có và chưa duyệt` | đạt |
| DISC-SCHOLAR-002-AC02 | đạt | stub | `library.spec.tsx › nguồn discovery lỗi không ảnh hưởng` | đạt |
| INT-SCHOLAR-002-AC01 | đạt | stub | `discover.spec.tsx › nguồn giới hạn truy cập` | đạt |
| INT-SCHOLAR-004-AC01 | đạt | stub | `discover.spec.tsx › danh sách có thể không đầy đủ` | đạt |
| DISC-REVIEW-001-AC01 | đạt | stub | `discover.spec.tsx › chọn 3 loại 2` | đạt |
| DISC-AUTHOR-001-AC01 | đạt (H11 tạm) | stub | `discover.spec.tsx › hai hồ sơ cùng tên` | đạt (2 phương án, không chọn sẵn, không `GET /discovered-results` trước khi trả lời) |
| DISC-AUTHOR-001-AC02 | đạt | stub | `discover.spec.tsx › danh sách có thể không đầy đủ` | đạt |
| DISC-AUTHOR-001-AC03 | đạt | stub | `discover.spec.tsx › chọn tất cả đủ điều kiện` | đạt (đúng 5 mã, 5 Pending Approval) |
| DISC-AUTHOR-001-AC04 | đạt | stub | `discover.spec.tsx › công bố của tôi`, `› ẩn công bố của tôi khi chưa lưu URL` | đạt |
| DISC-ADAPTER-001-AC01 | đạt | stub | `discover.spec.tsx › ẩn tìm theo tác giả` | đạt |
| LIB-IMPORT-001-AC01 | đạt | stub + trình duyệt | `discover.spec.tsx › tóm tắt lô có mục lỗi` | đạt |
| LIB-IMPORT-001-AC03 | đạt | stub | `discover.spec.tsx › mục trùng trong lô` | đạt |
| LIB-IMPORT-002-AC01 | đạt | stub | `import.spec.tsx › ba DOI chờ duyệt` | đạt (3 khóa khác nhau) |
| LIB-IMPORT-002-AC02 | đạt | stub | `import.spec.tsx › BibTeX trùng DOI` | đạt |
| LIB-IMPORT-002-AC03 | đạt | stub | `import.spec.tsx › PDF bị từ chối` | đạt (51 MB không có request; 422 có lý do; không tạo reference) |
| LIB-APPROVAL-001-AC02 | đạt | stub | `library.spec.tsx › sửa năm rồi duyệt` | đạt |
| LIB-APPROVAL-001-AC04 | đạt | stub | `discover.spec.tsx › đã từ chối trước đây` | đạt |
| LIB-APPROVAL-001-AC05 | đạt | stub | `library.spec.tsx › duyệt lô 20` | đạt (một lệnh, 20 quyết định, có Idempotency-Key) |
| LIB-APPROVAL-001-AC06 | đạt | stub + trình duyệt | `library.spec.tsx › mục nghi trùng ngoài lô` | đạt; nút “Gộp” của mục này thiếu dialog hệ quả (G2) |
| LIB-APPROVAL-001-AC07 | đạt | stub | `library.spec.tsx › reference DOI vẫn chờ duyệt` | đạt |
| LIB-PROJECT-001-AC02 | đạt | stub | `reference.spec.tsx › reference chờ duyệt không thêm vào project` | đạt |
| LIB-LIFECYCLE-001-AC01 | đạt | stub + trình duyệt | `reference.spec.tsx › thu hồi nêu ảnh hưởng hai project` | đạt (hệ quả trước nút xác nhận, lý do bắt buộc, gọi 1 lần) |
| LIB-METADATA-001-AC02 | đạt | stub | `reference.spec.tsx › sửa tiêu đề giữ key` | đạt (If-Match, không `bibtexKey`, “phiên bản 3”) |
| LIB-CONTENT-001-AC01 | đạt | stub + trình duyệt | `reference.spec.tsx › Unavailable vẫn có key` | đạt |
| LIB-CONTENT-001-AC02 | đạt | stub | `reference.spec.tsx › tải PDF lên rồi Indexed` | đạt (số đoạn hiện ở Source Document, chưa ở chip, G14) |

Edge case: mọi test có tên ở `specs/scope.html` (EC01–EC43, EC45) đều có và đạt; tên file test và đường dẫn Đầu ra O1–O6 khớp hồ sơ (quy tắc 1.4.13). EC44 (QC kiểm tay): không cuộn ngang ở 1440, 1024, 390; panel chờ duyệt dùng được ở 390 nhưng nút dưới 44px (G7). EC46 (QC kiểm tay): bật reduced motion thì thanh chạy `sires-sweep` của thẻ đang tìm dừng, đạt. Chỗ EC đạt test nhưng lệch H: EC32 (gộp không hỏi, G2), EC33 (G17), EC37 (đạt).

Kết luận sires-ui-review: **Chưa đạt** — 1 Blocker (G2: thao tác gộp không nêu hệ quả), Major: G6 (bố cục Discover lệch màn tham chiếu và H20), G7 (nút dưới 44px ở 390), G5 (dialog không giữ focus). Đạt: token và font (check-ui 0 lỗi), một nút chính mỗi màn, chip qua `StatusChip` của shell với tên trạng thái tiếng Anh, nhãn viền đứt cho kết quả chưa duyệt, trạng thái trống, đang tải (skeleton có `role="status"`), lỗi tại phần, không cuộn ngang, đổi VI/EN (tiêu đề đổi theo, nội dung đang nhập giữ), reduced motion.

### H11 — quyết định tạm

Trong hồ sơ (#137, mục Làm rõ H11 và “Còn mở”): **phần tạm, chờ PO** là bước chọn hồ sơ tác giả qua Interactive Agent Prompt `choice` (workflow sang Waiting for User → `listPrompts` theo `workflowId`, `status = Open` → thẻ prompt của shell ngay dưới thẻ thao tác, mỗi hồ sơ một phương án, không chọn sẵn → `answerPrompt`; không tải công bố trước khi trả lời), vì hợp đồng chưa mô tả (Phải sửa ở nguồn mục 2). **Phần phải giữ**: tab “Tác giả” chỉ hiện khi có nguồn available `supportsAuthorSearch`; `startAuthorSearch` với tên và nguồn mặc định (OpenAlex nếu hỗ trợ); ghi chú “Danh sách có thể không đầy đủ”; lọc năm, từ khóa trên mục đã tải; “Chọn tất cả kết quả đủ điều kiện” (không trùng, có tiêu đề, có tác giả, tối đa 50) rồi gửi lô; “Công bố của tôi” khi có `googleScholarProfileUrl` và `google_scholar` hỗ trợ, gửi URL với `source = google_scholar`, bỏ bước chọn hồ sơ; 0 kết quả có thông báo và gợi ý tìm theo từ khóa.

| Điểm | Mã | Kết quả |
| --- | --- | --- |
| Bước chọn hồ sơ (phần tạm) | `Discover.tsx:93-97` (`listPrompts` với `workflowId`, `status: 'Open'`), `:110`, `:130`, `:311-322` (`PromptCard` của shell dưới `LongOperation`, `answerPrompt` qua `idempotency.run`) | Đúng H11; gói gọn trong `loadPrompt` và khối `PromptCard`, đổi cách khác thì chỉ sửa chỗ này |
| Không chọn sẵn, không tải công bố trước khi trả lời | test `› hai hồ sơ cùng tên` | Đạt |
| Tab Tác giả, nguồn mặc định | `Discover.tsx:79-80`, `:189`, `:259` | Đạt |
| Ghi chú danh sách không đầy đủ | `Discover.tsx:342` | Đạt |
| Lọc năm, từ khóa trên mục đã tải | — | **Thiếu (G8)** |
| Chọn tất cả đủ điều kiện | `Discover.tsx:220`, `:234-236`, `:345-346`; `common.tsx:45-47` | Đạt |
| Công bố của tôi | `Discover.tsx:83-84`, `:285-287` | Đạt |
| 0 kết quả theo tác giả | `Discover.tsx:326-327` | Đạt |
| Hồ sơ ghi rõ phần tạm | `report.md` mục 1 và 6 (“Chờ PO”), `self-qc.md` G3, mô tả PR #144, chú thích `test-utils.tsx:29` | Đạt, khớp mục “Còn mở” của ticket |
| `dev:mock` | Không có mock của global cho prompt; tìm theo tác giả trên `dev:mock` không dừng ở thẻ chọn hồ sơ (QC chạy thử: ra thẳng 5 kết quả) | Đúng như Dev đã ghi (self-qc G2), chờ PID-00060 |

### Trình duyệt

`apps/web`: `node src/shell/mock/generate.mjs && npx vite --mode mock --port 5182 --strictPort`; Playwright 1.64.1 với Chromium cài sẵn; script và ảnh ở scratchpad (`qc-144-shots/`). Đã dừng server sau khi kiểm (tiến trình node 29960).

| Màn, khổ | scrollWidth | Console | So với màn tham chiếu |
| --- | --- | --- | --- |
| `/discover` 1440×900 (chờ, đang tìm, có kết quả, gửi lô, tóm tắt) | 1440 = clientWidth | 2 lỗi 404 `GET /workflows/{id}` của lô (mock monitoring chưa có, đã biết); 1 cảnh báo React controlled → uncontrolled (G18) | Nhãn và dòng kết quả đúng ý H9; thiếu cột phải “Đã chọn”, “Nhập thủ công” (G6); thiếu định danh mono (G16) |
| `/discover` 1024×768 | 1024 | không | Một cột |
| `/discover` 390×844 (đang tìm) | 390 | không | Thẻ đang tìm đọc được |
| `/library` 1440×900 | 1440 | không | Khớp bố cục màn Library: panel chờ duyệt viền xanh, mục nghi trùng không ô chọn và ba nút riêng, bảng năm cột, ngày duyệt dưới chip; thiếu “needs review” ở dòng Revoked (G13) |
| `/library` 1024×768, 390×844 | 1024; 390 | không | Bảng cuộn trong thẻ; panel dùng được; nút 40px và 32px (G7) |
| `/library/{lewis}` 1440, 1024, 390 | 1440; 1024; 390 | không | Màn tham chiếu đặt nút cạnh tiêu đề và Provenance dạng dòng thời gian ở cột phải; bản dựng đặt nút dưới chip, các thẻ xếp lưới; chip index không kèm số đoạn (G14) |
| `/library/{gao}` Failed 1440, 1024, 390 | đều không cuộn ngang | không | Hộp lỗi `role="alert"` có lý do, mã, hai nút |
| `/library/{liu}` Unavailable, `{huang}` Pending, `{doe}` Revoked 1440 | 1440 | không | Câu giải thích theo cặp trạng thái; nút theo trạng thái |
| Dialog thu hồi | — | không | `aria-modal`, `aria-labelledby`, Escape, focus đầu ở ô lý do: đạt; Tab ra khỏi dialog (G5) |
| Xóa reference không dùng | — | 404 của `getReference` sau khi xóa | Hiện “Không tìm thấy trang” thay vì về `/library` (G4) |
| “Gộp” trong panel; “Duyệt lại” | — | không | Không có dialog (G2, G3) |
| Reduced motion, đang tìm | — | không | Thanh `sires-sweep` dừng khi `reduce`, chạy khi `no-preference` |
| Giao diện `en` | — | không | Tiêu đề, nhãn đổi sang tiếng Anh |

Màn References and Evidence của project không thuộc PID này (N9), không kiểm.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` (gốc worktree) | exit 0, 1 phút 26 giây; postinstall sinh mock “23 operations → features/library/__mocks__/generated” |
| `npx tsc -p tsconfig.json --noEmit` (`apps/web`) lần đầu | 965 lỗi “Cannot find module '@sires/contracts'”: thư viện contracts chưa build (Nx chạy `^build` trước typecheck). Không phải lỗi của PR |
| `node scripts/generate.mjs --ts-only` và `npx tsc -p tsconfig.json` trong `libs/ts/contracts` | exit 0 (sinh `src/generated`, `dist`, đều nằm trong `.gitignore`) |
| `npx tsc -p tsconfig.json --noEmit` (`apps/web`) lần hai | exit 0, 0 lỗi |
| `npx eslint src/features/library` | exit 0, 0 lỗi (cảnh báo: chưa có ProjectGraph nên `@nx/enforce-module-boundaries` bị bỏ qua) |
| `npx vitest run src/features/library --maxWorkers=2` | 4 file, 86/86 đạt |
| `npx vitest run --maxWorkers=2` (toàn bộ `@sires/web`) | 24 file, 231/231 đạt (150 giây), gồm `shell/mock/build.spec.ts` |
| Thử đột biến: đổi `index.tsx:25` về `import.meta.env.DEV ? … : undefined`, chạy `build.spec.ts`, rồi `git checkout --` | 2 test hỏng (“mỗi khu vực khai mocks sau mockEnabled”; “bản build không có mock (NODE_ENV=development)”: 16 module mock lọt vào bundle). Hoàn lại: sạch. Nghĩa của “khai mock sau mockEnabled”: dòng `mocks:` của khu vực đứng sau hằng `mockEnabled` của shell (`DEV && MODE !== 'production'`, từ #131 Lần 5), nên mọi bản build bỏ mock |
| `node agent/skills/qc/sires-ui-review/scripts/check-ui.mjs apps/web/src` | 0 lỗi, 12 cảnh báo; của library: 3 cảnh báo bóng ở `library.css:151` (dialog, design.md cho phép) |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu thông báo |
| `node scripts/development/check-tracks.mjs --base origin/preview/ui-ph02` | tracks: repo, web/library, web/shell; cảnh báo PR chạm 2 luồng (G1) |
| `check-pid.mjs PID-00098 --root <hồ sơ #137>`; `--result` | ĐỦ (2 cảnh báo); KẾT QUẢ ĐỦ (1 cảnh báo) |
| `git log origin/preview/ui-ph02..HEAD`, `git diff --stat …` | Xem mục “Phạm vi thay đổi của PID” |
| Playwright trên `vite --mode mock --port 5182` | Xem bảng Trình duyệt |
| `pnpm nx affected -t lint typecheck test build` | không chạy — theo yêu cầu của phiên giao (máy 16 GB dùng chung, một QC khác chạy song song) |

`git status` của worktree sạch khi kết thúc.

### Lệch với Self-QC

- Self-QC G1 xếp việc sửa `apps/web/src/shell/` ở MEDIUM. QC xếp HIGH (G1): spec mục 7 cấm sửa và yêu cầu dừng, hỏi; PR vẫn chứa 6 file shell và chạm hai luồng.
- Self-QC kết luận “không còn khoảng trống CRITICAL hay HIGH”. QC thấy G2 (gộp mục nghi trùng không có dialog hệ quả, H14).
- Self-QC ghi EC32 “đã giải quyết” với `› gộp mục nghi trùng`: test đó khẳng định gộp ngay khi bấm, trái H14.
- Self-QC ghi EC44 ở 390 “panel dùng được”: đúng là dùng được và không cuộn ngang, nhưng nút 40px và 32px, dưới mức 44px của H14 (G7).
- Self-QC mục 4 ghi “Giao diện theo design.md”: bố cục Discover thiếu cột phải theo H20 và màn tham chiếu (G6).
- Self-QC không nêu: xóa reference xong rơi vào “Không tìm thấy trang” (G4); dialog không giữ focus (G5); lỗi gửi lô hiện như lỗi lần tìm (G11); khóa idempotency đổi khi gửi lại (G10); thiếu lọc trên mục đã tải của H11 (G8); thiếu nghe `pending_action.changed` (G9).
- Khớp với Self-QC: 86 test của khu vực và 231/231 test của web đạt; lint, typecheck 0 lỗi (sau khi build contracts); `build.spec` không có mock; check-ui 3 cảnh báo bóng dialog; add-license sạch. Dev chưa kiểm 1024, `en`, reduced motion; QC đã kiểm: đạt (trừ G7).

### Việc còn lại, theo thứ tự phụ thuộc

1. Phiên điều phối đưa 6 file shell của `78baa91` (`MockRequest.emit`, `ApiClient` gửi `FormData`, `topbar.spec`) vào luồng `web/shell`; PR này bỏ `78baa91` sau khi phần đó vào (G1).
2. Dialog hệ quả cho “Gộp” ở panel chờ duyệt, kèm test hủy không gọi API (G2, H14, EC32, EC34).
3. Dialog: giữ focus vòng trong dialog, hoặc chuyển sang `Dialog`/`ConfirmDialog` của shell sau khi nhánh có preview `1df54a9` (G5); dùng cùng dialog cho “Duyệt lại”, “Thay PDF” và thêm câu hệ quả cạnh nút duyệt lô (G3).
4. Xóa xong về `/library`, gộp xong mở reference đích (G4, H17).
5. Lỗi gửi lô hiện tại vùng lô (G11); dùng lại khóa idempotency khi gửi lại sau lỗi chưa rõ kết quả cho lô, DOI, BibTeX, PDF (G10).
6. Bố cục Discover có cột phải ở ≥1280px, một nút gửi cho nhập thủ công, PDF 202 có thẻ thao tác dài (G6, H20, H12); nút panel chờ duyệt cao từ 44px ở màn hẹp (G7).
7. Lọc năm, từ khóa trên kết quả tìm theo tác giả (G8, H11 phần phải giữ).
8. Nghe `pending_action.changed`, xử lý `prompt.status_changed`, mock phát `pending_action.changed` (G9).
9. Form sửa metadata đủ trường theo H17 (G12).
10. Việc LOW: G13–G20.
11. Ghi “Lần 2” trong `report.md`, `self-qc.md`; QC chạy lại.

### Đề xuất cho PO

- H11 vẫn chờ PO quyết (ticket “Còn mở”). Mã đã gói phần tạm trong `loadPrompt` và khối `PromptCard` của `Discover.tsx`, đổi cách khác không ảnh hưởng phần còn lại.
- Thứ tự merge: #120, #138, #131 (Lần 5, head `612c94b`) phải vào trước, vì PR này chứa merge commit `fbb0ac0` của #131. Nên cập nhật nhánh lên `preview/ui-ph02` mới (`1df54a9`, có `Dialog`, `getBlob`, `getText` của shell) trước khi Dev làm G5, G20.
- Spec mục 7 nói “shell thiếu API → dừng và hỏi”, nhưng hồ sơ PID-00012, PID-00013 chưa có kênh nhận yêu cầu của khu vực. Đề xuất ghi rõ cách xin thay đổi shell (ví dụ mở issue cho luồng `web/shell`) để lần sau Dev không phải sửa shell trong PR của khu vực.
- H15 đặt liên kết project là `/projects/{projectId}/evidence`; nên xác nhận route này có trong IA của shell trước khi Dev đổi (G14).
- `dev:mock`: `getWorkflow` của workflow do mock library tạo trả 404 (thấy trong console khi gửi lô). Việc của mock monitoring (PID-00059), đúng như Dev đã đề xuất.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
