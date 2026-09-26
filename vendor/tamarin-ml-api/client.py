import requests
import json

THEORY_INDEX = "theoryIndex"
THEORY_KIND = "theoryKind"
THEORY_NAME = "theoryName"
THEORY_RAW = "theoryRaw"
LEMMAS = "lemmas"
LEMMA_NAME = "name"
PROOF_STATE = "proofState"
QUANTIFIER = "quantifier"
CASES = "cases"
CHOSEN_PROOF_METHOD = "chosenProofMethod"
PROOF_STATUS = "proofStatus"
CONSTRAINT_SYSTEM = "constraintSystem"
PROOF_METHODS = "proofMethods"
NEW_THEORY_INDEX = "newTheoryIndex"
NEXT_PROOF_PATH = "nextProofpath"
PROOF_METHOD_NAME = "name"
SIDE = "side"
PRETTY_METHODS = "prettyMethods"
ENCODED_METHODS = "encodedMethods"
ENCODED_SYS = "encodedSys"
CANONICAL_SYS = "canonicalSys"
STATUS = "status"


class TamarinClient:
    # Ip -> Port -> Route
    server_overview_route = "http://{}:{}"
    # Ip -> Port -> TheoryKind -> TheoryIdx -> Route
    theory_overview_route = "http://{}:{}/thy/{}/{}/overview/help"
    # Ip -> Port -> TheoryKind -> TheoryIdx -> LemmaName -> Route
    initial_constraint_system_route = "http://{}:{}/thy/{}/{}/initialcs/{}"
    # Ip -> Port -> TheoryKind -> TheoryIdx -> LemmaName -> Route
    apply_proofmethod_to_system_route = "http://{}:{}/thy/{}/{}/executemethod/{}"
    # Ip -> Port -> TheoryKind -> TheoryIdx -> LemmaName -> Route
    check_proof_route = "http://{}:{}/thy/{}/{}/checkproof/{}"

    def __init__(self, ip_addr="127.0.0.1", port="3001"):
        self.ip_addr = ip_addr
        self.port = port

    def get_initial_constraint_system(self, theory_kind, theory_index, lemma):
        """
        Gets the initial constraint system for a given lemma.

        Returns a _System_ JSON with the following schema:
        { prettyMethods: [String] } -- The proofmethods pretty printed for RL
        { encodedMethods: [String] } -- The proofmethods encoded in base64
        { encodedSys: String } -- The constraint system encoded in base64
        { canonicalSys: String } -- The canonical constraint system encoded in base64.
        { status: ("Solved" | "Contradictory" | "Undetermined") }
        This can be used to compare constraint systems for equality.
        """
        return requests.get(
            self.initial_constraint_system_route.format(
                self.ip_addr, self.port, theory_kind, theory_index, lemma
            )
        )

    def apply_proofmethod_to_system(
        self, theory_kind, theory_index, lemma, proof_method, system
    ):
        """
        Applies a proofmethod to a given constraint system. Can fail returning
        an error message in the HTTP response.

        Returns a JSON with the following schema on success:
        { cases: [ { caseName: String, system: System } ] }
        See above for the schema of System.

        The 'cases' array contains all resulting cases after applying the proof
        method to the given system. Each case has a name and the resulting system.

        The proof_method and system parameters are expected to be the base64
        encoded versions of the proof method and system, respectively, as
        returned by the get_initial_constraint_system function.
        """
        route = self.apply_proofmethod_to_system_route.format(
            self.ip_addr, self.port, theory_kind, theory_index, lemma
        )
        return requests.post(
            route,
            data={"proofmethod": proof_method, "system": system},
        )

    def get_server_overview(self):
        """
        Gets an overview of the loaded protocol models, called theories, of the
        interactive Tamarin server.

        Returns a JSON with the following schema:
        { String: [ { 'theoryIndex': Int, 'theoryKind': ('trace' | 'diff'), 'theoryName': String } ] }

        where the strings used as index are the names of the loaded theories.
        NOTE: that this is not the name of the `.spthy` file. It is the name of the
        model inside of the file!

        Each entry in the JSON array corresponds to a protocol model. The 'theoryIndex'
        is used for index access to the model, the 'theoryKind' defines whether
        the model deals with trace or observational equivalence properties, and
        the 'theoryName' is the user-chosen name of the theory.
        """
        return requests.get(self.server_overview_route.format(self.ip_addr, self.port))

    def get_theory_overview(self, theory_kind, theory_index):
        """
        Gets an overview of the theory status.

        Returns a JSON with the following schema:
        { 'theoryRaw': String -- The raw string of the theory
        , 'lemmas': [ Lemma ] -- The list of lemmas
        }

        where

        Lemma = { 'name': String                                -- The name of the lemma
                , 'proofState': Proof                           -- The (partial) proof of the lemma
                , 'quantifier': ('AllTraces' | 'ExistsTrace') } -- The quantifier of the lemma
                , 'side': ('LHS' | 'RHS') -- Only for diff theories

        Proof = { 'cases': [ Proof ]
                , 'chosenProofMethod': ProofMethod
                , 'proofStatus': (IncompleteProof | CompleteProof
                                 | TraceFound | InvalidatedProof
                                 | UnfinishableProof | UndeterminedProof)
                , 'constraintSystem': String
                , 'proofMethods': [ ProofMethod ]
                }
        """
        # Renaming the diff returned by serialization on the server side
        # to the actual path the server expects. Don't know why
        # they went with 'equiv' instead of 'diff'.
        if theory_kind == "diff":
            theory_kind = "equiv"

        return requests.get(
            self.theory_overview_route.format(
                self.ip_addr, self.port, theory_kind, theory_index
            )
        )

    def check_proof(self, theory_kind, theory_index, lemma, proof):
        """
        Checks whether a given proof is correct for a given lemma.

        Returns a JSON with the following schema:
        { proofSize: Int } -- The size of the proof
        { proofFile: String } -- The Tamarin model file containing the proof
        { proofStatus: "CompleteProof" | "TraceFound" | "UnfinishableProof" | "InvalidatedProof" } -- The status of the proof
        "CompleteProof" indicates that no counterexample could be found and the proof is complete.
        "TraceFound" indicates that a counterexample was found.
        "UnfinishableProof" indicates that the proof could not be finished for internal reasons of Tamarin. Very rare.
        "InvalidatedProof" indicates that the proof was invalidated.

        """
        route = self.check_proof_route.format(
            self.ip_addr, self.port, theory_kind, theory_index, lemma
        )
        return requests.post(route, data={"proof": proof})
