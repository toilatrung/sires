# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only. See LICENSES.md.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0

terraform {
  required_version = ">= 1.6, < 2.0"
}

module "kubernetes" {
  source          = "../../modules/kubernetes"
  name            = "${var.name_prefix}-kubernetes"
  cluster_version = var.kubernetes_version
}

module "postgres" {
  source = "../../modules/postgres"
  name   = "${var.name_prefix}-postgres"
}

module "rabbitmq" {
  source = "../../modules/rabbitmq"
  name   = "${var.name_prefix}-rabbitmq"
}

module "object_storage" {
  source       = "../../modules/object-storage"
  bucket_names = var.bucket_names
}

module "kms" {
  source    = "../../modules/kms"
  key_names = var.key_names
}

module "secret_manager" {
  source       = "../../modules/secret-manager"
  secret_names = var.secret_names
}

output "requested_configuration" {
  description = "Giao diện cấu hình dùng chung cho các module của môi trường."
  value = {
    kubernetes = module.kubernetes.cluster
    postgres = {
      name      = module.postgres.cluster_name
      databases = module.postgres.databases
    }
    rabbitmq     = module.rabbitmq.broker
    bucket_names = module.object_storage.bucket_names
    key_names    = module.kms.key_names
    secret_names = module.secret_manager.secret_names
  }
}
