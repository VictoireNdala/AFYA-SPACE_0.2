"""
Radio frame format.

A "frame" is the data packet sent over the radio. We attach a checksum
(CRC32) to it: a kind of fingerprint computed from the content. On arrival
the fingerprint is computed again; if it differs, radio noise has damaged
the frame and it is rejected.
"""

import json
import zlib


def _compute_crc(session, seq, timestamp, data):
    """Compute the CRC32 fingerprint of the frame's payload."""
    content = json.dumps(
        {"session": session, "seq": seq, "timestamp": timestamp, "data": data},
        sort_keys=True,              # always the same order -> always the same CRC
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return zlib.crc32(content.encode("utf-8"))


def build_frame(session, seq, timestamp, data):
    """
    Build a frame ready to be sent (bytes).

    session   : id of the transmission session (changes at every start-up)
    seq       : frame number (1, 2, 3, ...) used to detect lost frames
    timestamp : transmission time (time.time()) used to measure latency
    data      : dictionary holding the readings
    """
    frame = {
        "session": session,
        "seq": seq,
        "timestamp": timestamp,
        "data": data,
        "crc": _compute_crc(session, seq, timestamp, data),
    }
    return json.dumps(frame, ensure_ascii=False).encode("utf-8")


def parse_frame(raw):
    """
    Decode a received frame.

    Returns the frame dictionary if it is intact,
    or None if it is corrupted (unreadable or wrong CRC).
    """
    try:
        frame = json.loads(raw.decode("utf-8"))
        expected_crc = _compute_crc(
            frame["session"], frame["seq"], frame["timestamp"], frame["data"]
        )
        if frame["crc"] != expected_crc:
            return None
        return frame
    except (ValueError, KeyError, TypeError):
        # ValueError: unreadable text or JSON; KeyError/TypeError: missing field
        return None
