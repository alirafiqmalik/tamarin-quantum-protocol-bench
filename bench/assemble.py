"""Compatibility shim: assembly now lives in bench.registry and bench.protocols."""
from .protocols.qkd import WORK, clean_theory, assemble as assemble_qkd  # noqa: F401
from .protocols.qsend import theory_text as quantum_send_theory, assemble as assemble_qsend  # noqa: F401
from .registry import assemble  # noqa: F401
