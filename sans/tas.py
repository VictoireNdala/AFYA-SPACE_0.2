"""NASA OSDR translaminar autonomous system (TAS) datasets of the ex vivo SANS model.

Studies: OSD-815 (ocular globe photography: design metadata only), OSD-817 (optic nerve histology and
microscopy) with LSDS-135 (IHC scores, CTB counts, TUNEL counts) and LSDS-132 (Western blot densitometry of
fibronectin FN and collagen IV COLIV in the ICP / IOP chamber medium).
Reference: Peng et al., npj Microgravity 8, 44 (2022), doi:10.1038/s41526-022-00232-5.

Design: 9 human donors, one eye per condition pair (OD / OS), 18 eyes, 6 pressure groups with N = 3 eyes each.
Statistical power is very low, so results are descriptive.
"""
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

BASE = Path(__file__).resolve().parents[1] / "data" / "osdr"

# Group definitions as in the paper: (ICP, IOP) in mmHg, optic nerve tilt in degrees.
GROUPS = {
    1: {"label": "G1  12:16 (Earth average)", "icp": 12, "iop": 16, "tilt": 0},
    2: {"label": "G2  15:16", "icp": 15, "iop": 16, "tilt": 0},
    3: {"label": "G3  12:21 then 12:16", "icp": 12, "iop": 21, "tilt": 0},  # IOP 21 for 7 days, then 16
    4: {"label": "G4  21:16 (high ICP)", "icp": 21, "iop": 16, "tilt": 0},
    5: {"label": "G5  15:16, 6° tilt", "icp": 15, "iop": 16, "tilt": 6},
    6: {"label": "G6  15:16, 10° tilt", "icp": 15, "iop": 16, "tilt": 10},
}
MEASURES = {
    "ctb_counts": "CTB retrograde transport (counts)",
    "tunel_counts": "TUNEL-positive cells (counts)",
    "ihc_COLIV": "IHC COLIV (0-3)", "ihc_LAM": "IHC LAM (0-3)", "ihc_FN": "IHC FN (0-3)",
    "ihc_GFAP": "IHC GFAP (0-3)", "ihc_TNFA": "IHC TNFa (0-3)", "ihc_TLR4": "IHC TLR4 (0-3)",
    "fn_iop": "FN in IOP chamber medium (densitometry)", "fn_icp": "FN in ICP chamber medium (densitometry)",
    "coliv_iop": "COLIV in IOP chamber medium (densitometry)", "coliv_icp": "COLIV in ICP chamber medium (densitometry)",
}


def _eye_key(subject, eye) -> str:
    return f"{int(subject)}_{str(eye).strip().upper().replace('0D', 'OD')}"


def _group_from_design(icp_iop: str, tilt: str) -> int:
    t = int(float(tilt))
    s = str(icp_iop).replace("_", " ")
    if "then" in s:
        return 3
    return {("12:16", 0): 1, ("15:16", 0): 2, ("21:16", 0): 4, ("15:16", 6): 5, ("15:16", 10): 6}[(s, t)]


def load_design() -> pd.DataFrame:
    """One row per eye with its pressure group, from the OSD-817 ISA sample table."""
    s = pd.read_csv(BASE / "OSD-817" / "s_OSD-817.txt", sep="\t", dtype=str)
    s = s[s["Sample Name"].str.endswith("_FN")].copy()
    s["eye_id"] = s["Sample Name"].str.replace("_FN", "", regex=False)
    p, t = "Factor Value[Treatment Pressure (ICP:IOP)]", "Factor Value[Optic Nerve Tilt]"
    s["group"] = [_group_from_design(a, b) for a, b in zip(s[p], s[t])]
    out = s[["eye_id", "Source Name", "Characteristics[Sex]", "Characteristics[age]", "group"]].copy()
    out.columns = ["eye_id", "donor", "sex", "age", "group"]
    out["age"] = pd.to_numeric(out["age"], errors="coerce")
    return out.reset_index(drop=True)


def load_ihc() -> pd.DataFrame:
    d = pd.read_csv(BASE / "LSDS-135" / "LSDS-135_Immunohistochemistry_IHC_OpticNerveHead_TRANSFORMED.csv", encoding="utf-8-sig")
    d = d.loc[:, ~d.columns.str.startswith("Unnamed")]
    d["eye_id"] = d["Sample Name"].str.strip().str.upper().str.replace("0D", "OD", regex=False)  # source file has a "7346_0D" typo
    d = d.drop(columns="Sample Name")
    return d.rename(columns={c: "ihc_" + c.replace("_expression_score", "") for c in d.columns if c.endswith("_score")})


def _load_counts(fname: str, col: str) -> pd.DataFrame:
    d = pd.read_excel(BASE / "LSDS-135" / fname)
    d = d[pd.to_numeric(d["Subject #"], errors="coerce").notna()].copy()
    d["eye_id"] = [_eye_key(a, b) for a, b in zip(d["Subject #"], d["Eye"])]
    d = d.rename(columns={"Counts": col, "Group": col + "_group_file", "Counts/Normalized to Control": col + "_norm"})
    keep = ["eye_id", col, col + "_norm", col + "_group_file"]
    d[col] = pd.to_numeric(d[col], errors="coerce")
    return d[keep]


def load_western() -> pd.DataFrame:
    path = BASE / "LSDS-132" / "LSDS-132_western-blot_NASA_Protein_Estimation_Final_SUBMITTED.xlsx"
    out = None
    for sheet, tag in [("FN", "fn"), ("COLIV", "coliv")]:
        d = pd.read_excel(path, sheet_name=sheet, header=0, usecols=range(4))
        d.columns = ["subject", "eye", "iop", "icp"]
        d = d[pd.to_numeric(d.subject, errors="coerce").notna()].copy()  # keeps the 18 eyes of the 9 TAS donors
        d["eye_id"] = [_eye_key(a, b) for a, b in zip(d.subject, d.eye)]
        d = d.rename(columns={"iop": f"{tag}_iop", "icp": f"{tag}_icp"})[["eye_id", f"{tag}_iop", f"{tag}_icp"]]
        out = d if out is None else out.merge(d, on="eye_id")
    return out


def tas_eye_table() -> pd.DataFrame:
    df = load_design().merge(load_ihc(), on="eye_id", how="left")
    df = df.merge(_load_counts("LSDS-135_immunostaining_CTB Analysis_SUBMITTED.xlsx", "ctb_counts"), on="eye_id", how="left")
    df = df.merge(_load_counts("LSDS-135_immunostaining_Tunel Analysis_SUBMITTED.xlsx", "tunel_counts"), on="eye_id", how="left")
    df = df.merge(load_western(), on="eye_id", how="left")
    for m in MEASURES:
        df[m] = pd.to_numeric(df[m], errors="coerce")
    df["icp_mmHg"] = df.group.map(lambda g: GROUPS[g]["icp"])
    df["iop_mmHg"] = df.group.map(lambda g: GROUPS[g]["iop"])
    df["tilt_deg"] = df.group.map(lambda g: GROUPS[g]["tilt"])
    df["tlpd_mmHg"] = df.iop_mmHg - df.icp_mmHg
    df["group_label"] = df.group.map(lambda g: GROUPS[g]["label"])
    return df.sort_values(["group", "eye_id"]).reset_index(drop=True)


def check_consistency(df: pd.DataFrame) -> list:
    """Cross-checks between the ISA design and the group numbers written in the submitted files."""
    issues = []
    for col in ("ctb_counts_group_file", "tunel_counts_group_file"):
        bad = df[df[col].notna() & (df[col] != df.group)]
        if len(bad):
            issues.append(f"{col}: group differs from ISA design for {', '.join(bad.eye_id)}")
    if (df.groupby("group").size() != 3).any():
        issues.append("Not every group has exactly 3 eyes")
    return issues


def group_summary(df: pd.DataFrame, measure: str) -> pd.DataFrame:
    g = df.groupby("group")[measure].agg(["mean", "std", "count", "min", "max"]).reset_index()
    g["sem"] = g["std"] / np.sqrt(g["count"])
    g["label"] = g.group.map(lambda k: GROUPS[k]["label"])
    return g


def group_tests(df: pd.DataFrame) -> pd.DataFrame:
    """Kruskal-Wallis across the 6 groups for each measure (N = 3 per group: very low power)."""
    rows = []
    for m, label in MEASURES.items():
        samples = [df.loc[df.group == k, m].dropna().to_numpy(dtype=float) for k in sorted(GROUPS)]
        if sum(len(x) > 0 for x in samples) < 2:
            continue
        h, p = stats.kruskal(*samples)
        rows.append({"measure": m, "label": label, "kruskal_H": round(float(h), 2), "p_value": round(float(p), 3),
                     "significant_p05": bool(p < 0.05)})
    return pd.DataFrame(rows)


def osd815_design() -> pd.DataFrame:
    """OSD-815 (ocular globe photography): metadata only. The diameter / depth measurements are in a separate
    archive (.pzf.zip) that is not part of the files provided, so only the sample design is loaded."""
    s = pd.read_csv(BASE / "OSD-815" / "s_OSD-815.txt", sep="\t", dtype=str)
    s = s[["Source Name", "Sample Name", "Factor Value[Pre- or Post- Treatment]",
           "Factor Value[Treatment Pressure (ICP:IOP)]", "Factor Value[Optic Nerve Tilt]"]]
    s.columns = ["donor", "sample", "timepoint", "icp_iop", "tilt"]
    return s


# Approximate group means READ BY EYE from the paper's figures (bar heights), for a labeling cross-check only.
PAPER_FIG_APPROX = {
    "ctb_counts": [215, 490, 130, 220, 630, 450],      # Fig. 9g
    "tunel_counts": [335, 410, 395, 485, 750, 535],    # Fig. 8d
}


def paper_label_check(df: pd.DataFrame) -> pd.DataFrame:
    """Compare OSDR group means with the paper's figures, with the group numbers as is and shifted by one.

    The values match when the paper's group k is compared with OSDR group k-1 (cyclic), for both assays.
    This points to a group-labeling difference between the figures and the OSDR files that should be
    clarified with the data owners before any per-group conclusion is drawn.
    """
    rows = []
    for m, paper in PAPER_FIG_APPROX.items():
        means = df.groupby("group")[m].mean().reindex(range(1, 7)).to_numpy()
        same = float(np.corrcoef(means, paper)[0, 1])
        shifted = float(np.corrcoef(np.roll(means, 1), paper)[0, 1])  # paper G(k) <-> OSDR G(k-1)
        rows.append({"assay": m, "r_same_labels": round(same, 2), "r_paper_Gk_vs_OSDR_G(k-1)": round(shifted, 2)})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    t = tas_eye_table()
    print(t[["eye_id", "group", "ctb_counts", "tunel_counts", "ihc_GFAP", "fn_iop", "coliv_iop"]].to_string(index=False))
    print("consistency issues:", check_consistency(t) or "none")
    print(t.groupby("group")[["ctb_counts", "tunel_counts", "ihc_GFAP", "ihc_TLR4", "fn_iop", "coliv_iop"]].mean().round(1))
    print(group_tests(t).to_string(index=False))
    print(paper_label_check(t).to_string(index=False))
    t.to_csv("outputs/tas_eye_table.csv", index=False)
    group_tests(t).to_csv("outputs/tas_group_tests.csv", index=False)
