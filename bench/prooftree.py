"""Parse Tamarin proof text (from --output) into a tree per lemma."""
import re

LEMMA_RE = re.compile(r"^lemma\s+([A-Za-z_][A-Za-z0-9_]*)\s*(\[[^\]]*\])?\s*:")
LEAF_WORDS = ("SOLVED", "by ", "qed", "contradiction")


def _blocks(text):
    """Yield (lemma_name, lines) for every lemma in the proof output."""
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        match = LEMMA_RE.match(lines[i])
        if not match:
            i += 1
            continue
        name = match.group(1)
        j = i + 1
        body = []
        while j < len(lines):
            if LEMMA_RE.match(lines[j]) or lines[j].startswith("end"):
                break
            body.append(lines[j])
            j += 1
        yield name, body
        i = j


def _join_continuations(lines):
    """Join multi-line solve( ... ) statements into one logical line."""
    out = []
    buf = None
    depth = 0
    for raw in lines:
        if buf is None:
            stripped = raw.strip()
            if stripped.startswith("solve("):
                depth = stripped.count("(") - stripped.count(")")
                if depth > 0:
                    buf = raw
                    continue
            out.append(raw)
        else:
            buf += " " + raw.strip()
            depth += raw.count("(") - raw.count(")")
            if depth <= 0:
                out.append(buf)
                buf = None
    if buf is not None:
        out.append(buf)
    return out


def parse_lemma_proof(lines):
    """Return a tree for one lemma body. Nodes: {kind, label, status, children}."""
    root = {"kind": "lemma", "label": "", "status": "", "children": []}
    stack = [(-1, root)]
    in_comment = False
    for raw in _join_continuations(lines):
        stripped = raw.strip()
        if not stripped:
            continue
        if stripped.startswith("/*"):
            in_comment = not stripped.endswith("*/")
            continue
        if in_comment:
            if stripped.endswith("*/"):
                in_comment = False
            continue
        if stripped.startswith(('all-traces', 'exists-trace', '"')):
            continue
        indent = len(raw) - len(raw.lstrip())
        node = None
        if stripped.startswith("solve("):
            node = {"kind": "solve", "label": stripped[6:].rsplit(")", 1)[0].strip(), "status": "", "children": []}
        elif stripped.startswith("case "):
            node = {"kind": "case", "label": stripped[5:].strip(), "status": "", "children": []}
        elif stripped.startswith(("simplify", "induction")):
            node = {"kind": stripped.split()[0], "label": "", "status": "", "children": []}
        elif stripped.startswith("SOLVED"):
            node = {"kind": "leaf", "label": "trace found", "status": "trace", "children": []}
        elif stripped.startswith("by "):
            label = stripped[3:].strip()
            status = "contradiction" if "contradiction" in label else ("sorry" if "sorry" in label else "closed")
            node = {"kind": "leaf", "label": label, "status": status, "children": []}
        elif stripped.startswith("qed"):
            while len(stack) > 1 and stack[-1][0] >= indent:
                stack.pop()
            continue
        else:
            continue
        if node["kind"] == "case":
            # A case owns every following line at its own indent until the
            # next case at that indent or the qed of the enclosing solve.
            while len(stack) > 1 and stack[-1][0] > indent - 1:
                stack.pop()
            stack[-1][1]["children"].append(node)
            stack.append((indent - 0.5, node))
            continue
        while len(stack) > 1 and stack[-1][0] >= indent:
            stack.pop()
        stack[-1][1]["children"].append(node)
        if node["kind"] != "leaf":
            stack.append((indent, node))
    _annotate(root)
    return root


def _annotate(node):
    """Fill status for inner nodes and count nodes."""
    if node["kind"] == "leaf":
        node["size"] = 1
        return node["status"]
    statuses = [_annotate(child) for child in node["children"]]
    node["size"] = 1 + sum(child["size"] for child in node["children"])
    if not statuses and node["kind"] in ("simplify", "induction"):
        node["status"] = "closed"
        return node["status"]
    if "trace" in statuses:
        node["status"] = "trace"
    elif statuses and all(s in ("contradiction", "closed") for s in statuses):
        node["status"] = "closed"
    elif "sorry" in statuses or not statuses:
        node["status"] = "open"
    else:
        node["status"] = "mixed"
    return node["status"]


def flatten(tree):
    """Pre-order list for replay animation."""
    order = []

    def walk(node, depth, parent):
        idx = len(order)
        order.append({"i": idx, "p": parent, "d": depth, "kind": node["kind"], "label": node["label"][:160], "status": node["status"]})
        for child in node["children"]:
            walk(child, depth + 1, idx)

    walk(tree, 0, None)
    return order


def parse_proofs(text):
    """Map lemma name -> {tree, order, size, depth}."""
    result = {}
    for name, body in _blocks(text):
        tree = parse_lemma_proof(body)
        order = flatten(tree)
        result[name] = {
            "size": tree["size"],
            "depth": max((item["d"] for item in order), default=0),
            "status": tree["status"],
            "order": order,
        }
    return result
