#!/usr/bin/env python3

from client import *
from collections import deque
import json
import random
import base64


def print_banner(msg):
    msg_len = len(msg)
    filler_len = (80 - msg_len) // 2
    header = "=" * filler_len + msg + "=" * filler_len
    print(header + "\n")
    print("=" * 80 + "\n")


def make_leaf(status):
    """Build a closed proof node for a Solved or Contradictory system."""
    return {"action": status.lower(), "children": {}}


def is_complete(cases):
    """
    A proof step is complete if:
    - all children are Contradictory (includes the case of no children), or
    - at least one child is Solved.
    """
    systems = [case["system"] for case in cases]
    if any(s[STATUS] == "Solved" for s in systems):
        return True
    return all(s[STATUS] == "Contradictory" for s in systems)


def is_open_status(status):
    """Server currently emits both spellings for open goals."""
    return status in ("Undetermined", "Undertermined")


def prove_bfs(c, theory_kind, theory_index, lemma, max_steps=1000, verbose=False):
    """
    Proves a lemma by performing a BFS over the proof tree.

    At each open proof goal (constraint system with status "Undetermined"),
    the proof method at index 0 is applied. The resulting cases are enqueued
    as new open goals unless the step is already complete.

    A step is complete if all children are Contradictory (including no
    children) or at least one child is Solved.

    Returns (True, proof_tree) on success, (False, None) on failure.

    The proof_tree is a nested dict matching the schema expected by the
    check_proof API:
        { "action":   <base64-encoded proof method | "solved" | "contradictory">
        , "children": { "<caseName>": <child proof_tree>, ... }
        }
    """
    response = c.get_initial_constraint_system(theory_kind, theory_index, lemma)
    if not response.ok:
        print(f"[prove_bfs] Failed to get initial constraint system: {response.text}")
        return False, None

    initial = json.loads(response.text)

    if initial[STATUS] in ("Solved", "Contradictory"):
        print("[prove_bfs] Lemma is trivially proved.")
        return True, make_leaf(initial[STATUS])

    # Each BFS entry is (system, proof_node) where proof_node is a dict that
    # will be filled in-place when the system is processed.
    root_node = {}
    queue = deque([(initial, root_node)])
    steps = 0

    while queue:
        if steps >= max_steps:
            print(
                f"[prove_bfs] Reached step limit ({max_steps}) with "
                f"{len(queue)} open constraint system(s) remaining."
            )
            return False, None

        current, node = queue.popleft()

        methods = current.get(ENCODED_METHODS, [])
        if not methods:
            print("[prove_bfs] No proof methods available for a constraint system.")
            return False, None

        method = methods[0]
        response = c.apply_proofmethod_to_system(
            theory_kind, theory_index, lemma, method, current[ENCODED_SYS]
        )
        if not response.ok:
            print(f"[prove_bfs] Applying proof method failed: {response.text}")
            return False, None

        result = json.loads(response.text)
        # New endpoint returns a list of cases directly; keep backward
        # compatibility with a wrapped {"cases": [...]} payload.
        if isinstance(result, list):
            cases = result
        elif isinstance(result, dict):
            cases = result.get("cases", [])
        else:
            print(f"[prove_bfs] Unexpected execute-method payload: {type(result)}")
            return False, None
        steps += 1

        # Populate this proof node with the applied method and its children.
        node["action"] = method
        node["children"] = {}

        if verbose:
            pretty = current.get(PRETTY_METHODS, [])
            method_name = pretty[0] if pretty else method[:20]
            print(
                f"[prove_bfs] step {steps:4d}: applied '{method_name}' "
                f"-> {len(cases)} case(s), {len(queue)} open constraint system(s)"
            )

        complete_step = is_complete(cases)
        has_solved_child = any(case["system"][STATUS] == "Solved" for case in cases)

        for case in cases:
            case_name = case["caseName"]
            sub = case["system"]
            sub_status = sub[STATUS]

            if complete_step:
                if sub_status in ("Solved", "Contradictory"):
                    node["children"][case_name] = make_leaf(sub_status)
                elif has_solved_child:
                    # This branch is not needed once a solved child exists.
                    continue
                else:
                    print(
                        "[prove_bfs] Complete step contained an open child "
                        "without any solved child."
                    )
                    return False, None
            elif is_open_status(sub_status):
                child_node = {}
                node["children"][case_name] = child_node
                queue.append((sub, child_node))
            else:
                node["children"][case_name] = make_leaf(sub_status)

    print(f"[prove_bfs] Proof complete in {steps} step(s).")
    return True, root_node


def new_endpoints():
    print_banner("Tamarin Proof API Example")
    # Starting the Tamarin client
    c = TamarinClient()

    # Assuming the Tamarin server with our API is running at the default address, we can now
    # interact with it using the client. For example, we can get an overview of the loaded theories
    r = c.get_server_overview()

    # Printing it
    r = json.loads(r.text)

    # Tamarin theories have a name, a kind, and an index. The kind and index are needed
    # since Tamarin internally loads the theories and uses this to index them.
    print(r)

    # Choosing the tutorial theory for demonstration purposes.
    # We can now get an overview of the theory, which includes the lemmas it contains.
    theory = r["Tutorial"]
    theory_kind = theory[THEORY_KIND]
    theory_index = theory[THEORY_INDEX]
    r = json.loads(c.get_theory_overview(theory_kind, theory_index).text)

    # The overview is very verbose as it contains a lot of information that we used
    # during development which is not necessary for the examples.
    # However, you can use it to learn which lemmas a theory contains.
    # print(r)

    # Focusing on this lemma
    lemma = "Client_session_key_honest_setup"
    # Getting the initial consraint system for this lemma, which includes the
    # proof methods that can be applied to it.
    r = json.loads(
        c.get_initial_constraint_system(theory_kind, theory_index, lemma).text
    )

    # Inspecting the pretty-printed proof methods.
    print("Proofmethods:")
    print(r[PROOF_METHODS])

    # Inspecting the encoded proof methods.
    print("Encoded proofmethods:")
    print(r[ENCODED_METHODS])

    # Applying a proofmethod to the system.
    # We apply the first proof method returned by the server. You can implement
    # any logic to pick it though.
    # Note that we use the encoded system and method.
    r = c.apply_proofmethod_to_system(
        theory_kind,
        theory_index,
        lemma,
        r[ENCODED_METHODS][0],
        r[ENCODED_SYS],
    )

    # Checking the response
    print("After applying first proof method:\n")
    response = json.loads(r.text)
    # The reponse is a list of cases, where each case contains a name and the
    # resulting system after applying the proof method to the initial system.
    print(response)
    for i, case in enumerate(response):
        print(f"Case {i}:")
        print(f"  Name: {case['caseName']}")
        print(
            f"  System: {case['system']['encodedSys'][:30]}... with status {case['system'][STATUS]}"
        )
        print(f"  Available proof methods: {case['system']['proofMethods']}")


if __name__ == "__main__":
    # The examples assume that you have a modified Tamarin server running
    # at the default address

    # Showing raw endpoint interaction
    # new_endpoints()

    # Prove a lemma via BFS over the proof tree
    print_banner("BFS Proof")
    c = TamarinClient()
    r = json.loads(c.get_server_overview().text)
    theory = r["Tutorial"]
    theory_kind = theory[THEORY_KIND]
    theory_index = theory[THEORY_INDEX]
    # A universal lemma
    # lemma = "Client_auth_injective"
    # An existential lemma
    lemma = "Client_session_key_honest_setup"
    successful, proof_tree = prove_bfs(
        c, theory_kind, theory_index, lemma, verbose=True
    )
    if successful:
        check_r = c.check_proof(
            theory_kind, theory_index, lemma, json.dumps(proof_tree)
        )
        print(f"Checking proof for lemma '{lemma}'...")
        response = json.loads(check_r.text)
        # TraceFound means that there is a trace
        # CompleteProof means that there is no trace.
        # Depending on whether the property is existential or universal, the former
        # or the later proofs the property, respectively.
        print(f"Proof status: {response['proofStatus']}")
