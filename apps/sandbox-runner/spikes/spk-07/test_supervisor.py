#!/usr/bin/env python3
# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
"""Run inside the spike image: actual subprocesses, no Docker mocks."""

import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, "/opt/spk-07")
from worker import phase  # noqa: E402


class SupervisorTest(unittest.TestCase):
    def test_ec02_deadline_kills_descendants(self):
        marker = Path("/work/descendant-survived")
        marker.unlink(missing_ok=True)
        child = (
            "import time;from pathlib import Path;time.sleep(0.6);Path('/work/descendant-survived').write_text('bad')"
        )
        parent = f'import subprocess,time;subprocess.Popen(["python3","-c",{child!r}]);time.sleep(10)'
        result = phase("deadline-test", ["python3", "-c", parent], 0.2)
        self.assertTrue(result["timeout"])
        time.sleep(0.8)
        self.assertFalse(marker.exists(), "child process escaped deadline cleanup")

    def test_ac03_nonzero_exit_retains_diagnostic(self):
        result = phase("error-test", ["python3", "-c", "import sys;sys.stderr.write('real failure');sys.exit(7)"], 10)
        self.assertEqual(result["exitCode"], 7)
        self.assertFalse(result["timeout"])
        self.assertIn("real failure", Path("/work/error-test.stderr").read_text())

    def test_ac01_success_has_rss_measurement(self):
        result = phase("success-test", ["python3", "-c", "a=bytearray(1024*1024)"], 10)
        self.assertEqual(result["exitCode"], 0)
        self.assertIn("Maximum resident set size", Path("/work/success-test.time").read_text())


if __name__ == "__main__":
    unittest.main()
