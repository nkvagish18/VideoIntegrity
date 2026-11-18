"""Verification REST route: POST /api/verify (delegates to Laptop 3's verification.py)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Body, Request

from app.config import GENESIS_HASH
from app.models.schemas import (
    AlertSeverity,
    APIError,
    VerificationReport,
    VerifyRequest,
)
from app.services import security_integration

router = APIRouter(prefix="/api", tags=["verification"])


def build_tamper_alert_payload(
    report: dict[str, Any],
    *,
    tamper_type: Optional[str] = None,
    alert_counter: int = 1,
) -> dict[str, Any]:
    """Construct a tamper_alert WebSocket payload matching API_CONTRACT.md Section 6.4."""
    violations = report.get("violations", [])
    affected_ids = sorted(
        {
            int(v["frame_id"])
            for v in violations
            if isinstance(v, dict) and v.get("frame_id") is not None
        }
    )
    now_tag = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    alert_id = f"alt_{now_tag}_{alert_counter:03d}"

    violation_types = sorted(
        {
            str(v.get("violation_type", "UNKNOWN"))
            for v in violations
            if isinstance(v, dict)
        }
    )
    if affected_ids:
        frame_desc = (
            f"frame {affected_ids[0]}"
            if len(affected_ids) == 1
            else f"frames {', '.join(str(fid) for fid in affected_ids[:5])}"
        )
    else:
        frame_desc = "chain"
    vtype_desc = ", ".join(violation_types) if violation_types else "INTEGRITY_VIOLATION"
    summary = f"Integrity compromised on {frame_desc}: {vtype_desc} detected."

    return {
        "alert_id": alert_id,
        "severity": AlertSeverity.CRITICAL.value,
        "tamper_type": tamper_type,
        "affected_frame_ids": affected_ids,
        "violation_count": len(violations),
        "summary": summary,
        "violations": violations,
    }


@router.post("/verify", response_model=VerificationReport)
async def verify_chain_endpoint(
    request: Request,
    payload: VerifyRequest = Body(default_factory=VerifyRequest),
) -> VerificationReport:
    if (
        payload.start_frame_id is not None
        and payload.end_frame_id is not None
        and payload.start_frame_id > payload.end_frame_id
    ):
        raise APIError(
            status_code=400,
            code="VALIDATION_ERROR",
            message="start_frame_id must be less than or equal to end_frame_id.",
            details={
                "start_frame_id": payload.start_frame_id,
                "end_frame_id": payload.end_frame_id,
            },
        )

    ctx = request.app.state.ctx
    records = ctx.db.get_all_records()

    report_dict = security_integration.run_verification(
        records,
        ctx.db.read_frame_bytes,
        start_frame_id=payload.start_frame_id,
        end_frame_id=payload.end_frame_id,
        genesis_hash=GENESIS_HASH,
    )
    report = VerificationReport(**report_dict)

    ctx.db.update_integrity_state(
        integrity_status=report.status.value,
        valid_records=report.valid_records,
        compromised_records=report.compromised_records,
    )

    report_data = report.model_dump(mode="json")
    await ctx.ws.broadcast("verification_result", report_data)
    await ctx.ws.broadcast("integrity_update", ctx.capture.get_integrity_dict())

    if not report.is_valid:
        alert_data = build_tamper_alert_payload(
            report_data,
            tamper_type=None,
            alert_counter=ctx.next_alert_seq(),
        )
        await ctx.ws.broadcast("tamper_alert", alert_data)

    return report
