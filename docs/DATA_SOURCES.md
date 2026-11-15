# Data sources, references and use of AI

## NASA data used

**NASA Open Science Data Repository (OSDR), dataset GLDS-700**
RT-PCR (TaqMan array, QuantStudio 3), human donor retina, apoptosis / inflammation / retinal-marker panel, plate 1
(`RET APOP INFLAMM PLATE 1_Results.xlsx`, stored in `data/osdr/GLDS-700/`).

How it is used (`sans/osdr.py`, dashboard tab "NASA OSDR reference"):
- parses the 96-well results file, flags failed or low-template wells (No Amp, Inconclusive, Cq > 35);
- computes relative expression (2^-dCq) of 26 targets against GAPDH, grouped by biological category
  (retinal ganglion cell, photoreceptor/bipolar, apoptosis, inflammation/glia, oxidative stress);
- checks technical agreement between the two reverse-transcription kits (iScript vs. VILO).

Limits: plate 1 holds a single control sample ("42991 OD NEG CON"). It has no pressure groups, so it is a
reference profile, not evidence of SANS-related change. It is not used to train the crew risk model.

**NASA OSDR OSD-817, OSD-815, LSDS-135 and LSDS-132 (ex vivo SANS model, translaminar autonomous system)**
Files stored in `data/osdr/`: OSD-817 and OSD-815 ISA sample metadata, LSDS-135 (IHC expression scores, CTB counts,
TUNEL counts), LSDS-132 (Western blot densitometry of fibronectin and collagen IV in ICP / IOP chamber medium).

How they are used (`sans/tas.py`, dashboard tab "TAS experiment (OSD-817)"):
- builds one table per donor eye (18 eyes, 9 donors) with its pressure group (ICP:IOP, optic nerve tilt) from the ISA metadata;
- compares 12 measures between the 6 groups (mean, SEM, individual eyes, Kruskal-Wallis);
- cross-checks the group numbers in the submitted files against the ISA design.

Findings and limits:
- 3 eyes per group: the comparison is descriptive. No measure differs significantly between groups (Kruskal-Wallis, p < 0.05).
- Group means of the CTB and TUNEL counts match the bar heights of the paper's Fig. 9g and 8d (read by eye, approximate) only
  when paper group k is compared with OSDR group k-1. This points to a group-labeling difference between the paper's figures
  and the OSDR files, to clarify with the data owners before any per-group conclusion.
- OSD-815 (ocular globe photography) provides design metadata only; the diameter and depth measurements are in an archive not provided.
- Source files contain small quirks handled in code: a "7346_0D" typo (zero instead of O), sample names ending in "_FN" in OSD-817,
  extra Western blot rows for donors outside the 9 TAS donors, and spreadsheet #REF! columns that are ignored.
- Experimental model on donor tissue, not astronaut data; not used to train the crew risk model.

## Publications and NASA pages

- Peng M. et al. The ex vivo human translaminar autonomous system to study spaceflight associated neuro-ocular
  syndrome pathogenesis. npj Microgravity 8, 44 (2022). https://doi.org/10.1038/s41526-022-00232-5
- NASA HRP, Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS)
- NASA, What Is Spaceflight Associated Neuro-ocular Syndrome?
- NASA, Thigh Cuff
- NASA HHP, Cardiovascular and Vision
- NASA, Houston We Have a Podcast, episode 351, "Let's B-Complex"

## Simulated data

The crew data (`sans/simulate.py`) is simulated with assumptions inspired by the sources above (about 20% significant
SANS, genetic and nutritional contribution, early plateau). Model performance on it reflects those assumptions, not real-world accuracy.

## Use of AI

Claude (Anthropic) was used for research synthesis, specification, code generation, documentation and testing.
All outputs were reviewed by the team.
