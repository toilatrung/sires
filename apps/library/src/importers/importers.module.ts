// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Module con `importers` của library (tickets 1.6; PID-00024 S03–S07): parser BibTeX, RIS dùng cho nhập tay và kết
// quả nguồn (kiến trúc 8.7). Đây là nơi ghép duy nhất chọn bản hiện thực parser (Citation.js, tạm thời theo PC-04 A10);
// module khác inject ReferenceImporter. API nhập reference dùng parser thuộc PID-00076 (N1).

import { Module } from '@nestjs/common';
import { citationJsParsers } from './citation-js/citation-js.parsers';
import { ReferenceImporter } from './reference-importer';

@Module({
  providers: [{ provide: ReferenceImporter, useFactory: () => new ReferenceImporter(citationJsParsers()) }],
  exports: [ReferenceImporter],
})
export class ImportersModule {}
