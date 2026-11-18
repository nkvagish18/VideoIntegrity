"""Integration bridge to Laptop 3's verification.py and tamper.py modules.

IMPORTANT:
- Laptop 3 owns backend/app/security/verification.py and backend/app/security/tamper.py.
- This module NEVER duplicates verification or tamper logic; it strictly imports
  and delegates to Laptop 3's modules according to docs/DEVELOPMENT_GUIDE.md.
"""

from __future__ import annotations

import importlib
import sys
from typing import Any, Callable, Optional

from app.config import GENESIS_HASH
from app.models.schemas import APIError


def _load_security_module(module_name: str) -> Any:
    """Dynamically import Laptop 3's security module if present on disk."""
    full_name = f"app.security.{module_name}"
    try:
        if full_name in sys.modules:
            return sys.modules[full_name]
        return importlib.import_module(full_name)
    except ModuleNotFoundError as exc:
        if exc.name in (full_name, "app.security"):
            raise APIError(
                status_code=503,
                code="SECURITY_MODULE_UNAVAILABLE",
                message=(
                    f"Laptop 3's security module 'backend/app/security/{module_name}.py' "
                    "is not yet present in this branch. Merge Laptop 3's 'security' branch to enable."
                ),
                details={"missing_module": full_name},
            ) from exc
        raise


def is_verification_available() -> bool:
    try:
        mod = _load_security_module("verification")
        return callable(getattr(mod, "verify_chain", None))
    except APIError:
        return False


def is_tamper_available() -> bool:
    try:
        mod = _load_security_module("tamper")
        return callable(getattr(mod, "simulate_tamper", None))
    except APIError:
        return False


def run_verification(
    records: list[dict[str, Any]],
    frame_bytes_loader: Callable[[int], Optional[bytes]],
    *,
    start_frame_id: Optional[int] = None,
    end_frame_id: Optional[int] = None,
    genesis_hash: str = GENESIS_HASH,
) -> dict[str, Any]:
    """Delegate chain & frame-byte verification to Laptop 3's verification.verify_chain."""
    verification_mod = _load_security_module("verification")
    verify_fn = getattr(verification_mod, "verify_chain", None)
    if not callable(verify_fn):
        raise APIError(
            status_code=500,
            code="INTERNAL_ERROR",
            message="app.security.verification.verify_chain is missing or not callable.",
        )
    return verify_fn(
        records,
        frame_bytes_loader,
        start_frame_id=start_frame_id,
        end_frame_id=end_frame_id,
        genesis_hash=genesis_hash,
    )


def run_tamper_simulation(
    records: list[dict[str, Any]],
    read_frame_bytes: Callable[[int], Optional[bytes]],
    write_frame_bytes: Callable[[int, bytes], None],
    *,
    tamper_type: str,
    target_frame_id: Optional[int] = None,
    swap_with_frame_id: Optional[int] = None,
    details: Optional[dict[str, Any]] = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Delegate tamper simulation to Laptop 3's tamper.simulate_tamper."""
    tamper_mod = _load_security_module("tamper")
    simulate_fn = getattr(tamper_mod, "simulate_tamper", None)
    if not callable(simulate_fn):
        raise APIError(
            status_code=500,
            code="INTERNAL_ERROR",
            message="app.security.tamper.simulate_tamper is missing or not callable.",
        )
    return simulate_fn(
        records,
        read_frame_bytes,
        write_frame_bytes,
        tamper_type=tamper_type,
        target_frame_id=target_frame_id,
        swap_with_frame_id=swap_with_frame_id,
        details=details,
    )
