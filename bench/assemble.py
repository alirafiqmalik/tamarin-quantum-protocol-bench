import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QKD_ROOT = ROOT / "vendor" / "qkd-fev"
WORK = ROOT / "work"

KEYWORDS = ("rule", "lemma", "restriction", "builtins", "functions", "begin", "equations")


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


def assemble_qkd(options):
    type_ = options["type"]
    adv = options["adv"]
    er = options["er"]
    bo = options["bo"]
    exec_on = bool(options.get("exec"))
    secrecy = bool(options.get("secrecy"))
    auth = bool(options.get("auth"))
    cmd = [
        "m4",
        f"--define=type={type_}",
        f"--define=Adv={adv}",
        f"--define=ER={er}",
        f"--define=BO={bo}",
        f"--define=exec={_flag(exec_on)}",
        f"--define=secrecy={_flag(secrecy)}",
        f"--define=auth={_flag(auth)}",
        "main.m4",
    ]
    raw = subprocess.check_output(cmd, cwd=QKD_ROOT, text=True, stderr=subprocess.STDOUT)
    theory = clean_theory(raw)
    WORK.mkdir(exist_ok=True)
    name = f"qkd_{type_}_{adv}_{er}_{bo}_{_flag(exec_on)}_{_flag(secrecy)}_{_flag(auth)}.spthy"
    path = WORK / name
    path.write_text(theory)
    label = f"{type_} / {adv} / {er} / {bo}"
    return theory, path, label


def quantum_send_theory(leak_key):
    name = "QuantumSendLeak" if leak_key else "QuantumSend"
    outs = "Out(encode(~msg, k)), Out(mac(~msg, k))"
    if leak_key:
        outs += ", Out(k)"
    return f"""theory {name}
begin

functions: encode/2, measure/2, mac/2, verify/2
equations:
  measure(encode(m, k), k) = m,
  verify(mac(m, k), k) = m

rule ShareKey:
  [ Fr(~k) ]
  --[ ]->
  [ AliceKey(~k), BobKey(~k) ]

rule AliceSend:
  [ AliceKey(k), Fr(~msg) ]
  --[ Sent(~msg), Secret(~msg) ]->
  [ {outs} ]

rule BobRecv:
  [ BobKey(k), In(q), In(tag) ]
  --[ Eq(verify(tag, k), measure(q, k)), Recv(measure(q, k)) ]->
  []

restriction Equality:
  "All x y #i. Eq(x, y) @ i ==> x = y"

lemma executable:
  exists-trace
  "Ex m #i #j. Sent(m) @ i & Recv(m) @ j & #i < #j"

lemma secret:
  "All m #i. Secret(m) @ i ==> not (Ex #j. K(m) @ j)"

lemma correspondence:
  "All m #i. Recv(m) @ i ==> Ex #j. Sent(m) @ j & #j < #i"

end
"""


def assemble_qsend(options):
    leak = bool(options.get("leak_key"))
    theory = quantum_send_theory(leak)
    WORK.mkdir(exist_ok=True)
    path = WORK / ("qsend_leak.spthy" if leak else "qsend.spthy")
    path.write_text(theory)
    label = "key on the channel" if leak else "key off the channel"
    return theory, path, label


def assemble(protocol, options):
    if protocol == "qkd":
        return assemble_qkd(options)
    if protocol == "qsend":
        return assemble_qsend(options)
    raise ValueError(f"Unknown protocol {protocol}")
