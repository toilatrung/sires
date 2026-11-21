# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only. See LICENSES.md.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0

output "broker" {
  description = "Cấu hình đích của cụm RabbitMQ."
  value = {
    name       = var.name
    node_count = var.node_count
  }
}
