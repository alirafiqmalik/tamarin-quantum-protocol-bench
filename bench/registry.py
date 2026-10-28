"""Protocol registry: every module in bench/protocols with a PROTOCOL dict."""
import importlib
import pkgutil

from . import protocols as _pkg

HEURISTICS = ["S", "C", "I", "s", "c", "i"]
GROUPS = [
    {"id": "qkd", "name": "Quantum key distribution", "blurb": "Configurable PM and EB models with their classical control plane."},
    {"id": "communication", "name": "Quantum communication", "blurb": "Two-party protocols with a classical correction or confirmation step."},
    {"id": "multiparty", "name": "Multi-party", "blurb": "Three-party protocols where the classical announcements decide security."},
    {"id": "keyuse", "name": "Key use", "blurb": "What happens to the key after the quantum protocol ends."},
]

_MODULES = {}


def _load():
    if _MODULES:
        return _MODULES
    for info in pkgutil.iter_modules(_pkg.__path__):
        module = importlib.import_module(f"{_pkg.__name__}.{info.name}")
        spec = getattr(module, "PROTOCOL", None)
        if spec:
            _MODULES[spec["id"]] = module
    return _MODULES


def ids():
    return list(_load().keys())


def get(protocol):
    modules = _load()
    if protocol not in modules:
        raise ValueError(f"Unknown protocol {protocol}")
    return modules[protocol]


def spec(protocol):
    return get(protocol).PROTOCOL


def catalog():
    order = {group["id"]: i for i, group in enumerate(GROUPS)}
    items = sorted((m.PROTOCOL for m in _load().values()), key=lambda p: (order.get(p.get("group"), 99), p["name"]))
    return {"heuristics": HEURISTICS, "groups": GROUPS, "protocols": items}


def normalize(protocol, raw):
    raw = raw or {}
    options = {}
    for field in spec(protocol)["fields"]:
        key = field["key"]
        if field["kind"] == "bool":
            value = raw.get(key, field.get("default", False))
            options[key] = bool(value)
        else:
            allowed = {opt["id"] for opt in field["options"]}
            value = raw.get(key, field.get("default"))
            if value not in allowed:
                raise ValueError(f"Unknown {key}: {value}")
            options[key] = value
    return options


def defaults(protocol):
    return normalize(protocol, {})


def assemble(protocol, options):
    return get(protocol).assemble(options)


def lemmas(protocol, options):
    """Lemma names present in the assembled theory for these options."""
    module = get(protocol)
    if hasattr(module, "lemmas"):
        return module.lemmas(options)
    return [item["name"] for item in module.PROTOCOL.get("lemmas", [])]


def lanes(protocol):
    return spec(protocol).get("lanes")


def grid(protocol):
    module = get(protocol)
    if hasattr(module, "grid"):
        return module.grid()
    return [defaults(protocol)]


def all_lemma_options(protocol, options):
    """Options with every lemma switch enabled, for batch evidence."""
    module = get(protocol)
    if hasattr(module, "with_all_lemmas"):
        return module.with_all_lemmas(options)
    return dict(options)
