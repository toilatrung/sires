# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only. See LICENSES.md.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0

variable "bucket_names" {
  description = "Tên các bucket logic cần cấp phát."
  type        = set(string)
}
