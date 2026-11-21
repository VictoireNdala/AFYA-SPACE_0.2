"""Moteur de règles explicables, avec base de référence personnelle par astronaute.

Port de ``server/rules.js``. Niveaux : 0 = normal, 1 = attention, 2 = critique.
"""

from typing import Any


def _high(value: float, warn: float, crit: float) -> int:
    if value >= crit:
        return 2
    return 1 if value >= warn else 0


def _low(value: float, warn: float, crit: float) -> int:
    if value <= crit:
        return 2
    return 1 if value <= warn else 0


def evaluate(astronaut: dict[str, Any]) -> dict[str, Any]:
    """
    Évalue les constantes d'un astronaute.

    :param astronaut: dict avec ``vitals``, ``baseline`` et ``activity``.
    :return: dict ``{level, score, checks}``.
    """
    v = astronaut["vitals"]
    b = astronaut["baseline"]
    exercising = astronaut["activity"] == "exercice"
    hr_delta = v["hr"] - b["hr"]

    hr_level = _high(hr_delta, 70, 100) if exercising else _high(hr_delta, 20, 40)
    hr_suffix = ", en exercice" if exercising else ""

    checks: list[dict[str, Any]] = [
        {
            "metric": "hr",
            "label": "Rythme cardiaque",
            "level": max(hr_level, _low(v["hr"], 50, 40)),
            "message": f"{v['hr']} bpm (référence personnelle : {b['hr']} bpm{hr_suffix})",
            "action": "Vérifier l’activité en cours, faire une pause et recontrôler dans 5 minutes.",
        },
        {
            "metric": "spo2",
            "label": "Saturation en oxygène",
            "level": _low(v["spo2"], 95, 92),
            "message": f"SpO₂ à {v['spo2']} %",
            "action": "Contrôler la qualité de l’air du module et l’équipement d’oxygène.",
        },
        {
            "metric": "temp",
            "label": "Température corporelle",
            "level": _high(v["temp"], 37.8, 38.5),
            "message": f"{v['temp']} °C",
            "action": "Hydratation, repos et suivi rapproché ; contacter le médecin de bord.",
        },
        {
            "metric": "sleep",
            "label": "Sommeil",
            "level": _low(v["sleep"], 6, 5),
            "message": f"{v['sleep']} h de sommeil",
            "action": "Adapter le planning de la journée et protéger la prochaine période de repos.",
        },
        {
            "metric": "stress",
            "label": "Niveau de stress",
            "level": _high(v["stress"], 70, 85),
            "message": f"Stress estimé à {v['stress']}/100",
            "action": "Proposer une pause, un échange avec l’équipe ou une session de relaxation.",
        },
        {
            "metric": "radiation",
            "label": "Radiation",
            "level": _high(v["radiation"], 100, 250),
            "message": f"{v['radiation']} µSv/h",
            "action": "Rejoindre la zone la mieux protégée du vaisseau et suivre la procédure radiation.",
        },
    ]

    level = max(c["level"] for c in checks)
    score = sum(3 if c["level"] == 2 else c["level"] for c in checks)
    return {"level": level, "score": score, "checks": checks}
