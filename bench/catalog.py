HEURISTICS = ["S", "C", "I", "s", "c", "i"]

CATALOG = {
    "heuristics": HEURISTICS,
    "protocols": [
        {
            "id": "qkd",
            "name": "QKD control model",
            "blurb": "Prepare-and-measure and entanglement-based fragments from the QKD-FEV library. Executability on the default prepare-and-measure model took about 12 seconds here. Secrecy and agreement can run past the time limit.",
            "fields": [
                {
                    "key": "type",
                    "label": "Family",
                    "kind": "choice",
                    "default": "PM",
                    "options": [
                        {"id": "PM", "label": "Prepare and measure"},
                        {"id": "EB", "label": "Entanglement based"},
                    ],
                },
                {
                    "key": "adv",
                    "label": "Adversary",
                    "kind": "choice",
                    "default": "Network",
                    "options": [
                        {"id": "Network", "label": "Network"},
                        {"id": "MaliciousUser", "label": "Malicious user"},
                    ],
                },
                {
                    "key": "er",
                    "label": "Error reconciliation",
                    "kind": "choice",
                    "default": "FEC",
                    "options": [
                        {"id": "FEC", "label": "FEC"},
                        {"id": "REC", "label": "REC"},
                        {"id": "TWEC", "label": "TWEC"},
                    ],
                },
                {
                    "key": "bo",
                    "label": "Basis announcement",
                    "kind": "choice",
                    "default": "SeqA",
                    "options": [
                        {"id": "SeqA", "label": "Alice announces first"},
                        {"id": "SeqB", "label": "Bob announces first"},
                        {"id": "PostM", "label": "After measurement"},
                    ],
                },
                {
                    "key": "exec",
                    "label": "Executability",
                    "kind": "bool",
                    "default": True,
                },
                {
                    "key": "secrecy",
                    "label": "Secrecy",
                    "kind": "bool",
                    "default": False,
                },
                {
                    "key": "auth",
                    "label": "Agreement",
                    "kind": "bool",
                    "default": False,
                },
            ],
        },
        {
            "id": "qsend",
            "name": "Quantum send",
            "blurb": "A preshared key, one encoded message, and a MAC. The key is assumed, not produced by the QKD model. Placing that key on the channel is the abstraction under test.",
            "fields": [
                {
                    "key": "leak_key",
                    "label": "Put the key on the channel",
                    "kind": "bool",
                    "default": False,
                }
            ],
        },
    ],
}
