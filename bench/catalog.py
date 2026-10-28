"""Compatibility shim: the catalog is generated from bench.registry."""
from .registry import HEURISTICS, catalog

CATALOG = catalog()
