# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only. See LICENSES.md.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0

variable "name" {
  description = "Tên logic của cụm PostgreSQL."
  type        = string
}

variable "service_extensions" {
  description = "Danh sách service cần database và các extension riêng ngoài 00-common.sql."
  type        = map(set(string))
  default = {
    agent-core    = []
    audit         = []
    gateway       = []
    identity      = []
    knowledge     = ["vector"]
    library       = []
    manuscript    = []
    orchestration = []
    planning      = []
    research      = []
    workspace     = []
  }

  validation {
    condition     = length(var.service_extensions) > 0 && alltrue([for service in keys(var.service_extensions) : can(regex("^[a-z][a-z0-9]*(-[a-z0-9]+)*$", service)) && length(service) <= 57])
    error_message = "Cần ít nhất một service. Tên service phải dùng chữ thường, số và gạch ngang, dài tối đa 57 ký tự."
  }
}
