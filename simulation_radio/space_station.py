"""
SPACE STATION (transmitter).

Simulates the astronauts' health sensors and sends the readings over the radio:
each reading is packed into a frame and published on the TX topic.

Run:  python space_station.py
"""

import random
import time

import config
from frame import build_frame
from mqtt_client import close_client, create_client

NAME = "STATION"


def read_sensors(astronaut):
    """
    Produce simulated readings for one astronaut.
    (Made-up values: replace them with the data defined in the team's guide.)
    """
    return {
        "astronaut": astronaut,
        # --- general health ---
        "heart_rate_bpm": round(random.gauss(68, 6)),
        "oxygen_saturation_pct": round(min(100.0, random.gauss(97.5, 0.8)), 1),
        # --- mental health ---
        "stress_level": max(1, min(10, round(random.gauss(4, 1.5)))),   # 1 (calm) to 10
        "mood": max(1, min(10, round(random.gauss(7, 1.2)))),           # 1 to 10
        "sleep_hours": round(max(0.0, random.gauss(6.5, 0.8)), 1),
        # --- visual health ---
        "visual_acuity": round(max(0.1, min(1.0, random.gauss(0.9, 0.05))), 2),  # 1.0 = 20/20
        "intraocular_pressure_mmhg": round(random.gauss(15, 2), 1),
    }


def main():
    client = create_client(NAME)
    session = int(time.time())   # identifies this start-up of the station
    seq = 0                      # frame number

    print(f"[{NAME}] Transmitting on topic: {config.TOPIC_TX}", flush=True)
    try:
        while True:
            for astronaut in config.ASTRONAUTS:
                seq += 1
                frame = build_frame(session, seq, time.time(), read_sensors(astronaut))
                client.publish(config.TOPIC_TX, frame, qos=config.QOS)
                print(f"[{NAME}] Frame #{seq} sent ({astronaut})", flush=True)
            time.sleep(config.SEND_INTERVAL_S)
    except KeyboardInterrupt:
        print(f"\n[{NAME}] Stopped. {seq} frames sent.")
    finally:
        close_client(client)


if __name__ == "__main__":
    main()
