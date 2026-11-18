"""Security verification and tamper simulation package (owned by Laptop 3)."""

from .tamper import (
    TAMPER_TYPES,
    IsolatedTamperSimulator,
    mutate_frame_bytes,
    simulate_tamper,
)
from .verification import (
    GENESIS_HASH,
    canonical_json,
    compute_chain_hash,
    compute_frame_hash,
    verify_chain,
)

__all__ = [
    "GENESIS_HASH",
    "IsolatedTamperSimulator",
    "TAMPER_TYPES",
    "canonical_json",
    "compute_chain_hash",
    "compute_frame_hash",
    "mutate_frame_bytes",
    "simulate_tamper",
    "verify_chain",
]
