"""
Run the whole simulation in a single terminal:
ground station + radio channel + space station.

Run:  python run_simulation.py      (Ctrl+C to stop everything)
"""

import os
import subprocess
import sys
import time

FOLDER = os.path.dirname(os.path.abspath(__file__))
# Start-up order: listeners first, then the transmitter.
PROGRAMS = ["ground_station.py", "radio_channel.py", "space_station.py"]


def main():
    processes = []
    try:
        for program in PROGRAMS:
            # "-u": unbuffered output, messages appear immediately
            processes.append(
                subprocess.Popen([sys.executable, "-u", os.path.join(FOLDER, program)])
            )
            time.sleep(1.5)
        # Wait while all programs are running.
        while all(p.poll() is None for p in processes):
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for p in processes:
            if p.poll() is None:
                p.terminate()
        for p in processes:
            p.wait()
        print("\nSimulation stopped.")


if __name__ == "__main__":
    main()
