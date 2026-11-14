"""
GROUND STATION (receiver).

Receives the frames that made it through the radio channel, checks that they
are intact (CRC), displays the readings and keeps link statistics:
valid frames, corrupted frames, lost frames, average latency.

Run:  python ground_station.py
"""

import json
import time

import config
from frame import parse_frame
from mqtt_client import close_client, create_client

NAME = "GROUND"

# Statistics for the current session
stats = {
    "session": None,    # id of the transmission session being tracked
    "first_seq": None,  # number of the first frame received
    "last_seq": 0,      # highest frame number received
    "valid": 0,
    "corrupted": 0,
    "latency_sum": 0.0,
}
link_state = {"value": None}


def reset(session):
    stats.update(
        session=session, first_seq=None, last_seq=0,
        valid=0, corrupted=0, latency_sum=0.0,
    )


def summary():
    """Compute the link summary from the counters."""
    if stats["first_seq"] is None:
        expected = 0
    else:
        expected = stats["last_seq"] - stats["first_seq"] + 1
    # Frames that never arrived = expected - valid - corrupted
    lost = max(0, expected - stats["valid"] - stats["corrupted"])
    success_rate = (stats["valid"] / expected * 100) if expected else 0.0
    latency = (stats["latency_sum"] / stats["valid"]) if stats["valid"] else 0.0
    return {
        "expected": expected,
        "valid": stats["valid"],
        "corrupted": stats["corrupted"],
        "lost": lost,
        "success_rate_pct": success_rate,
        "average_latency_s": latency,
    }


def print_summary():
    s = summary()
    print(
        f"[{NAME}] --- Summary: {s['valid']}/{s['expected']} valid frames "
        f"({s['success_rate_pct']:.0f} %) | corrupted: {s['corrupted']} | "
        f"lost: {s['lost']} | average latency: {s['average_latency_s']:.2f} s ---",
        flush=True,
    )


def handle_frame(raw):
    """Called for every frame that arrived over the radio."""
    frame = parse_frame(raw)

    if frame is None:
        stats["corrupted"] += 1
        print(f"[{NAME}] [ERROR] Corrupted frame rejected (invalid CRC)", flush=True)
        return

    # New session = the space station restarted: start over.
    if frame["session"] != stats["session"]:
        reset(frame["session"])

    latency = time.time() - frame["timestamp"]
    seq = frame["seq"]
    if stats["first_seq"] is None or seq < stats["first_seq"]:
        stats["first_seq"] = seq
    stats["last_seq"] = max(stats["last_seq"], seq)
    stats["valid"] += 1
    stats["latency_sum"] += latency

    d = frame["data"]
    print(
        f"[{NAME}] [OK] Frame #{seq} {d.get('astronaut', '?')} | "
        f"heart {d.get('heart_rate_bpm', '?')} bpm | "
        f"stress {d.get('stress_level', '?')}/10 | "
        f"mood {d.get('mood', '?')}/10 | "
        f"eye {d.get('intraocular_pressure_mmhg', '?')} mmHg | "
        f"latency {latency:.2f} s",
        flush=True,
    )

    if stats["valid"] % 10 == 0:
        print_summary()


def handle_status(raw):
    """Called when the channel publishes the link status."""
    try:
        link = json.loads(raw.decode("utf-8")).get("link")
    except (ValueError, AttributeError):
        return
    if link != link_state["value"]:
        link_state["value"] = link
        if link == "DOWN":
            print(f"[{NAME}] !!! Radio link down: waiting for signal...", flush=True)
        else:
            print(f"[{NAME}] Radio link up", flush=True)


def on_message(topic, raw):
    if topic == config.TOPIC_RX:
        handle_frame(raw)
    elif topic == config.TOPIC_STATUS:
        handle_status(raw)


def main():
    client = create_client(
        NAME, topics=[config.TOPIC_RX, config.TOPIC_STATUS], on_message=on_message
    )
    print(f"[{NAME}] Listening on topic: {config.TOPIC_RX}", flush=True)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print()
        print_summary()
    finally:
        close_client(client)


if __name__ == "__main__":
    main()
