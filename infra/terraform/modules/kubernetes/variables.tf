# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only. See LICENSES.md.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0

variable "name" {
  description = "Tên logic của cụm Kubernetes."
  type        = string
}

variable "cluster_version" {
  description = "Phiên bản Kubernetes yêu cầu, nếu môi trường đã chốt."
  type        = string
  default     = null
}
