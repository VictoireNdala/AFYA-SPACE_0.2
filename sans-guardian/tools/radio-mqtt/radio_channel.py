"""
RADIO CHANNEL (the link between space and Earth).

Listens to the frames sent by the space station, applies the impairments of a
real radio link (delay, loss, noise, outages), then republishes whatever
"arrives" on the RX topic, which the ground station listens to.

Run:  python radio_channel.py
"""

import json
import threading
import time

import config
from frame import parse_frame
from mqtt_client import close_client, create_client
from radio_model import CORRUPTED, DELIVERED, LOST, OUTAGE, RadioChannel

NAME = "CHANNEL"

channel = RadioChannel(
    distance_km=config.DISTANCE_KM,
    speed_km_s=config.SPEED_OF_LIGHT_KM_S,
    processing_delay_s=config.PROCESSING_DELAY_S,
    jitter_s=config.JITTER_S,
    loss_probability=config.LOSS_PROBABILITY,
    corruption_probability=config.CORRUPTION_PROBABILITY,
    visibility_duration_s=config.VISIBILITY_DURATION_S,
    outage_duration_s=config.OUTAGE_DURATION_S,
    start_time=time.time(),
)
client = None


def on_message(topic, raw):
    """Called for every frame sent by the space station."""
    frame = parse_frame(raw)
    label = f"#{frame['seq']}" if frame else "#?"

    verdict, output, delay = channel.process(raw, time.time())

    if verdict in (DELIVERED, CORRUPTED):
        # The frame will reach the ground after "delay" seconds.
        timer = threading.Timer(
            delay, client.publish, args=(config.TOPIC_RX, output, config.QOS)
        )
        timer.daemon = True
        timer.start()

    if verdict == DELIVERED:
        print(f"[{NAME}] Frame {label} delivered (delay {delay:.3f} s)", flush=True)
    elif verdict == CORRUPTED:
        print(f"[{NAME}] Frame {label} damaged by noise (delay {delay:.3f} s)", flush=True)
    elif verdict == LOST:
        print(f"[{NAME}] Frame {label} LOST", flush=True)
    elif verdict == OUTAGE:
        print(f"[{NAME}] Frame {label} lost: no signal", flush=True)


def publish_status(outage):
    """Publish the link status (kept by the broker thanks to retain=True)."""
    status = {
        "link": "DOWN" if outage else "UP",
        "timestamp": time.time(),
        "stats": channel.stats,
    }
    client.publish(config.TOPIC_STATUS, json.dumps(status), qos=config.QOS, retain=True)


def main():
    global client
    client = create_client(NAME, topics=[config.TOPIC_TX], on_message=on_message)

    print(
        f"[{NAME}] Distance {config.DISTANCE_KM:.0f} km -> "
        f"propagation {channel.propagation_delay() * 1000:.2f} ms | "
        f"loss {config.LOSS_PROBABILITY:.0%} | noise {config.CORRUPTION_PROBABILITY:.0%}",
        flush=True,
    )

    previous = None
    last_sent = 0.0
    try:
        while True:
            now = time.time()
            outage = channel.in_outage(now)

            if outage != previous:
                if outage:
                    print(f"[{NAME}] *** SIGNAL LOST (station out of range) ***", flush=True)
                elif previous is not None:
                    print(f"[{NAME}] *** SIGNAL RESTORED ***", flush=True)

            # Publish the status on every change, and at least every 5 seconds.
            if outage != previous or now - last_sent >= 5:
                publish_status(outage)
                last_sent = now
            previous = outage
            time.sleep(0.5)
    except KeyboardInterrupt:
        s = channel.stats
        print(
            f"\n[{NAME}] Stopped. Received: {s['received']} | delivered: {s[DELIVERED]} | "
            f"damaged: {s[CORRUPTED]} | lost: {s[LOST]} | outage: {s[OUTAGE]}"
        )
    finally:
        close_client(client)


if __name__ == "__main__":
    main()
