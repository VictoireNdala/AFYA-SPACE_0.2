"""Simulateur de capteurs : données SIMULÉES (pas de vraies données médicales).

Port de ``server/simulator.js``.
"""

import random
from typing import Any

CREW: list[dict[str, Any]] = [
    {
        "id": "a1",
        "name": "Cdr. Amara",
        "role": "Commandante",
        "baseline": {
            "hr": 62,
            "spo2": 98,
            "temp": 36.6,
            "sleep": 7.2,
            "stress": 25,
            "radiation": 30,
        },
    },
    {
        "id": "a2",
        "name": "Pilote Kenji",
        "role": "Pilote",
        "baseline": {
            "hr": 66,
            "spo2": 98,
            "temp": 36.7,
            "sleep": 6.8,
            "stress": 30,
            "radiation": 30,
        },
    },
    {
        "id": "a3",
        "name": "Dr. Lucia",
        "role": "Médecin de bord",
        "baseline": {
            "hr": 60,
            "spo2": 99,
            "temp": 36.5,
            "sleep": 7.5,
            "stress": 20,
            "radiation": 30,
        },
    },
]

SCENARIOS: dict[str, dict[str, Any]] = {
    "exercice": {"activity": "exercice", "effects": {"hr": 75}, "duration": 30},
    "hypoxie": {"effects": {"spo2": -7, "hr": 15}, "duration": 25},
    "radiation": {"effects": {"radiation": 300}, "duration": 25},
    "fatigue": {"effects": {"sleep": -3, "stress": 50, "hr": 8}, "duration": 40},
    "fievre": {"effects": {"temp": 2, "hr": 20}, "duration": 40},
}

NOISE = {
    "hr": 1.5,
    "spo2": 0.3,
    "temp": 0.03,
    "sleep": 0,
    "stress": 1.5,
    "radiation": 2,
}
DECIMALS = {"hr": 0, "spo2": 0, "temp": 1, "sleep": 1, "stress": 0, "radiation": 0}
HISTORY_SIZE = 120


def _noise(amplitude: float) -> float:
    return random.uniform(-amplitude, amplitude)  # noqa: S311


def _round(value: float, decimals: int) -> float:
    return round(value) if decimals == 0 else round(value, decimals)


class Simulator:
    """État simulé de l'équipage ; ``tick()`` avance d'une seconde."""

    def __init__(self) -> None:
        self._state: list[dict[str, Any]] = [
            {**c, "values": dict(c["baseline"]), "active": [], "hist": []} for c in CREW
        ]

    def tick(self) -> list[dict[str, Any]]:
        """Avance la simulation et renvoie les constantes de chaque astronaute."""
        result: list[dict[str, Any]] = []
        for s in self._state:
            target = dict(s["baseline"])
            activity = "repos"
            for sc in s["active"]:
                definition = SCENARIOS[sc["name"]]
                if "activity" in definition:
                    activity = definition["activity"]
                for key, delta in definition["effects"].items():
                    target[key] += delta
            for key, goal in target.items():
                s["values"][key] += (goal - s["values"][key]) * 0.3 + _noise(NOISE[key])
            s["active"] = [
                {**sc, "ticks_left": sc["ticks_left"] - 1}
                for sc in s["active"]
                if sc["ticks_left"] - 1 > 0
            ]
            vitals = {k: _round(v, DECIMALS[k]) for k, v in s["values"].items()}
            s["hist"].append(vitals)
            if len(s["hist"]) > HISTORY_SIZE:
                s["hist"].pop(0)
            result.append(
                {
                    "id": s["id"],
                    "name": s["name"],
                    "role": s["role"],
                    "activity": activity,
                    "vitals": vitals,
                    "baseline": s["baseline"],
                }
            )
        return result

    def trigger(self, name: str, target_id: str | None = None) -> bool:
        """Déclenche un scénario (exercice, hypoxie, radiation, fatigue, fievre)."""
        definition = SCENARIOS.get(name)
        if definition is None:
            return False
        target = next((s for s in self._state if s["id"] == target_id), self._state[0])
        target["active"].append({"name": name, "ticks_left": definition["duration"]})
        return True

    def history(self, astronaut_id: str) -> list[dict[str, Any]]:
        """Historique récent des constantes d'un astronaute."""
        found = next((s for s in self._state if s["id"] == astronaut_id), None)
        return list(found["hist"]) if found else []
