# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
"""Checks that broken runtime/compile/probe failures cannot become passing attacks."""
import unittest

from spike import classify, verdict


class EvidenceTests(unittest.TestCase):
    def test_ac01_runtime_failure_is_not_shell_isolation(self):
        self.assertFalse(verdict('shell', {'status': 'runtime_error', 'result': None}))

    def test_ac01_unrelated_compile_failure_is_not_file_denial(self):
        self.assertFalse(verdict('passwd', {'status': 'compile_error', 'result': {'passwd_denied': False}}))

    def test_ac01_shell_marker_is_failure_even_with_pdf(self):
        self.assertFalse(verdict('shell', {'status': 'success', 'result': {'shell_marker': True}}))

    def test_ac02_exit_137_alone_is_not_memory_limit(self):
        self.assertEqual(classify(False, False, None), 'runtime_error')
        self.assertFalse(verdict('memory-probe', {'status': 'memory_limit', 'oom_killed': False}))

    def test_ac02_oom_and_capacity_have_explicit_mapping(self):
        self.assertEqual(classify(False, True, None), 'memory_limit')
        self.assertEqual(classify(False, False, {'capacity_exceeded': True}), 'memory_limit')
        self.assertEqual(classify(False, False, {'exit_code': 12}), 'compile_error')

    def test_ac02_infinite_loop_requires_deadline(self):
        self.assertFalse(verdict('loop', {'status': 'compile_error'}))
        self.assertTrue(verdict('loop', {'status': classify(True, False, None)}))

    def test_ac03_success_requires_pdf_artifact(self):
        self.assertFalse(verdict('thesis', {'status': 'success', 'result': {'pdf_created': False}}))
        self.assertTrue(verdict('article', {'status': 'success', 'result': {'pdf_created': True}}))

    def test_ac03_default_and_thesis_require_real_bibtex_and_natbib(self):
        for scenario in ('default', 'thesis'):
            evidence = dict(pdf_created=True, bibtex_ran=True, bibliography_created=True, natbib_loaded=True)
            self.assertTrue(verdict(scenario, {'status': 'success', 'result': evidence}))
            for key in ('bibtex_ran', 'bibliography_created', 'natbib_loaded'):
                incomplete = dict(evidence, **{key: False})
                self.assertFalse(verdict(scenario, {'status': 'success', 'result': incomplete}))

    def test_network_probe_requires_socket_evidence(self):
        self.assertFalse(verdict('network-probe', {'status': 'success', 'result': {'network_blocked': False}}))


if __name__ == '__main__':
    unittest.main()
