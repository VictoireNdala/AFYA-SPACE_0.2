"""NASA OSDR GLDS-700 loader (RT-PCR, human retina, apoptosis / inflammation panel, plate 1).

Context: GLDS-700 comes from the ex vivo translaminar pressure model of SANS
(Peng et al., npj Microgravity 2022, doi:10.1038/s41526-022-00232-5).

IMPORTANT: plate 1 contains ONE control sample ("42991 OD NEG CON") measured with two reverse-
transcription kits (iScript, VILO). It has no experimental pressure groups, so it gives a
REFERENCE expression profile and a technical-concordance check. It cannot be used to compare
conditions or to train the crew risk model.
"""
from pathlib import Path

import numpy as np
import pandas as pd

DEFAULT_FILE = Path(__file__).resolve().parents[1] / "data" / "osdr" / "GLDS-700" / "RET APOP INFLAMM PLATE 1_Results.xlsx"
REFERENCE_ASSAY = "GAPDH-Hs02758991_g1"   # same reference gene as the paper (GAPDH)
LOW_CONFIDENCE_CQ = 35.0                   # Cq above this = low-template, treat with caution

CATEGORY = {
    "18S": "Reference", "GAPDH": "Reference", "HPRT1": "Reference", "GUSB": "Reference",
    "RBPMS": "Retinal ganglion cell", "POU4F1": "Retinal ganglion cell", "POU4F2": "Retinal ganglion cell",
    "POU4F3": "Retinal ganglion cell", "ISL1": "Retinal ganglion cell", "THY1": "Retinal ganglion cell",
    "NEFH": "Retinal ganglion cell", "NEFL": "Retinal ganglion cell",
    "RHO": "Photoreceptor / bipolar", "PRKCA": "Photoreceptor / bipolar", "STX1A": "Synaptic",
    "BCL2": "Apoptosis", "BAX": "Apoptosis", "CASP3": "Apoptosis", "CASP7": "Apoptosis", "CASP8": "Apoptosis",
    "TLR4": "Inflammation / glia", "TNF": "Inflammation / glia", "GFAP": "Inflammation / glia",
    "AIF1": "Inflammation / glia", "GSS": "Oxidative stress",
}


def load_wells(path=DEFAULT_FILE) -> pd.DataFrame:
    import openpyxl
    ws = openpyxl.load_workbook(path, read_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    h = next(i for i, r in enumerate(rows) if r[0] == "Well")
    df = pd.DataFrame(rows[h + 1:], columns=rows[h]).dropna(how="all")
    df["Cq"] = pd.to_numeric(df["Cq"], errors="coerce")
    df["gene"] = df["Target"].str.split("-").str[0]
    df["kit"] = df["Sample"].str.split().str[-1]
    df["flag"] = np.where(df["Amp Status"] != "Amp", df["Amp Status"],
                          np.where(df["Cq"] > LOW_CONFIDENCE_CQ, "Low template (Cq>35)", "OK"))
    return df


def expression_table(path=DEFAULT_FILE) -> pd.DataFrame:
    """Per target and kit: mean Cq, delta-Cq vs. GAPDH, relative expression 2^-dCq, QC flag."""
    w = load_wells(path)
    ok = w[w["Amp Status"] == "Amp"]
    g = ok.groupby(["kit", "Target", "gene"]).agg(cq_mean=("Cq", "mean"), n_wells=("Cq", "size")).reset_index()
    ref = g[g.Target == REFERENCE_ASSAY].set_index("kit").cq_mean
    g["delta_cq"] = g.cq_mean - g.kit.map(ref)
    g["rel_expression"] = 2.0 ** (-g.delta_cq)
    worst = w.groupby(["kit", "Target"]).flag.agg(lambda s: "OK" if (s == "OK").all() else "; ".join(sorted(set(s) - {"OK"}))).reset_index()
    g = g.merge(worst, on=["kit", "Target"], how="left")
    g["category"] = g.gene.map(CATEGORY).fillna("Other")
    return g.sort_values(["category", "gene", "kit"]).reset_index(drop=True)


def kit_concordance(expr: pd.DataFrame) -> dict:
    """Agreement between the two RT kits on delta-Cq (technical quality check)."""
    p = expr[expr.category != "Reference"].pivot_table(index="Target", columns="kit", values="delta_cq").dropna()
    r = float(np.corrcoef(p["iSCRIPT"], p["VILO"])[0, 1])
    return {"n_targets": int(len(p)), "pearson_r": round(r, 3),
            "mean_abs_diff_dcq": round(float((p["iSCRIPT"] - p["VILO"]).abs().mean()), 2), "table": p}


if __name__ == "__main__":
    e = expression_table()
    c = kit_concordance(e)
    print(e.groupby("category").size())
    print(f"Kit concordance: r={c['pearson_r']} on {c['n_targets']} targets, mean |ddCq|={c['mean_abs_diff_dcq']}")
    e.to_csv("outputs/osdr_glds700_expression.csv", index=False)
    print(e[e.kit == "VILO"][["gene", "category", "cq_mean", "delta_cq", "rel_expression", "flag"]].round(3).to_string(index=False))
