"""Stream lifecycle REST routes: /api/stream/start, /api/stream/stop, /api/stream/status."""

from __future__ import annotations

from fastapi import APIRouter, Body, Request

from app.models.schemas import (
    StreamStartRequest,
    StreamStartResponse,
    StreamStatusResponse,
    StreamStopResponse,
)

router = APIRouter(prefix="/api/stream", tags=["stream"])


@router.post("/start", response_model=StreamStartResponse)
async def start_stream(
    request: Request,
    payload: StreamStartRequest = Body(default_factory=StreamStartRequest),
) -> StreamStartResponse:
    ctx = request.app.state.ctx
    result = ctx.capture.start(
        source=payload.source,
        fps=payload.fps,
        device_index=payload.device_index,
        file_path=payload.file_path,
        reset_existing=payload.reset_existing,
        jpeg_quality=payload.jpeg_quality,
    )
    return StreamStartResponse(**result)


@router.post("/stop", response_model=StreamStopResponse)
async def stop_stream(request: Request) -> StreamStopResponse:
    ctx = request.app.state.ctx
    result = ctx.capture.stop(allow_idle=False)
    return StreamStopResponse(**result)


@router.get("/status", response_model=StreamStatusResponse)
async def get_stream_status(request: Request) -> StreamStatusResponse:
    ctx = request.app.state.ctx
    return StreamStatusResponse(**ctx.capture.get_status_dict())
