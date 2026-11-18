"""Tamper simulation & reset routes: /api/tamper/simulate, /api/tamper/reset."""

from __future__ import annotations

from fastapi import APIRouter, Body, Request

from app.config import GENESIS_HASH
from app.models.schemas import (
    APIError,
    IntegrityStatus,
    TamperResetRequest,
    TamperResetResponse,
    TamperSimulateRequest,
    TamperSimulateResponse,
    TamperType,
    VerificationReport,
)
from app.routes.verify import build_tamper_alert_payload
from app.services import security_integration
from app.services.hashing import utc_now_iso

router = APIRouter(prefix="/api/tamper", tags=["tamper"])


@router.post("/simulate", response_model=TamperSimulateResponse)
async def simulate_tamper_endpoint(
    request: Request,
    payload: TamperSimulateRequest,
) -> TamperSimulateResponse:
    try:
        tamper_type = TamperType(payload.tamper_type)
    except ValueError as exc:
        raise APIError(
            status_code=400,
            code="INVALID_TAMPER_TYPE",
            message=f"Unsupported tamper_type '{payload.tamper_type}'.",
            details={"allowed_tamper_types": [t.value for t in TamperType]},
        ) from exc

    ctx = request.app.state.ctx
    records = ctx.db.get_all_records()

    if len(records) == 0:
        raise APIError(
            status_code=409,
            code="INSUFFICIENT_FRAMES",
            message="Cannot simulate tamper on an empty chain. Start the stream first.",
        )
    if tamper_type == TamperType.REORDER_RECORDS and len(records) < 2:
        raise APIError(
            status_code=409,
            code="INSUFFICIENT_FRAMES",
            message="reorder_records requires at least 2 stored frames.",
            details={"total_records": len(records)},
        )

    # Confirm Laptop 3's modules are available before mutating DB or saving snapshot
    if not security_integration.is_tamper_available():
        security_integration.run_tamper_simulation(
            records,
            ctx.db.read_frame_bytes,
            ctx.db.write_frame_bytes,
            tamper_type=tamper_type.value,
        )
    if not security_integration.is_verification_available():
        security_integration.run_verification(records, ctx.db.read_frame_bytes)

    snapshot_available = ctx.db.save_snapshot_if_missing()

    try:
        mutated_records, tamper_meta = security_integration.run_tamper_simulation(
            records,
            ctx.db.read_frame_bytes,
            ctx.db.write_frame_bytes,
            tamper_type=tamper_type.value,
            target_frame_id=payload.target_frame_id,
            swap_with_frame_id=payload.swap_with_frame_id,
            details=payload.details,
        )
    except KeyError as exc:
        raise APIError(
            status_code=404,
            code="FRAME_NOT_FOUND",
            message=str(exc.args[0]) if exc.args else "Requested frame_id not found.",
            details={
                "target_frame_id": payload.target_frame_id,
                "swap_with_frame_id": payload.swap_with_frame_id,
            },
        ) from exc
    except ValueError as exc:
        raise APIError(
            status_code=409,
            code="INSUFFICIENT_FRAMES",
            message=str(exc),
        ) from exc

    ctx.db.replace_records(mutated_records)
    ctx.db.record_tamper_applied()

    latest_records = ctx.db.get_all_records()
    report_dict = security_integration.run_verification(
        latest_records,
        ctx.db.read_frame_bytes,
        genesis_hash=GENESIS_HASH,
    )
    report = VerificationReport(**report_dict)

    ctx.db.update_integrity_state(
        integrity_status=report.status.value,
        valid_records=report.valid_records,
        compromised_records=report.compromised_records,
    )

    report_data = report.model_dump(mode="json")
    alert_data = build_tamper_alert_payload(
        report_data,
        tamper_type=tamper_type.value,
        alert_counter=ctx.next_alert_seq(),
    )
    await ctx.ws.broadcast("tamper_alert", alert_data)
    await ctx.ws.broadcast("verification_result", report_data)
    await ctx.ws.broadcast("integrity_update", ctx.capture.get_integrity_dict())

    return TamperSimulateResponse(
        tamper_id=str(tamper_meta["tamper_id"]),
        tamper_type=tamper_type,
        target_frame_id=int(tamper_meta["target_frame_id"]),
        affected_frame_ids=[int(fid) for fid in tamper_meta["affected_frame_ids"]],
        applied_at=str(tamper_meta["applied_at"]),
        snapshot_available=snapshot_available,
        message=str(tamper_meta["message"]),
        verification=report,
    )


@router.post("/reset", response_model=TamperResetResponse)
async def reset_tamper_endpoint(
    request: Request,
    payload: TamperResetRequest = Body(default_factory=TamperResetRequest),
) -> TamperResetResponse:
    ctx = request.app.state.ctx
    reset_at = utc_now_iso()

    if payload.clear_all:
        ctx.db.clear_all()
        report: VerificationReport | None = None
        if security_integration.is_verification_available():
            report_dict = security_integration.run_verification(
                [],
                ctx.db.read_frame_bytes,
                genesis_hash=GENESIS_HASH,
            )
            report = VerificationReport(**report_dict)
            await ctx.ws.broadcast("verification_result", report.model_dump(mode="json"))

        await ctx.ws.broadcast("integrity_update", ctx.capture.get_integrity_dict())
        await ctx.ws.broadcast("stream_status", ctx.capture.get_status_dict())

        return TamperResetResponse(
            reset_mode="clear_all",
            restored_records=0,
            reset_at=reset_at,
            integrity_status=IntegrityStatus.EMPTY,
            message="Cleared all stored frames, hash-chain records, and snapshots.",
            verification=report,
        )

    reset_mode, restored_records = ctx.db.restore_snapshot()
    report = None
    if security_integration.is_verification_available():
        records = ctx.db.get_all_records()
        report_dict = security_integration.run_verification(
            records,
            ctx.db.read_frame_bytes,
            genesis_hash=GENESIS_HASH,
        )
        report = VerificationReport(**report_dict)
        ctx.db.update_integrity_state(
            integrity_status=report.status.value,
            valid_records=report.valid_records,
            compromised_records=report.compromised_records,
        )
        await ctx.ws.broadcast("verification_result", report.model_dump(mode="json"))

    summary = ctx.db.get_summary()
    integrity_status = IntegrityStatus(summary["integrity_status"])
    await ctx.ws.broadcast("integrity_update", ctx.capture.get_integrity_dict())

    msg = (
        "Restored chain and frame bytes from pre-tamper snapshot."
        if reset_mode == "restore_snapshot"
        else "No active tamper snapshot to restore; current chain state retained."
    )
    return TamperResetResponse(
        reset_mode=reset_mode,
        restored_records=restored_records,
        reset_at=reset_at,
        integrity_status=integrity_status,
        message=msg,
        verification=report,
    )
