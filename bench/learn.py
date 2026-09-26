from .assemble import assemble
from .prove import prove_file, verified_names


def _attempt(protocol, options, heuristic, timeout, abstraction):
    _theory, path, label = assemble(protocol, options)
    result = prove_file(path, heuristic=heuristic, timeout=timeout)
    names = verified_names(result)
    return {
        "abstraction": abstraction or label,
        "options": options,
        "heuristic": heuristic,
        "lemmas": result["lemmas"],
        "verified": names,
        "verified_count": len(names),
        "seconds": result["seconds"],
        "timed_out": result["timed_out"],
        "warning": result["warning"],
        "cached": result["cached"],
    }


def _hit(attempts, abstraction, lemma, verified):
    for item in attempts:
        if item["abstraction"] != abstraction:
            continue
        for row in item["lemmas"]:
            if row["name"] == lemma and row["verified"] is verified:
                return item["heuristic"]
    return None


def _sentence(attempts, protocol):
    if not attempts:
        return "No check finished."
    if protocol == "qsend":
        sound = _hit(attempts, "key off the channel", "secret", True)
        leaked = _hit(attempts, "key on the channel", "secret", False)
        parts = []
        if sound:
            parts.append(f"secret holds with the key off the channel under heuristic {sound}")
        if leaked:
            parts.append(f"secret fails with the key on the channel under heuristic {leaked}")
        if sound and leaked:
            parts.append("changing the heuristic leaves the leaked-key secrecy failure in place")
        if not parts:
            parts.append("the search did not separate the two key placements")
        text = ". ".join(parts) + "."
        return text[0].upper() + text[1:]
    best = max(attempts, key=lambda item: (item["verified_count"], -(item["seconds"] or 999)))
    if best["timed_out"]:
        return f"{best['abstraction']} hit the time limit under heuristic {best['heuristic']}."
    if best["verified"]:
        return (
            f"{best['abstraction']} verifies {', '.join(best['verified'])} "
            f"under heuristic {best['heuristic']}."
        )
    return f"{best['abstraction']} did not verify a lemma under heuristic {best['heuristic']}."


def learn(protocol, options, timeout=40):
    attempts = []
    if protocol == "qsend":
        for leak, abstraction in (
            (False, "key off the channel"),
            (True, "key on the channel"),
        ):
            for heuristic in ("S", "C"):
                opts = dict(options)
                opts["leak_key"] = leak
                attempts.append(
                    _attempt(protocol, opts, heuristic, min(timeout, 20), abstraction)
                )
    elif protocol == "qkd":
        base = dict(options)
        base["exec"] = True
        base["secrecy"] = False
        base["auth"] = False
        attempts.append(_attempt(protocol, base, "S", timeout, None))
        neighbor = dict(base)
        neighbor["bo"] = "PostM" if base.get("bo") != "PostM" else "SeqA"
        attempts.append(_attempt(protocol, neighbor, "S", timeout, None))
    else:
        raise ValueError(f"Unknown protocol {protocol}")
    finished = [item for item in attempts if item["lemmas"]]
    pool = finished or attempts
    best = max(pool, key=lambda item: (item["verified_count"], item["abstraction"] == "key off the channel"))
    return {
        "attempts": attempts,
        "best": best,
        "note": _sentence(attempts, protocol),
    }
