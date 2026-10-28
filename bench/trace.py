"""Turn a Tamarin --output-json trace into a message sequence chart."""
import json
import re
from collections import defaultdict, deque

DEFAULT_LANES = [
    ("alice", ("Alice", "A_")),
    ("bob", ("Bob", "B_")),
    ("charlie", ("Charlie", "C_")),
    ("dealer", ("Dealer",)),
    ("eve", ("Eve", "Adv", "Session_Eve", "Malicious")),
    ("channel", ("Source", "Charlie_Source", "Chan", "QChan", "Setup", "Share", "KME", "Key")),
]

QUANTUM_WORDS = ("Quantum", "QChan", "Qubit", "Pair", "EPR", "GHZ")
AUTH_WORDS = ("Auth",)


def _lane_for(rule, lanes):
    for lane, prefixes in lanes:
        for prefix in prefixes:
            if rule.startswith(prefix):
                return lane
    return "network"


def _channel(fact_name):
    if any(word in fact_name for word in QUANTUM_WORDS):
        return "quantum"
    if any(word in fact_name for word in AUTH_WORDS):
        return "classical-auth"
    if fact_name in ("Out", "In"):
        return "public"
    return "state"


def _short(show, limit=48):
    text = re.sub(r"\s+", " ", show or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def _topo_order(nodes, edges):
    ids = [n["jgnId"] for n in nodes]
    pos = {nid: i for i, nid in enumerate(ids)}
    deps = defaultdict(set)
    succ = defaultdict(set)
    for edge in edges:
        src = edge["jgeSource"].split(":")[0]
        dst = edge["jgeTarget"].split(":")[0]
        if src in pos and dst in pos and src != dst:
            deps[dst].add(src)
            succ[src].add(dst)
    ready = deque(sorted((nid for nid in ids if not deps[nid]), key=pos.get))
    order = []
    seen = set()
    while ready:
        nid = ready.popleft()
        if nid in seen:
            continue
        seen.add(nid)
        order.append(nid)
        for nxt in sorted(succ[nid], key=pos.get):
            deps[nxt].discard(nid)
            if not deps[nxt] and nxt not in seen:
                ready.append(nxt)
    for nid in ids:
        if nid not in seen:
            order.append(nid)
    return order


def graph_to_msc(graph, lanes=None, lemma_atoms=()):
    """Return {lanes, events, messages, violation} for one trace graph."""
    lanes = lanes or DEFAULT_LANES
    nodes = graph.get("jgNodes", [])
    edges = graph.get("jgEdges", [])
    by_id = {n["jgnId"]: n for n in nodes}
    order = _topo_order(nodes, edges)
    rank = {nid: i for i, nid in enumerate(order)}

    lane_of = {}
    for node in nodes:
        name = node.get("jgnLabel") or ""
        if node.get("jgnType") == "isProtocolRule":
            lane_of[node["jgnId"]] = _lane_for(name, lanes)
        else:
            lane_of[node["jgnId"]] = "attacker"

    events = []
    violation = []
    for nid in order:
        node = by_id[nid]
        meta = node.get("jgnMetadata") or {}
        acts = [a.get("jgnFactShow", "") for a in meta.get("jgnActs", [])]
        kind = "rule" if node.get("jgnType") == "isProtocolRule" else "attacker"
        label = node.get("jgnLabel") or ""
        if kind == "attacker" and label in ("Send", "Recv", "Coerce") or label.startswith(("Constrc_", "Destrd_")):
            # Intruder bookkeeping: keep the derivation facts short.
            concs = [c.get("jgnFactShow", "") for c in meta.get("jgnConcs", [])]
            acts = concs[:1]
        hit = [a for a in acts if any(a.startswith(atom + "(") or a.startswith(atom + " (") for atom in lemma_atoms)]
        event = {
            "id": nid,
            "t": rank[nid],
            "lane": lane_of[nid],
            "rule": label,
            "kind": kind,
            "actions": [_short(a, 80) for a in acts],
            "violation": bool(hit),
        }
        events.append(event)
        if hit:
            violation.append(nid)

    fact_index = {}
    for node in nodes:
        meta = node.get("jgnMetadata") or {}
        for conc in meta.get("jgnConcs", []):
            fact_index[conc["jgnFactId"]] = conc
        for prem in meta.get("jgnPrems", []):
            fact_index[prem["jgnFactId"]] = prem

    messages = []
    seen = set()
    for edge in edges:
        if edge.get("jgeRelation") == "LessAtoms":
            continue
        src = edge["jgeSource"].split(":")[0]
        dst = edge["jgeTarget"].split(":")[0]
        if src not in lane_of or dst not in lane_of:
            continue
        # Prefer the fact as the receiving protocol rule sees it (its premise);
        # for edges into the attacker use the sender's conclusion.
        if lane_of[dst] != "attacker":
            fact = fact_index.get(edge["jgeTarget"]) or fact_index.get(edge["jgeSource"]) or {}
        else:
            fact = fact_index.get(edge["jgeSource"]) or fact_index.get(edge["jgeTarget"]) or {}
        name = fact.get("jgnFactName", "")
        show = fact.get("jgnFactShow", name)
        channel = _channel(name)
        if lane_of[src] == lane_of[dst] and channel == "state":
            continue
        key = (src, dst, show)
        if key in seen:
            continue
        seen.add(key)
        messages.append(
            {
                "from": src,
                "to": dst,
                "fromLane": lane_of[src],
                "toLane": lane_of[dst],
                "t": max(rank[src], rank[dst]),
                "fact": name,
                "label": _short(show),
                "full": re.sub(r"\s+", " ", show),
                "channel": channel,
                "relation": edge.get("jgeRelation"),
            }
        )
    messages.sort(key=lambda m: (m["t"], m["from"]))
    used = []
    for lane, _ in lanes:
        if any(e["lane"] == lane for e in events):
            used.append(lane)
    if any(e["lane"] == "network" for e in events):
        used.append("network")
    if any(e["lane"] == "attacker" for e in events):
        used.append("attacker")
    return {
        "label": graph.get("jgLabel", ""),
        "lanes": used,
        "events": events,
        "messages": messages,
        "violation": violation,
        "size": len(nodes),
    }


def lemma_atoms(theory_text, lemma):
    """Action fact names used in a lemma formula."""
    match = re.search(r"lemma\s+" + re.escape(lemma) + r"\b[^:]*:\s*(?:exists-trace|all-traces)?\s*\"(.*?)\"", theory_text, re.S)
    if not match:
        return []
    body = match.group(1)
    names = set(re.findall(r"\b([A-Z][A-Za-z0-9_]*)\s*\(", body))
    names.discard("Ex")
    names.discard("All")
    return sorted(names)


def parse_trace_file(path, lanes=None, atoms=()):
    data = json.loads(open(path).read())
    graphs = data.get("graphs", []) if isinstance(data, dict) else []
    return [graph_to_msc(g, lanes, atoms) for g in graphs]
