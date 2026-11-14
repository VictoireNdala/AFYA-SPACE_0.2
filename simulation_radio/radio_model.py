"""
Radio channel model (no MQTT here: just the computation).

This module decides what happens to each frame during its trip:
  - OUTAGE    : the link is down, the frame is lost;
  - LOST      : the frame disappears (weak signal, interference...);
  - CORRUPTED : the frame arrives, but some bytes were altered by noise;
  - DELIVERED : the frame arrives intact.
In the last two cases the frame arrives after some delay.
"""

import random

DELIVERED = "DELIVERED"
CORRUPTED = "CORRUPTED"
LOST = "LOST"
OUTAGE = "OUTAGE"


class RadioChannel:
    def __init__(
        self,
        distance_km,
        speed_km_s,
        processing_delay_s,
        jitter_s,
        loss_probability,
        corruption_probability,
        visibility_duration_s,
        outage_duration_s,
        start_time=0.0,
        rng=None,
    ):
        self.distance_km = distance_km
        self.speed_km_s = speed_km_s
        self.processing_delay_s = processing_delay_s
        self.jitter_s = jitter_s
        self.loss_probability = loss_probability
        self.corruption_probability = corruption_probability
        self.visibility_duration_s = visibility_duration_s
        self.outage_duration_s = outage_duration_s
        self.start_time = start_time
        # random generator (a seeded one can be passed in for tests)
        self.rng = rng or random.Random()
        # counters for the statistics
        self.stats = {"received": 0, DELIVERED: 0, CORRUPTED: 0, LOST: 0, OUTAGE: 0}

    def propagation_delay(self):
        """Travel time of the radio wave: distance / speed of light."""
        return self.distance_km / self.speed_km_s

    def in_outage(self, now):
        """True if the radio link is down at this instant."""
        if self.outage_duration_s <= 0:
            return False
        cycle = self.visibility_duration_s + self.outage_duration_s
        position = (now - self.start_time) % cycle
        return position >= self.visibility_duration_s

    def _draw_delay(self):
        """Total delay = propagation + processing + small random variation."""
        jitter = self.rng.uniform(-self.jitter_s, self.jitter_s)
        return max(0.0, self.propagation_delay() + self.processing_delay_s + jitter)

    def _corrupt(self, raw):
        """Simulate radio noise: alter 1 to 3 random bytes."""
        damaged = bytearray(raw)
        if not damaged:
            return bytes(damaged)
        count = min(len(damaged), self.rng.randint(1, 3))
        # all positions are different, so two errors cannot cancel each other
        for position in self.rng.sample(range(len(damaged)), count):
            # flip one bit of the chosen byte: it is guaranteed to change
            damaged[position] ^= 1 << self.rng.randrange(8)
        return bytes(damaged)

    def process(self, raw, now):
        """
        Send a frame through the channel.

        Returns (verdict, bytes_to_deliver, delay_in_seconds).
        If the frame does not arrive, bytes_to_deliver is None.
        """
        self.stats["received"] += 1

        if self.in_outage(now):
            verdict, output, delay = OUTAGE, None, 0.0
        elif self.rng.random() < self.loss_probability:
            verdict, output, delay = LOST, None, 0.0
        elif self.rng.random() < self.corruption_probability:
            verdict, output, delay = CORRUPTED, self._corrupt(raw), self._draw_delay()
        else:
            verdict, output, delay = DELIVERED, raw, self._draw_delay()

        self.stats[verdict] += 1
        return verdict, output, delay
