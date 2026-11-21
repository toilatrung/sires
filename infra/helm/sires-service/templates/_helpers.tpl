{{/* SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md */}}
{{- define "sires-service.podSecurity" -}}
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  seccompProfile:
    type: RuntimeDefault
{{- end }}

{{- define "sires-service.containerConfig" -}}
securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop: [ALL]
resources:
  {{- toYaml .resources | nindent 2 }}
{{- with .secretName }}
envFrom:
  - secretRef:
      name: {{ . | quote }}
{{- end }}
{{- end }}
