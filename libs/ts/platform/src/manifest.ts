// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

/** Static description of a service, declared once in apps/<service>/src/manifest.ts. */
export interface ServiceManifest {
  /** Service name; equals the apps/<service> folder name. */
  name: string;
  /** Default local port; the PORT environment variable overrides it. */
  port: number;
  /** Database owned by the service (sires_<service>); absent when the service has none. */
  database?: string;
}
