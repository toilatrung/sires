# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc

# Snapshot fixes the package set, including TeX Live 2022 (no tlmgr at runtime).
RUN rm -f /etc/apt/sources.list.d/debian.sources \
    && printf 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20261119T000000Z bookworm main\ndeb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/20261119T000000Z bookworm-security main\n' > /etc/apt/sources.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       texlive-latex-base texlive-latex-recommended texlive-latex-extra \
       texlive-xetex texlive-lang-other texlive-science texlive-pictures \
       latexmk lmodern fonts-dejavu-core python3 time \
    && mkdir -p /opt/spk-06 /input /work \
    && dpkg-query -W > /opt/spk-06/packages.tsv \
    && rm -rf /var/lib/apt/lists/* /tmp \
    && ln -s /work/tmp /tmp

# gVisor needs a real /tmp mountpoint. Host mounts it read-only; TMPDIR is /work/tmp.
RUN rm /tmp && mkdir -m 1777 /tmp
COPY worker.py /opt/spk-06/worker.py
ENV HOME=/work TEXMFVAR=/work/texmf-var TEXMFCONFIG=/work/texmf-config \
    TMPDIR=/work/tmp openin_any=p openout_any=p shell_escape=f \
    MKTEXPK=0 MKTEXTFM=0 MKTEXFMT=0
USER 65532:65532
WORKDIR /work
ENTRYPOINT ["python3", "/opt/spk-06/worker.py"]
