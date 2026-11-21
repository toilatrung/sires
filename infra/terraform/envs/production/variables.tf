# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only. See LICENSES.md.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0

variable "name_prefix" {
  description = "Tiền tố logic phân biệt cấu hình theo môi trường."
  type        = string
}

variable "kubernetes_version" {
  description = "Phiên bản Kubernetes yêu cầu, nếu đã chốt."
  type        = string
  default     = null
}

variable "bucket_names" {
  description = "Tên logic của các bucket cho môi trường."
  type        = set(string)
}

variable "key_names" {
  description = "Tên logic của các khóa KMS cho môi trường."
  type        = set(string)
}

variable "secret_names" {
  description = "Tên tham chiếu secret. Không truyền giá trị của secret."
  type        = set(string)
}
