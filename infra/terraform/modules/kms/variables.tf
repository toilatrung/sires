# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only. See LICENSES.md.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0

variable "key_names" {
  description = "Tên logic của các khóa được KMS quản lý."
  type        = set(string)
}
