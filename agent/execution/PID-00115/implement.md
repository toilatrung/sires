# PID-00115 — Triển khai

- **Ticket:** [PID-00115](../../../docs/tickets/issues/PID-00115/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Khu vực `web/manuscript` có một route `projects/:projectId/manuscript/*` (`index.tsx`), phần sau `manuscript/` là đường dẫn file đang mở, `?proposal=` là deep link của Change Proposal (H11). Mọi lời gọi JSON qua `useApi()` của shell. Nội dung file, build log, PDF, export không phải JSON nên đi qua `rawGet` (`model.ts`): `api.url(path)` rồi `fetch`, lỗi đổi thành `ApiError`. Sự kiện qua `useEvents` của shell: nhận sự kiện thì tải lại bằng GET, không dựng trạng thái từ payload (H19).

**Trạng thái của màn** — `state.tsx` (`ManuscriptProvider`, `useManuscript`)

1. Tải song song năm phần: manuscript (404 → chưa khởi tạo), file của revision hiện hành, proposal (`limit=200`), bibliography, build (`limit=50`). Mỗi phần có `Load` (loading, ready, error) riêng nên lỗi một vùng không làm hỏng vùng khác (EC05).
2. Mỗi file đang mở là một `Doc`: `server` (văn bản của bản trên server), `text` (văn bản trong editor), `baseHash` (contentHash của bản server mà `text` bắt đầu từ đó, lấy từ ETag của `getManuscriptFileContent`). Có thay đổi khi `text !== server`.
3. Lưu (H6): mọi file có thay đổi gửi trong một `commitManuscriptChanges` (`baseRevisionId` = revision hiện hành, `modify` kèm nội dung), qua `idempotency.run('commitManuscriptChanges:{projectId}')`. Lỗi mạng hoặc 5xx giữ key nên “Lưu lại” gửi cùng Idempotency-Key (EC20).
4. Xung đột (H7): trước khi gửi và sau 409 `base_revision_mismatch`, so `baseHash` của từng file với contentHash trong danh sách file mới. Không file nào đổi → tự gửi lại một lần với revision mới (EC18). Có file đổi → không gửi; file đó nhận `conflict` (văn bản server, revision và actor gần nhất đã đổi file, tìm trong 50 revision mới nhất) để hiện hộp cảnh báo (EC19).
5. Nháp (H8): mỗi file văn bản đăng ký một trường của kho nháp shell, route `/projects/{projectId}/manuscript`, trường `file:{fileId}`, giá trị JSON `{ text, baseHash, path }`. Có thay đổi thì ghi, hết thay đổi thì xóa. Mở file mà kho có nháp khác bản server → `draft`; `stale` khi `baseHash` của nháp khác bản hiện tại. Khôi phục nháp cũ giữ `baseHash` cũ nên lưu sẽ đi qua bước 4 (EC22).
6. Sự kiện `manuscript.object_status_changed`: `revision` → tải lại manuscript, file, bibliography; `change_proposal` → proposal; `build` → build và manuscript. Shell báo nối lại hoặc cần tải lại → tải lại cả năm phần (EC52). Sau khi danh sách file đổi: file không có thay đổi mà contentHash khác → tải lại nội dung; file có thay đổi giữ nguyên (EC24); file đổi tên theo đường dẫn mới; file mất khỏi revision và không có thay đổi → đóng tab.
7. `commit(changes, { retry })` cho thao tác file và khôi phục (S03, S07): một revision; 409 thì tải lại rồi gửi lại một lần nếu `retry` trả danh sách thay đổi mới. `build()`: còn file chưa lưu thì lưu trước, lưu không được thì không build (H6, EC44), rồi `startBuild` revision hiện hành. `init(mode)`: `initManuscript` có Idempotency-Key; 409 (tạo ở tab khác) tải lại, không báo lỗi (EC02).
8. Project Archived: lấy từ `useNavigationData().project.status` của shell (H20). Mọi nút ghi ẩn; lệnh ghi nhận 409 `project_archived` thì báo theo mã và tải lại.

**Khung màn (S02)** — `ManuscriptScreen.tsx`, `layout/Workspace.tsx`, `layout/InitPanel.tsx`, `ui.tsx`

1. `useLayout()` (`ui.tsx`): dưới 768px → màn điện thoại `MobileProposals` (H21); 768–1279 → tablet; từ 1280 → desktop. Không có `matchMedia` (test) thì tính là desktop.
2. Project không tìm thấy (shell báo `not-found`) → `NotFound` của shell (EC04). Manuscript 404 → `InitPanel`: hai lựa chọn Default, Blank kèm điều mỗi loại tạo ra, không chọn sẵn, nút chính “Khởi tạo bản thảo” vô hiệu tới khi chọn (EC01).
3. Thanh công cụ (H2): liên kết Project (Overview), chip build (S08), “revision N · đã lưu HH:MM” hoặc “n file chưa lưu”, tablist PDF / Build log / Lịch sử, “Ẩn vùng xem”, “Lưu” (phụ), Export (S08), “Build PDF” (nút chính duy nhất). Build PDF vô hiệu khi build mới nhất là của revision hiện hành và đang chạy, trừ khi còn file chưa lưu (EC25).
4. Desktop: ba vùng (Tệp và dàn ý | Soạn thảo | vùng xem); ẩn vùng xem rồi chọn lại một tab thì hiện (EC06). Tablet: tablist Tệp / Soạn thảo / Xem, mỗi lúc một vùng; chọn tab vùng xem trên thanh công cụ thì chuyển sang Xem. Tab dùng phím mũi tên.
5. Đang tải: skeleton của cây file và các dòng editor kèm một dòng `role="status"`. Lỗi: `ErrorState` của shell tại vùng, có mã và “Thử lại”.
6. Chân trang: active task của shell (mã, tên, liên kết Task) và “pdfLaTeX · natbib · thay đổi chưa lưu được giữ cục bộ”. Ctrl/Cmd+S ở bất kỳ đâu trên màn đều lưu.

**Editor (S04)** — `editor/Editor.tsx`, `editor/EditorPane.tsx`

1. CodeMirror 6 (`@codemirror/view`, `state`, `commands`, `language`, chế độ `stex` của `@codemirror/legacy-modes`, `@lezer/highlight`; H22). Một `EditorView` cho cả vùng; mỗi file giữ `EditorState` riêng nên đổi tab không mất undo. Chỉ đọc khi Archived hoặc là `bibliography/references.bib`.
2. Hộp Change Proposal là block widget của CodeMirror: mỗi hộp một phần tử DOM cố định, React vẽ vào qua portal (H11). S06 trả danh sách hộp qua `useProposalBlocks(doc)`.
3. “Đi tới dòng”: `cursor` của state (seq tăng mỗi lần) đặt con trỏ đầu dòng, cuộn vào giữa, focus editor.
4. `EditorPane`: tab file đang mở (dấu • khi chưa lưu), banner nháp (Khôi phục / Bỏ nháp), hộp xung đột (Xem khác biệt — diff dòng tính ở giao diện, Giữ bản của tôi, Dùng bản trên server), hộp lỗi lưu, câu references.bib chỉ đọc, xem hình, “Không xem trước được” cho file nhị phân khác.

**Citation (S05)** — `citations/useCitations.tsx`, phần citation của `editor/Editor.tsx`

1. Key có trong bibliography của bản thảo → đã phân giải. Entry có `referenceApprovalStatus` khác Trusted → cảnh báo (MS-BIB-001-AC03). Không có entry → lỗi (gạch đứt danger), kể cả Trusted Reference chưa có entry.
2. Tooltip hiện khi rê chuột hoặc khi con trỏ nằm trong key: “Citation không phân giải: key”, câu giải thích, “Gợi ý: key gần nhất” (khoảng cách sửa ≤ max(2, độ dài/4)) trong số key Trusted; reference thu hồi nêu trạng thái.
3. Gõ `\cite{`, `\citep{`, `\citet{`… → danh sách gợi ý do React vẽ (không dùng `@codemirror/autocomplete`, để có trạng thái trống kèm liên kết và test được): entry Trusted, rồi Trusted Reference của project chưa có entry (`listProjectReferences?status=Active`). Mũi tên, Enter/Tab chọn, Esc đóng.
4. Chọn reference chưa có entry → `addBibliographyEntry` một lần, chèn key server trả về, tải lại bibliography và file (System sinh lại references.bib thành revision mới; lần lưu sau đi qua EC18). 422 `reference_not_trusted` → hộp lỗi có mã, không chèn (EC28). Không có Trusted Reference nào → trống kèm “Mở References and Evidence” (`/projects/{projectId}/evidence`, EC29).

**Mock (S01)** — `__mocks__/`

1. `mocks.config.json`: 20 operation path 12 (H3). `index.ts` override cả 20; các operation của khu vực khác (listProjectReferences, getTask, getClaim, uploadFile, hội thoại) không khai, test override (`otherAreas()` ở `__mocks__/render.tsx`).
2. `fixtures.ts`: project RAG có bản thảo Default r15–r18 như designs/notes.html (bản 27/11/2026): `main.tex` (dòng 4 `\usepackage{booktabs}` do proposal được chấp nhận ở r17 thêm, dòng 12 `\input{sections/method}`), `sections/intro.tex` (dòng 7 `gao2023survy`, dòng 9 `doe2023hd`), `sections/related-work.tex`, `sections/method.tex`, `bibliography/references.bib`, `figures/pipeline.png` (r18 đổi `method.tex` và `pipeline.png`); proposal Proposed 2 file citation 2/2, proposal citation lỗi `asai2024selfrg`, proposal Outdated gốc r16, proposal Accepted của r17; build r16 Succeeded (PDF 6 trang), r17 Failed với issue theo danh mục `BuildIssue.code` và `params` (`missing_package` `package = booktabs` ở main.tex:4; `undefined_citation` `key = gao2023survy` ở sections/intro.tex:7, `friendlyMessage` là gợi ý); bibliography lewis2020rag, gao2023survey, doe2023hd (Revoked); Trusted Reference smith2020 chưa có entry. Project Archived (credit) có một bản thảo nhỏ đã build.
3. `store.ts`: một kho cho cả trang. `FileChange.restoreFromRevisionId` lấy nội dung (văn bản hoặc nhị phân) của file cùng đường dẫn ở revision đó; không có thì 400 trên trường `changes[i].restoreFromRevisionId`. Issue của build có `params` theo danh mục; chấp nhận proposal có `artifactVersionIds` ghi chúng vào revision (Lịch sử ghi “Chèn sơ đồ”). Lưu tạo revision; proposal Proposed trên file vừa đổi chuyển Outdated; chấp nhận áp dụng mọi hunk, kiểm Proposed, `citationCheck.passed === true`, file chưa đổi từ revision gốc; build chạy Queued → Running → kết quả theo văn bản của revision (booktabs → thiếu package; `\input`, `\includegraphics` tới file không có → thiếu file; key không có entry → cảnh báo citation), sinh log và PDF tự tạo (`binary.ts`); export PDF kèm `X-Build-Revision`, zip không nén. Idempotency-Key trả lại kết quả đã gửi. Mỗi thay đổi phát `manuscript.object_status_changed` qua `siresMock.events` (dev) hoặc sink của test.
4. Kịch bản dev: `sessionStorage.setItem('sires.mock.manuscript', 'not-initialized' | 'conflict' | 'building')` rồi tải lại trang.
5. Mock góp `ProjectReferenceSelection` của project RAG vào fixture chung để bản demo dev gợi ý được smith2020; khi khu vực library có mock riêng thì bỏ.

**Cây file và thao tác file (S03)** — `files/FilePanel.tsx`, `files/tree.ts`, `files/useTexIndex.ts`, `files/dialogs.tsx`, `files/RowMenu.tsx`, `files/upload.ts`

1. Cây theo thư mục, thu/mở được; file đang mở đánh dấu viền trái. Nhãn “đề xuất” trên file có Change Proposal Proposed; file do proposal Proposed thêm mới hiện nét đứt kèm “đề xuất · file mới” (chỉ hiển thị, EC35).
2. `useTexIndex`: đọc văn bản của mọi file `.tex` (bản trong editor nếu đang mở, không thì bản server theo contentHash) để dựng chỉ mục `\input`, `\include`, `\includegraphics` và dàn ý. Dàn ý đi từ `main.tex` theo đúng thứ tự `\input`; bấm mở file ở đúng dòng.
3. Tạo file, tạo thư mục, đổi tên/di chuyển, xóa: hộp thoại kiểm `pathProblem` tại ô trước khi gửi, trùng file Active thì báo tại ô, 400 của server hiện lỗi từng trường. Mỗi thao tác là một `commit` (một revision); đổi tên hay xóa thư mục gửi nhiều thay đổi trong cùng commit.
4. Đổi tên, di chuyển, xóa file đang được tham chiếu: hộp xác nhận liệt kê nơi tham chiếu (`main.tex:12`) trước; sau khi làm, banner liệt kê nơi còn trỏ tên cũ (mỗi nơi là nút mở đúng dòng) và nói build sẽ báo thiếu file (EC10). Xóa nêu xóa mềm, khôi phục được từ Lịch sử; thư mục nêu số file (EC11).
5. Tải lên: file văn bản (`.tex`, `.bib`, `.txt`…) đọc nội dung rồi commit `add` kèm `content`; hình và file nhị phân gửi `uploadFile` (multipart dựng từ bytes, kèm `X-CSRF-Token` của phiên) rồi commit `add` kèm `fileUploadId`. 413 báo giới hạn, không tạo revision (EC13).
6. `bibliography/references.bib` và thư mục `bibliography/` không có lệnh đổi tên, xóa (EC12). File có thay đổi chưa lưu: đổi tên, xóa vô hiệu kèm “Lưu hoặc bỏ thay đổi trước” (EC17). Archived: không có thao tác file. Thư mục rỗng chỉ có trên giao diện tới khi thêm file đầu tiên (EC14).

**Change Proposal trong editor (S06)** — `proposals/ProposalBox.tsx`, `proposals/useProposalBlocks.tsx`, `proposals/useProposalActions.ts`, `proposals/dialogs.tsx`, `proposals/useProposalDeepLink.tsx`, `proposals/data.ts`, `proposals/session.ts`

1. Mỗi proposal (Proposed, Outdated, và proposal vừa xử lý trong phiên) có một hộp trong mỗi file nó đổi, đặt sau dòng cũ cuối của hunk đầu tiên. Đầu hộp: “Change Proposal · Writing Agent · chip trạng thái của shell”, mã Task (getTask), số claim, evidence, file; summary; diff của file đang mở để mở sẵn, file khác gập lại kèm “Xem diff”, “Mở file”.
2. Diff hiện dạng chữ (`−`/`+`, mono); key citation lỗi đánh dấu trong dòng `+`. Chip citation: “Citation: N/N phân giải”, “Citation lỗi: key”, “Citation: chưa có kết quả kiểm tra”; mismatches liệt kê. Chip claim lấy `supportStatus` qua getClaim, claim không đọc được thì bỏ qua. “Xem evidence” → `/projects/{projectId}/evidence/claims/{claimId}`.
3. “Chấp nhận cả proposal” (viền xanh) và “Từ chối” (phụ, hộp thoại lý do tùy chọn); không có nút theo khối (H12). Chấp nhận vô hiệu kèm lý do khi `citationCheck.passed !== true` hoặc còn thay đổi chưa lưu ở file của proposal (EC23); ẩn khi Archived. Gửi qua `idempotency.run('acceptChangeProposal:{proposalId}')`, một ref chặn request thứ hai (EC34). Xong → `refresh()`, editor hiện nội dung revision mới.
4. 409: tải lại proposal và manuscript, không tải lại file nên editor giữ nguyên nội dung (MS-DIFF-001-AC01); hộp hiện dòng kết quả theo mã (Outdated, citation, đã xử lý ở nơi khác), không gửi lại (EC32, EC33).
5. Outdated: “Hết hiệu lực: sections/intro.tex đã đổi từ revision 16 (gốc của proposal) sang 18” (file, revision gốc, revision hiện hành theo proposal) (số gốc từ getManuscriptRevision); chỉ “Yêu cầu tạo lại” → hộp thoại chỉ dẫn soạn sẵn (Task, revision, file, summary) sửa được → listConversations (scope project), chưa có thì createConversation, rồi sendMessage kèm `activeTaskId`, Idempotency-Key; lỗi giữ chỉ dẫn, hộp lỗi có mã (EC38).
6. Deep link `?proposal=`: mở file đầu tiên của proposal và cuộn tới hộp; không có trong danh sách thì gọi getChangeProposal trước khi báo “Không tìm thấy proposal” (banner có Đóng, bỏ `?proposal=`); đã xử lý thì mở file và hiện trạng thái (EC37). Hộp thoại portal ra `document.body` vì hộp nằm trong vùng contenteditable của CodeMirror.

**Lịch sử revision (S07)** — `history/HistoryPane.tsx`, `history/CompareView.tsx`, `history/RevisionDetail.tsx`, `history/restore.tsx`, `history/labels.tsx`

1. Danh sách mới nhất ở trên: “r18 · Nguyễn Thị Minh Anh · 09:41” (actor, giờ) và nguồn (“Sửa trực tiếp · method.tex”, “Proposal đã chấp nhận · T-2.1” (mã Task), “Khởi tạo Default”). Hôm nay ghi giờ, ngày khác “dd/mm HH:mm”. “Tải thêm” theo cursor; sự kiện revision tải lại với `limit` bằng số dòng đang có.
2. Chọn đúng hai revision (checkbox) → “So sánh rA ↔ rB”; khác hai thì nút vô hiệu, lý do cạnh nút (EC41). So sánh tính ở giao diện: danh sách file của hai revision (`listManuscriptFiles?revisionId=`), so contentHash theo id; văn bản → `lineDiff`, dòng không đổi dài hơn 5 dòng thu gọn; nhị phân ghi “đã đổi”; thêm/xóa hiện toàn bộ (EC40). Mỗi bên ghi actor, nguồn.
3. Chi tiết revision: provenance — Task (chỉ khi revision có `taskId`), Agent Run → workflow của proposal (`getChangeProposal(changeProposalId).provenance.workflowId`), claim của proposal; danh sách file thay đổi.
4. “Khôi phục file này về rN” (văn bản và nhị phân, EC42): một `commit` `modify` (file đã xóa → `add`) kèm `restoreFromRevisionId` = id của rN; file đã đổi tên sau rN thì gửi nội dung văn bản của rN lên đường dẫn hiện tại (file nhị phân đổi tên thì vô hiệu kèm lý do). “Khôi phục toàn bộ về rN” (EC57, `RestoreAllButton` ở chi tiết revision và màn so sánh): hộp xác nhận nêu số file sửa, thêm lại, xóa (`restorePlan` so contentHash theo đường dẫn); một `commit` gồm `modify`/`add` kèm `restoreFromRevisionId` và `delete` cho file không có ở rN, bỏ qua `bibliography/references.bib`; 409 tải lại rồi lập lại danh sách thay đổi một lần (H7). Vô hiệu kèm lý do khi còn thay đổi chưa lưu, với `references.bib`; Archived không có nút. Lỗi 400 hiện thông báo của trường từ Problem. Xong quay về danh sách kèm banner.

**Build, build log, PDF, Export (S08)** — `builds/BuildChip.tsx`, `builds/PdfPane.tsx`, `builds/BuildLogPane.tsx`, `builds/ExportMenu.tsx`

1. Thư mục tên `builds/` vì `.gitignore` của repo bỏ qua mọi thư mục `build/`.
2. Chip build (thanh công cụ, chip của shell): “Build OK · giờ”, “Đang build · mm:ss” (đếm từ `startedAt`), Queued đếm từ `queuedAt`, “Build lỗi · giờ”; giờ lấy `endedAt`, thiếu thì `startedAt`, `queuedAt`. Chưa có build → “Chưa build”.
3. PDF: build Succeeded gần nhất, tải bằng `rawGet` getBuildPdf thành blob URL trong iframe `#page=N` (trình xem PDF của trình duyệt, không thêm pdf.js); “Xem trước PDF · revision N”, thêm “(bản build gần nhất)” khi đang build revision mới hơn; “Trang n / tổng” (`pdfPageCount`), Trang trước/sau; build mới thì giữ trang, ít trang hơn thì về trang cuối (EC50). Build lỗi: câu nêu build lỗi và PDF đang xem thuộc revision nào, nút “Xem build log”. Đang build: `LongOperation` của shell (“Đang build revision N · pdfLaTeX”, System, thời gian), không Hủy build (N8). Chưa có PDF: “Chưa có PDF” kèm hướng dẫn (EC48).
4. Build log lớp 1: “Build thất bại · giờ · revision N”, “Bản PDF trước (revision M) vẫn được giữ.”; mỗi issue có tiêu đề dịch theo `code` của danh mục 10 mã (`unbalanced_braces`, `undefined_control_sequence`, `missing_file`, `missing_package`, `undefined_citation`, `shell_escape_disabled`, `path_outside_manuscript`, `timeout`, `memory_limit`, `infrastructure_unavailable`) và câu giải thích theo ngôn ngữ giao diện dựng từ `params` (`sentenceKey`: thiếu tham số thì câu chung của mã, không bịa tên; `memory_limit` với `reason = tex_capacity`, `missing_package` có `command` có câu riêng); `friendlyMessage` hiện dưới câu, ghi “Gợi ý:”; mã ngoài danh mục: tiêu đề “Lỗi build (code)” / “Cảnh báo build (code)”, thân là gợi ý, không có thì `message` (EC47); file, dòng, “Đi tới main.tex:4” (tên file ngắn, dòng) khi file còn ở revision hiện hành. Lớp 2 “Log gốc (pdfLaTeX)”: gọi getBuildLog lần đầu khi mở, mỗi build một lần, khối `pre` cuộn trong khung, lỗi tải có Thử lại, tóm tắt vẫn còn (EC49).
5. Export (nút phụ, `role="menu"` dùng bàn phím): PDF theo `revisionId` của build Succeeded gần nhất, tên file từ Content-Disposition; PDF thuộc revision cũ hơn → hộp “PDF thuộc revision M; revision hiện hành là N” với “Tải PDF revision M”, “Build revision N”; chưa có PDF → hộp cho tải zip hoặc Build; zip tải ngay (EC51). Archived: Export còn, Build ẩn.

**Màn điện thoại (S09)** — `mobile/MobileProposals.tsx`

1. Dưới 768px: một cột “Change Proposal chờ bạn: n”, hộp proposal biến thể `mobile` (diff mọi file mở sẵn, xuống dòng; chấp nhận, từ chối, yêu cầu tạo lại dùng chung `useProposalActions`), nút cao 46px, không editor, không “Mở file”, không cuộn ngang. Không có proposal → “Không có proposal chờ bạn” và câu soạn bản thảo dùng máy tính hoặc tablet (EC54).

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `ManuscriptProvider.save` | hàm | `state.tsx` | Gửi mọi file có thay đổi trong một commit; 409 theo H7 | H6, H7; mất dữ liệu nếu sai | Một lần lưu = một revision; không ghi đè bản server đã đổi; nội dung đang sửa không mất | `editor.spec.tsx` (10) |
| `findConflicts` | hàm | `state.tsx` | So `baseHash` với contentHash hiện hành, dựng hộp xung đột | EC18, EC19, EC22 | File không đổi thì gửi lại một lần; file đổi thì không gửi | `editor.spec.tsx › tự gửi lại…`, `› xung đột…`, `› nháp trên bản cũ` |
| kho nháp (`writeDraft`, `loadDoc`) | hàm | `state.tsx` | Ghi, đọc nháp theo file qua kho của shell | UX-STATE-004, H8 | Nháp chỉ có khi văn bản khác bản server; bỏ nháp xóa khỏi kho | `editor.spec.tsx › đề nghị khôi phục nháp`, `› bỏ nháp…` |
| `Editor` | component | `editor/Editor.tsx` | CodeMirror, hộp proposal (portal), đánh dấu citation, gợi ý | Toàn bộ thao tác soạn thảo | Mỗi file một EditorState; chỉ đọc khi Archived và references.bib | qua mọi spec có editor |
| `useCitations` | hook | `citations/useCitations.tsx` | Trạng thái key, tooltip, gợi ý, thêm entry | UX-MS-001, UX-MS-005, MS-BIB-001 | Chỉ gợi ý Trusted; reference thu hồi không gợi ý | `citations.spec.tsx` (8) |
| `useProposalActions` | hook | `proposals/useProposalActions.ts` | Chấp nhận, từ chối, yêu cầu tạo lại | APR-05, MS-DIFF-001 | Chấp nhận cả proposal, một request, chỉ khi citation đạt và không còn thay đổi chưa lưu | `proposal.spec.tsx` (15), `mobile.spec.tsx` (2) |
| `useRestore` | hook | `history/restore.tsx` | Khôi phục file văn bản về rN | MS-REVISION-001 | Một revision mới; revision cũ giữ nguyên | `history.spec.tsx` (8) |
| `BuildLogPane`, `PdfPane`, `ExportMenu` | component | `builds/` | Build log hai lớp, PDF, export | UX-MS-004, MS-BUILD-001, MS-EXPORT-001 | Log gốc chỉ tải khi mở; PDF cũ giữ khi build lỗi | `build.spec.tsx` (16) |
| override path 12, `store.ts` | mock | `__mocks__/` | Trạng thái bản thảo cho dev và test | Mọi màn của PID này | Revision tăng dần; proposal trên file vừa đổi thành Outdated; build theo văn bản | `__mocks__/manuscript-mock.spec.ts` (8) |

## 3. Quyết định kỹ thuật trong phạm vi

- CodeMirror 6 khai trong `apps/web/package.json` (H22): `@codemirror/commands`, `language`, `legacy-modes` (chế độ `stex`), `state`, `view`, `@lezer/highlight`, phiên bản cố định. Không dùng `@codemirror/autocomplete`: danh sách gợi ý citation do React vẽ để có trạng thái trống kèm liên kết (EC29) và test được bằng role `listbox`/`option`.
- Hộp Change Proposal là block widget của CodeMirror có DOM cố định theo khóa, React vẽ vào bằng portal. Hộp thoại của hộp proposal portal ra `document.body`.
- Client JSON của shell không đọc text/PDF/zip và không gửi multipart. Khu vực dùng `rawGet` (`api.url` + `fetch`) cho nội dung file, log, PDF, export; `uploadFile` gửi multipart dựng từ bytes kèm `X-CSRF-Token` của phiên.
- Xem PDF bằng trình xem có sẵn của trình duyệt trong iframe (`#page=N`), không thêm pdf.js; số trang đọc từ các object `/Type /Page` của file PDF. Bỏ thanh công cụ của trình xem (`toolbar=0`) làm trình xem nhúng không vẽ trang trên preview, nên giữ thanh công cụ.
- Tải lên file văn bản commit `add` kèm `content`, không qua uploadFile (hợp đồng: `content` cho văn bản, `fileUploadId` cho file nhị phân); scope EC13 ghi “uploadFile rồi commit” cho cả `.tex`, khác ở điểm này.
- Liên kết claim dùng route thật của app `/projects/{projectId}/evidence/claims/{claimId}`; hồ sơ ghi `/projects/{projectId}/claims/{claimId}` (ghi ở mục Phải sửa ở nguồn của report).
- Câu giải thích của issue build dựng từ `BuildIssue.params` theo ngôn ngữ giao diện (hợp đồng 27/11/2026); `friendlyMessage` viết theo ngôn ngữ của tài khoản lúc build nên chỉ là gợi ý.
- Thư mục slice build đặt tên `builds/` vì `.gitignore` bỏ qua mọi thư mục `build/`.
- Proposal vừa được chấp nhận, từ chối hoặc mở qua deep link vẫn giữ hộp và hiện trạng thái mới trong phiên làm việc (`proposals/session.ts`), đặt lại khi màn mount.
- Thiếu `matchMedia` (test) thì bố cục là desktop. Test điện thoại, tablet giả độ rộng bằng `viewport()` của `__mocks__/render.tsx`; helper này cũng bù `Range.getClientRects` cho jsdom.
- Route của khu vực nạp `ManuscriptScreen` bằng `React.lazy` (chunk riêng, có CodeMirror), nên bundle đầu của app không mang editor; test nạp sẵn màn trong `__mocks__/render.tsx`.
- Khu vực không sửa file của shell hay khu vực khác (1.4.9).

---

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
