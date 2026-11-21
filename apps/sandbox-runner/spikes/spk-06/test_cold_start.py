# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Checks that the cold-start harness keeps the spike limits and computes its statistics as documented."""
import unittest
from pathlib import Path

from cold_start import BOOT, READY, ClockWatch, container_body, order, pod_manifest, realtime, summarize
from spike import DISK, MEMORY


class ColdStartTests(unittest.TestCase):
    def test_summary_uses_nearest_rank_p95_and_ignores_missing(self):
        values = [float(value) for value in range(1, 21)] + [None]
        self.assertEqual(summarize(values), dict(n=20, min=1.0, median=10.5, p95=19.0, max=20.0))
        self.assertIsNone(summarize([None]))

    def test_runtime_order_alternates_between_rounds(self):
        self.assertEqual(order(0, ['runc', 'runsc']), ['runc', 'runsc'])
        self.assertEqual(order(1, ['runc', 'runsc']), ['runsc', 'runc'])

    def test_cri_timestamp_keeps_microseconds(self):
        self.assertAlmostEqual(realtime('2026-11-21T10:42:35.167919517Z') % 60, 35.167919, places=5)

    def test_realtime_clock_step_discards_the_case(self):
        for offsets, stepped in (([100.0, 100.001, 100.002], False), ([100.0, 100.001, 97.0], True)):
            clock, row = ClockWatch(), {}
            clock.offsets = offsets
            clock.record(row)
            self.assertIs(row['clock_step'], stepped)

    def test_ready_marker_is_printed_before_worker_runs(self):
        self.assertLess(BOOT.index(READY), BOOT.index('worker.py'))

    def test_container_keeps_spike_isolation_and_limits(self):
        host = container_body('image', 'runsc', Path('/input'))['HostConfig']
        self.assertEqual((host['NetworkMode'], host['ReadonlyRootfs'], host['CapDrop']), ('none', True, ['ALL']))
        self.assertEqual((host['Memory'], host['MemorySwap'], host['NanoCpus'], host['PidsLimit']),
                         (MEMORY, MEMORY, 2 * 10**9, 256))
        self.assertIn(f'size={DISK},uid=65532', host['Tmpfs']['/work'])

    def test_pod_runs_worker_non_root_and_only_gvisor_sets_runtime_class(self):
        pod = pod_manifest('name', 'gvisor', 'image')['spec']
        worker, init = pod['containers'][0], pod['initContainers'][0]
        self.assertEqual(pod['runtimeClassName'], 'gvisor')
        self.assertNotIn('runtimeClassName', pod_manifest('name', 'runc', 'image')['spec'])
        self.assertTrue(worker['securityContext']['runAsNonRoot'])
        self.assertEqual(worker['securityContext']['capabilities'], dict(drop=['ALL']))
        self.assertEqual(init['securityContext']['capabilities'], dict(drop=['ALL'], add=['CHOWN']))
        self.assertEqual(worker['resources']['limits'], dict(cpu='2', memory=str(MEMORY)))
        self.assertFalse(pod['automountServiceAccountToken'])


if __name__ == '__main__':
    unittest.main()
