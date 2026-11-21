# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only. See LICENSES.md.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0

variable "name" {
  description = "Tên logic của cụm RabbitMQ."
  type        = string
}

variable "node_count" {
  description = "Số node RabbitMQ mong muốn."
  type        = number
  default     = 3

  validation {
    condition     = var.node_count >= 1 && floor(var.node_count) == var.node_count
    error_message = "node_count phải là số nguyên dương."
  }
}
