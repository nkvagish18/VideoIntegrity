"""Frame and hash-chain retrieval routes: GET /api/frames, GET /api/chain."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query, Request

from app.config import GENESIS_HASH
from app.models.schemas import (
    ChainListResponse,
    ChainRecord,
    FrameItem,
    FramesListResponse,
    IntegrityStatus,
)

router = APIRouter(prefix="/api", tags=["chain"])


@router.get("/frames", response_model=FramesListResponse)
async def get_frames(
    request: Request,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    include_image: bool = Query(default=False),
    order: Literal["asc", "desc"] = Query(default="desc"),
) -> FramesListResponse:
    ctx = request.app.state.ctx
    total, items = ctx.db.get_frames_page(
        limit=limit,
        offset=offset,
        order=order,
        include_image=include_image,
    )
    return FramesListResponse(
        total=total,
        limit=limit,
        offset=offset,
        frames=[FrameItem(**item) for item in items],
    )


@router.get("/chain", response_model=ChainListResponse)
async def get_chain(
    request: Request,
    limit: int = Query(default=200, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
) -> ChainListResponse:
    ctx = request.app.state.ctx
    total, records = ctx.db.get_chain_page(limit=limit, offset=offset)
    summary = ctx.db.get_summary()
    return ChainListResponse(
        genesis_hash=GENESIS_HASH,
        total_records=total,
        limit=limit,
        offset=offset,
        integrity_status=IntegrityStatus(summary["integrity_status"]),
        latest_chain_hash=summary["latest_chain_hash"],
        records=[ChainRecord(**rec) for rec in records],
    )
