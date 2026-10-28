"""QKD control models assembled from the QKD-FEV fragment library with m4."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
QKD_ROOT = ROOT / "vendor" / "qkd-fev"
WORK = ROOT / "work"

KEYWORDS = ("rule", "lemma", "restriction", "builtins", "functions", "begin", "equations")

LEMMAS = [
    {"name": "executability_success", "kind": "exists-trace", "flag": "exec", "title": "Executability", "desc": "Alice and Bob can both commit to the same key, or both detect Eve."},
    {"name": "secret_key_A", "kind": "all-traces", "flag": "secrecy", "title": "Key secrecy (Alice)", "desc": "The key Alice commits to never enters attacker knowledge."},
    {"name": "secret_key_B", "kind": "all-traces", "flag": "secrecy", "title": "Key secrecy (Bob)", "desc": "The key Bob commits to never enters attacker knowledge."},
    {"name": "aliveness_A", "kind": "all-traces", "flag": "auth", "title": "Aliveness (Alice)", "desc": "When Alice commits, Bob was created for that session."},
    {"name": "aliveness_B", "kind": "all-traces", "flag": "auth", "title": "Aliveness (Bob)", "desc": "When Bob commits, Alice was created for that session earlier."},
    {"name": "weak_agreement_A", "kind": "all-traces", "flag": "auth", "title": "Weak agreement (Alice)", "desc": "When Alice commits with Bob, Bob ran the protocol with Alice."},
    {"name": "weak_agreement_B", "kind": "all-traces", "flag": "auth", "title": "Weak agreement (Bob)", "desc": "When Bob commits with Alice, Alice ran the protocol with Bob."},
    {"name": "noninjectiveagreement_A", "kind": "all-traces", "flag": "auth", "title": "Non-injective agreement (Alice)", "desc": "Alice's committed key and session match a run of Bob."},
    {"name": "noninjectiveagreement_B", "kind": "all-traces", "flag": "auth", "title": "Non-injective agreement (Bob)", "desc": "Bob's committed key and session match a run of Alice."},
]

PROTOCOL = {
    "id": "qkd",
    "name": "QKD control model",
    "group": "qkd",
    "blurb": "Prepare-and-measure and entanglement-based fragments from the QKD-FEV library. Family, adversary, error reconciliation, and basis-announcement order are m4 switches.",
    "story": "The quantum step is one symbolic encode/measure pair. Everything else is classical control: session setup, authenticated announcements, sifting, parameter estimation, and reconciliation. The verdicts change with the classical choices.",
    "fields": [
        {"key": "type", "label": "Family", "kind": "choice", "default": "PM", "options": [
            {"id": "PM", "label": "Prepare and measure"},
            {"id": "EB", "label": "Entanglement based"},
        ]},
        {"key": "adv", "label": "Adversary", "kind": "choice", "default": "Network", "options": [
            {"id": "Network", "label": "Network (Eve⁺)"},
            {"id": "MaliciousUser", "label": "Malicious user"},
        ]},
        {"key": "er", "label": "Error reconciliation", "kind": "choice", "default": "FEC", "options": [
            {"id": "FEC", "label": "FEC (Alice sends)"},
            {"id": "REC", "label": "REC (Bob sends)"},
            {"id": "TWEC", "label": "TWEC (both send)"},
        ]},
        {"key": "bo", "label": "Basis announcement", "kind": "choice", "default": "SeqA", "options": [
            {"id": "SeqA", "label": "A2B: Alice announces first"},
            {"id": "SeqB", "label": "B2A: Bob announces first"},
            {"id": "PostM", "label": "No ordering restriction"},
        ]},
        {"key": "exec", "label": "Executability lemma", "kind": "bool", "default": True},
        {"key": "secrecy", "label": "Secrecy lemmas", "kind": "bool", "default": True},
        {"key": "auth", "label": "Agreement lemmas", "kind": "bool", "default": False},
        {"key": "cm1", "label": "CM1 measurement commitment", "kind": "bool", "default": False},
        {"key": "cm2", "label": "CM2 identity-bound MAC", "kind": "bool", "default": False},
    ],
    "lemmas": LEMMAS,
    "presets": [
        {"id": "pm-a2b-fec", "label": "PM, Alice announces first", "options": {"type": "PM", "adv": "Network", "er": "FEC", "bo": "SeqA", "exec": True, "secrecy": True, "auth": False}, "story": "Alice-first ordering opens the basis-deferred window (V2)."},
        {"id": "pm-b2a-rec", "label": "PM, Bob announces first", "options": {"type": "PM", "adv": "Network", "er": "REC", "bo": "SeqB", "exec": True, "secrecy": True, "auth": False}, "story": "Bob-first ordering closes V2 for this reconciliation mode."},
        {"id": "eb-fec", "label": "EB, network adversary", "options": {"type": "EB", "adv": "Network", "er": "FEC", "bo": "PostM", "exec": True, "secrecy": True, "auth": False}, "story": "An adversary-controlled entangled source learns the key (V1)."},
        {"id": "pm-a2b-fec-cm1", "label": "A2B with CM1", "options": {"type": "PM", "adv": "Network", "er": "FEC", "bo": "SeqA", "exec": True, "secrecy": True, "auth": True, "cm1": True, "cm2": False}, "story": "Measurement commitment: Alice announces her basis only after Bob has committed to a measurement."},
        {"id": "pm-a2b-fec-cm2", "label": "A2B with CM2", "options": {"type": "PM", "adv": "Network", "er": "FEC", "bo": "SeqA", "exec": True, "secrecy": True, "auth": True, "cm1": False, "cm2": True}, "story": "Identity-bound MAC: tags cover sender, role, receiver, and message kind, so reflected messages fail verification."},
        {"id": "pm-a2b-fec-cm12", "label": "A2B with CM1+CM2", "options": {"type": "PM", "adv": "Network", "er": "FEC", "bo": "SeqA", "exec": True, "secrecy": True, "auth": True, "cm1": True, "cm2": True}, "story": "Both countermeasures: the paper's combined fix."},
        {"id": "eb-fec-cm12", "label": "EB with CM1+CM2", "options": {"type": "EB", "adv": "Network", "er": "FEC", "bo": "PostM", "exec": True, "secrecy": True, "auth": True, "cm1": True, "cm2": True}, "story": "Both countermeasures on the entanglement-based model: the commitment closes the V1 time shift."},
    ],
    "expectations": None,  # filled below from TABLE_I and the paper's Section V-B prose
    "standards": [
        {"clause": "ETSI GS QKD 005 V1.1.1", "text": "Describes sifting and parameter estimation but leaves the order of basis disclosure relative to measurement to the implementation."},
        {"clause": "ITU-T FG QIT4N D2.3.1", "text": "Mandates MAC-based authentication of post-processing messages without requiring role, direction, or session binding in the MAC input."},
        {"clause": "ETSI GS QKD 014 V1.1.1", "text": "Delivers the finished key to applications by key ID. The delivered key inherits whatever the control plane guaranteed."},
    ],
    "lanes": [
        ["alice", ["Alice"]],
        ["bob", ["Bob"]],
        ["eve", ["Eve", "Session_Eve"]],
        ["channel", ["Setup", "QChan", "Chan", "Charlie_Source"]],
    ],
}


def clean_theory(text):
    kept = []
    for line in text.splitlines(keepends=True):
        stripped = line.strip()
        if not stripped or stripped.startswith("//"):
            continue
        if stripped.startswith(KEYWORDS):
            kept.append("\n" + line)
        else:
            kept.append(line)
    return "".join(kept)


def _flag(value):
    return "true" if value else "false"


def m4_defines(options):
    return [
        f"--define=type={options['type']}",
        f"--define=Adv={options['adv']}",
        f"--define=ER={options['er']}",
        f"--define=BO={options['bo']}",
        f"--define=exec={_flag(options.get('exec'))}",
        f"--define=secrecy={_flag(options.get('secrecy'))}",
        f"--define=auth={_flag(options.get('auth'))}",
        f"--define=CM1={_flag(options.get('cm1'))}",
        f"--define=CM2={_flag(options.get('cm2'))}",
    ]


def file_name(options):
    parts = [options["type"], options["adv"], options["er"], options["bo"], _flag(options.get("exec")), _flag(options.get("secrecy")), _flag(options.get("auth"))]
    cm = cm_label(options)
    if cm != "baseline":
        parts.append(cm.replace("+", "_").lower())
    return "qkd_" + "_".join(parts) + ".spthy"


def label(options):
    bo = {"SeqA": "A2B", "SeqB": "B2A", "PostM": "unordered"}[options["bo"]]
    text = f"{options['type']} / {options['adv']} / {options['er']} / {bo}"
    cm = cm_label(options)
    return text if cm == "baseline" else f"{text} / {cm}"


def cm_label(options):
    """'baseline', 'CM1', 'CM2', or 'CM1+CM2' for the countermeasure switches."""
    on = [name for name, key in (("CM1", "cm1"), ("CM2", "cm2")) if options.get(key)]
    return "+".join(on) if on else "baseline"


def assemble(options):
    cmd = ["m4", *m4_defines(options), "main.m4"]
    raw = subprocess.check_output(cmd, cwd=QKD_ROOT, text=True, stderr=subprocess.STDOUT)
    theory = clean_theory(raw)
    WORK.mkdir(exist_ok=True)
    path = WORK / file_name(options)
    path.write_text(theory)
    return theory, path, label(options)


def lemmas(options):
    return [item["name"] for item in LEMMAS if options.get(item["flag"])]


def with_all_lemmas(options):
    out = dict(options)
    out.update({"exec": True, "secrecy": True, "auth": True})
    return out


CM_VARIANTS = [
    {"cm1": False, "cm2": False},
    {"cm1": True, "cm2": False},
    {"cm1": False, "cm2": True},
    {"cm1": True, "cm2": True},
]


def paper_grid():
    """The nine Eve⁺ configurations of the QVerify paper (Table I), all lemmas on."""
    configs = []
    for er in ("TWEC", "REC", "FEC"):
        configs.append({"type": "EB", "adv": "Network", "er": er, "bo": "PostM", "exec": True, "secrecy": True, "auth": True})
    for bo in ("SeqB", "SeqA"):
        for er in ("TWEC", "REC", "FEC"):
            configs.append({"type": "PM", "adv": "Network", "er": er, "bo": bo, "exec": True, "secrecy": True, "auth": True})
    return configs


def grid():
    """36 points: the nine Table I configurations x {baseline, CM1, CM2, CM1+CM2}."""
    configs = []
    for base in paper_grid():
        for cm in CM_VARIANTS:
            configs.append({**base, **cm})
    return configs


# Paper results (Table I, "Verification under Eve+") per (family, bo, er): each lemma pair as
# (A verdict, B verdict) where a verdict is None (verified) or the vulnerability the paper blames.
# "sec" is secret_key_*, "alive" aliveness_*, "wagree" weak_agreement_*, "niagree" noninjectiveagreement_*.
TABLE_I = {
    ("EB", "PostM", "TWEC"): {"sec": ("V1", "V1"), "alive": (None, None), "wagree": (None, None), "niagree": ("V3", "V3")},
    ("EB", "PostM", "REC"): {"sec": ("V1", "V1"), "alive": (None, None), "wagree": (None, None), "niagree": (None, "V3")},
    ("EB", "PostM", "FEC"): {"sec": ("V1", "V1"), "alive": (None, None), "wagree": (None, None), "niagree": ("V3", None)},
    ("PM", "SeqB", "TWEC"): {"sec": ("V2", None), "alive": ("V3", "V3"), "wagree": ("V3", "V3"), "niagree": ("V3", "V3")},
    ("PM", "SeqB", "REC"): {"sec": (None, None), "alive": (None, "V3"), "wagree": (None, "V3"), "niagree": (None, "V3")},
    ("PM", "SeqB", "FEC"): {"sec": ("V2", None), "alive": ("V3", None), "wagree": ("V3", None), "niagree": ("V3", None)},
    ("PM", "SeqA", "TWEC"): {"sec": ("V2", "V2"), "alive": ("V3", "V3"), "wagree": ("V3", "V3"), "niagree": ("V3", "V3")},
    ("PM", "SeqA", "REC"): {"sec": ("V2", "V2"), "alive": (None, "V3"), "wagree": (None, "V3"), "niagree": (None, "V3")},
    ("PM", "SeqA", "FEC"): {"sec": ("V2", "V2"), "alive": ("V3", None), "wagree": ("V3", None), "niagree": ("V3", None)},
}
_LEMMA_KEYS = {"sec": "secret_key_", "alive": "aliveness_", "wagree": "weak_agreement_", "niagree": "noninjectiveagreement_"}
# Which countermeasure the paper says removes each vulnerability (Section V-B).
CM_FIXES = {"V1": "CM1", "V2": "CM1", "V3": "CM2"}


def expectations():
    """What the paper reports for every (configuration, countermeasure set, lemma).

    Baseline cells come from Table I. Cells with CM1, CM2, or both are inferred from the
    paper's prose: CM1 closes V1/V2, CM2 closes V3, and together every lemma verifies. The
    paper does not print a per-countermeasure table, so those rows carry source "prose".
    """
    rows = []
    for (family, bo, er), cells in TABLE_I.items():
        for cm in CM_VARIANTS:
            label = cm_label(cm)
            active = {name for name, key in (("CM1", "cm1"), ("CM2", "cm2")) if cm[key]}
            rows.append({"type": family, "bo": bo, "er": er, "cm": label, "lemma": "executability_success",
                         "paper": "verified", "vuln": None, "source": "table"})
            for key, prefix in _LEMMA_KEYS.items():
                for party, vuln in zip("AB", cells[key]):
                    fixed = vuln is not None and CM_FIXES[vuln] in active
                    rows.append({
                        "type": family, "bo": bo, "er": er, "cm": label, "lemma": prefix + party,
                        "paper": "verified" if vuln is None or fixed else "falsified",
                        "vuln": None if vuln is None or fixed else vuln,
                        "source": "table" if label == "baseline" else "prose",
                    })
    return rows


PROTOCOL["expectations"] = expectations()
