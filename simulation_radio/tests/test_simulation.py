"""
Automated tests (no broker or Internet needed).

Run from the simulation_radio folder:
    python -m unittest discover -s tests -v
"""

import os
import random
import sys
import unittest

# Allow importing modules from the parent folder (frame.py, radio_model.py)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from frame import build_frame, parse_frame  # noqa: E402
from radio_model import CORRUPTED, DELIVERED, LOST, OUTAGE, RadioChannel  # noqa: E402


def make_channel(**settings):
    """'Perfect' channel by default; each test only changes what it studies."""
    params = dict(
        distance_km=400.0,
        speed_km_s=299_792.458,
        processing_delay_s=0.5,
        jitter_s=0.0,
        loss_probability=0.0,
        corruption_probability=0.0,
        visibility_duration_s=40.0,
        outage_duration_s=0.0,
        start_time=0.0,
        rng=random.Random(42),   # seeded randomness: reproducible results
    )
    params.update(settings)
    return RadioChannel(**params)


FRAME = build_frame(1, 7, 1000.5, {"astronaut": "AST-01", "heart_rate_bpm": 70})


class TestFrame(unittest.TestCase):
    def test_round_trip(self):
        frame = parse_frame(FRAME)
        self.assertEqual(frame["seq"], 7)
        self.assertEqual(frame["timestamp"], 1000.5)
        self.assertEqual(frame["data"]["astronaut"], "AST-01")

    def test_modified_value_detected(self):
        self.assertIsNone(parse_frame(FRAME.replace(b"70", b"90")))

    def test_unreadable_content(self):
        self.assertIsNone(parse_frame(b"\xff\xfe not json"))
        self.assertIsNone(parse_frame(b"[1, 2, 3]"))
        self.assertIsNone(parse_frame(b"{}"))


class TestRadioChannel(unittest.TestCase):
    def test_propagation_delay(self):
        self.assertAlmostEqual(make_channel().propagation_delay(), 400 / 299_792.458)
        moon = make_channel(distance_km=384_400.0)
        self.assertAlmostEqual(moon.propagation_delay(), 1.282, places=3)

    def test_perfect_channel(self):
        channel = make_channel()
        verdict, output, delay = channel.process(FRAME, 5.0)
        self.assertEqual(verdict, DELIVERED)
        self.assertEqual(output, FRAME)
        self.assertAlmostEqual(delay, 0.5 + channel.propagation_delay())

    def test_jitter_within_bounds(self):
        channel = make_channel(jitter_s=0.2)
        base = 0.5 + channel.propagation_delay()
        for _ in range(500):
            _, _, delay = channel.process(FRAME, 5.0)
            self.assertTrue(base - 0.2 <= delay <= base + 0.2)

    def test_total_loss(self):
        verdict, output, _ = make_channel(loss_probability=1.0).process(FRAME, 5.0)
        self.assertEqual(verdict, LOST)
        self.assertIsNone(output)

    def test_corruption_always_detected(self):
        channel = make_channel(corruption_probability=1.0)
        for _ in range(2000):
            verdict, output, _ = channel.process(FRAME, 5.0)
            self.assertEqual(verdict, CORRUPTED)
            self.assertNotEqual(output, FRAME)
            self.assertIsNone(parse_frame(output))

    def test_periodic_outages(self):
        channel = make_channel(visibility_duration_s=40.0, outage_duration_s=10.0)
        self.assertFalse(channel.in_outage(0.0))
        self.assertFalse(channel.in_outage(39.9))
        self.assertTrue(channel.in_outage(40.0))
        self.assertTrue(channel.in_outage(49.9))
        self.assertFalse(channel.in_outage(50.0))   # new cycle
        self.assertTrue(channel.in_outage(95.0))
        verdict, output, _ = channel.process(FRAME, 45.0)
        self.assertEqual(verdict, OUTAGE)
        self.assertIsNone(output)

    def test_loss_rate_and_stats(self):
        channel = make_channel(loss_probability=0.10, corruption_probability=0.05)
        total = 20_000
        for _ in range(total):
            channel.process(FRAME, 5.0)
        s = channel.stats
        self.assertEqual(s["received"], total)
        self.assertEqual(s[DELIVERED] + s[CORRUPTED] + s[LOST] + s[OUTAGE], total)
        self.assertAlmostEqual(s[LOST] / total, 0.10, delta=0.01)
        # 5 % of the non-lost frames are corrupted -> 0.90 x 0.05 = 4.5 %
        self.assertAlmostEqual(s[CORRUPTED] / total, 0.045, delta=0.01)


if __name__ == "__main__":
    unittest.main()
