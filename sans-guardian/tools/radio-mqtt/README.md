# MQTT radio simulation — SANS Guardian

Simulation of the radio link between a space station and Earth, written in
Python with the MQTT protocol. The astronauts' (simulated) health readings are
sent "over the radio"; the channel adds the impairments of a real link:
delay, packet loss, noise and signal outages.

```
  space_station.py          radio_channel.py           ground_station.py
   (transmitter)       (delay, loss, noise, outages)       (receiver)
        │                        │                          │
        └──── .../radio/tx ──────┴────── .../radio/rx ──────┘
                          (MQTT broker)
```

| File | Role |
|---|---|
| `config.py` | All settings (broker, topics, distance, loss, outages) |
| `space_station.py` | Generates readings and sends one frame per astronaut |
| `radio_channel.py` | Relays frames while applying the radio model |
| `ground_station.py` | Receives, checks (CRC), displays and computes statistics |
| `radio_model.py` | Channel computation (delay, loss, noise, outages), no MQTT |
| `frame.py` | Frame format + CRC32 checksum |
| `mqtt_client.py` | Broker connection helper (paho-mqtt 2.x) |
| `run_simulation.py` | Starts all three programs in a single terminal |
| `tests/` | Automated tests (no broker needed) |

## Installation

Requires Python 3.8 or newer, then:

```bash
cd simulation_radio
python3 -m pip install -r requirements.txt
```

## Running the simulation

The easiest way (one terminal, `Ctrl+C` to stop):

```bash
python3 run_simulation.py
```

Or in three separate terminals, to see each role clearly:

```bash
python3 ground_station.py   # terminal 1
python3 radio_channel.py    # terminal 2
python3 space_station.py    # terminal 3
```

Sample output:

```
[STATION] Frame #9 sent (AST-03)
[CHANNEL] Frame #9 LOST
[CHANNEL] Frame #10 delivered (delay 0.612 s)
[GROUND] [OK] Frame #10 AST-01 | heart 67 bpm | stress 2/10 | mood 9/10 | eye 15.0 mmHg | latency 0.63 s
[CHANNEL] *** SIGNAL LOST (station out of range) ***
[GROUND] !!! Radio link down: waiting for signal...
[GROUND] --- Summary: 10/13 valid frames (77 %) | corrupted: 0 | lost: 3 | average latency: 0.61 s ---
```

## Settings (`config.py`)

- `PREFIX`: set it to your team's name. The default broker
  (`broker.emqx.io`) is public: anyone can read these topics, so only send
  simulated data.
- `DISTANCE_KM`: 400 for the ISS, 384,400 for the Moon (the propagation delay
  is computed from the speed of light).
- `LOSS_PROBABILITY`, `CORRUPTION_PROBABILITY`: share of lost / damaged frames.
- `VISIBILITY_DURATION_S`, `OUTAGE_DURATION_S`: signal / no-signal cycle
  (`OUTAGE_DURATION_S = 0` disables outages).
- For a local broker (Mosquitto): `BROKER_HOST = "localhost"`.

## How it works

1. The space station packs each reading into a JSON **frame**: frame number,
   send time, data, and a **CRC32** (fingerprint of the content).
2. The radio channel decides the fate of each frame: delivered, damaged (a few
   flipped bits), lost, or blocked during an outage. Frames that get through
   are delivered after a delay = propagation + processing ± jitter.
3. The ground station recomputes the CRC: if it does not match, the frame is
   rejected. Frame numbers are used to count lost frames, and the send time to
   measure latency.

The readings in `space_station.py` (function `read_sensors`) are made up:
that is the place to plug in the data defined by the team.

## Tests

```bash
python3 -m unittest discover -s tests -v
```
