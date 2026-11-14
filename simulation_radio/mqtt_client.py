"""
Small shared helper to connect to the MQTT broker (paho-mqtt 2.x library).
"""

import sys

import paho.mqtt.client as mqtt

import config


def create_client(name, topics=(), on_message=None):
    """
    Create an MQTT client, connect it to the broker and start listening in the background.

    name       : name shown in the logs (e.g. "GROUND")
    topics     : list of topics to subscribe to
    on_message : function called for each received message: on_message(topic, payload)
    """
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)

    def handle_connect(client, userdata, flags, reason_code, properties):
        if reason_code.is_failure:
            print(f"[{name}] Connection refused by the broker: {reason_code}", flush=True)
            return
        print(f"[{name}] Connected to broker {config.BROKER_HOST}:{config.BROKER_PORT}", flush=True)
        # Subscribe here so subscriptions are restored after a reconnection.
        for topic in topics:
            client.subscribe(topic, qos=config.QOS)

    def handle_disconnect(client, userdata, flags, reason_code, properties):
        print(f"[{name}] Disconnected from broker ({reason_code})", flush=True)

    def handle_message(client, userdata, message):
        if on_message is not None:
            on_message(message.topic, message.payload)

    client.on_connect = handle_connect
    client.on_disconnect = handle_disconnect
    client.on_message = handle_message

    try:
        client.connect(config.BROKER_HOST, config.BROKER_PORT, keepalive=60)
    except OSError as error:
        print(f"[{name}] Cannot reach broker {config.BROKER_HOST}: {error}")
        print(f"[{name}] Check your Internet connection or the address in config.py.")
        sys.exit(1)

    client.loop_start()   # the library handles the network in a separate thread
    return client


def close_client(client):
    """Stop the MQTT client cleanly."""
    client.loop_stop()
    client.disconnect()
