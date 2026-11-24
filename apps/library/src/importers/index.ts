// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Phần công khai của module importers (PID-00024 S03–S07) cho mã khác trong library (PID-00076 API nhập, PID-00050
// nguồn). Mã nghiệp vụ dùng ReferenceImporter và các kiểu; chỉ nơi ghép (ImportersModule) chọn bản hiện thực parser.

export { ImportersModule } from './importers.module';
export {
  authorName,
  doiUrl,
  normalizeDoi,
  normalizeUrl,
  publicationTypeOf,
  type PublicationType,
  type ReferenceMetadata,
  toReferenceMetadata,
} from './normalize';
export {
  type ImportedReference,
  type ReferenceImportErrorCode,
  ReferenceImporter,
  type ReferenceImportResult,
  type RejectedReference,
  type RequiredField,
} from './reference-importer';
export {
  type ParsedEntry,
  type ParsedName,
  type ParsedRecord,
  type ParseErrorCode,
  type ParseFailure,
  REFERENCE_FORMATS,
  type ReferenceFormat,
  type ReferenceParser,
} from './reference-parser';
