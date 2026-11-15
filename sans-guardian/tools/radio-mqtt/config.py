"""
Shared configuration for the radio simulation (SANS Guardian project).

Every setting lives here: to change how the simulation behaves,
edit this file and restart the programs.
"""

# --------------------------------------------------------------------------
# 1) MQTT broker (the "post office" every message goes through)
# --------------------------------------------------------------------------
# Free public broker, handy for testing: nothing to install.
# For a local broker (Mosquitto), use "localhost".
BROKER_HOST = "broker.emqx.io"
BROKER_PORT = 1883

# --------------------------------------------------------------------------
# 2) MQTT topics (the "addresses" of the messages)
# --------------------------------------------------------------------------
# On a public broker everyone shares the same topic space:
# replace "demo-team" with a name unique to your team so you don't
# receive somebody else's messages.
PREFIX = "sans-guardian/demo-team"

TOPIC_TX = PREFIX + "/radio/tx"          # space station -> radio channel
TOPIC_RX = PREFIX + "/radio/rx"          # radio channel -> ground station
TOPIC_STATUS = PREFIX + "/radio/status"  # link status (UP / DOWN)

# MQTT quality of service (1 = the broker acknowledges every message).
# This way the only losses we see are the ones WE simulate.
QOS = 1

# --------------------------------------------------------------------------
# 3) Space station (transmitter)
# --------------------------------------------------------------------------
ASTRONAUTS = ["AST-01", "AST-02", "AST-03"]
SEND_INTERVAL_S = 2.0   # one batch of readings every 2 seconds

# --------------------------------------------------------------------------
# 4) Radio channel (what degrades the signal between space and Earth)
# --------------------------------------------------------------------------
# Transmitter -> receiver distance. It sets the propagation delay
# (radio waves travel at the speed of light).
#   ISS  : about 400 km      -> ~0.001 s
#   Moon : about 384,400 km  -> ~1.3 s
DISTANCE_KM = 400.0
SPEED_OF_LIGHT_KM_S = 299_792.458

PROCESSING_DELAY_S = 0.5   # time spent in relays / ground equipment
JITTER_S = 0.2             # random delay variation (+/- 0.2 s)

LOSS_PROBABILITY = 0.10        # 10 % of frames never arrive
CORRUPTION_PROBABILITY = 0.05  # 5 % of frames arrive damaged (radio noise)

# Periodic link outages (the station goes out of range):
# 40 s of visibility, then 10 s without signal, and so on.
# Set OUTAGE_DURATION_S = 0 to disable outages.
VISIBILITY_DURATION_S = 40.0
OUTAGE_DURATION_S = 10.0
