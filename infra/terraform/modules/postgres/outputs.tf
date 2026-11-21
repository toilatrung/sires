# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only. See LICENSES.md.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0

output "cluster_name" {
  description = "Tên logic của cụm PostgreSQL."
  value       = var.name
}

output "databases" {
  description = "Tên database và extension yêu cầu cho từng service theo DDL."
  value = {
    for service, extra_extensions in var.service_extensions : service => {
      name       = "sires_${replace(service, "-", "_")}"
      extensions = setunion(toset(["pgcrypto", "unaccent", "pg_trgm"]), extra_extensions)
    }
  }
}
