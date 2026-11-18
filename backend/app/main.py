"""FastAPI application entry point for VideoIntegrity."""

from __future__ import annotations

import asyncio
import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import CORS_ORIGINS, DB_PATH
from app.database.db import IntegrityDatabase
from app.models.schemas import APIError
from app.routes import chain, stream, tamper, verify, ws
from app.services import security_integration
from app.services.video_capture import VideoCaptureManager
from app.services.ws_manager import WebSocketManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("videointegrity.main")


class AppContext:
    """Shared backend service container attached to app.state.ctx."""

    def __init__(self, db_path: Path | str = DB_PATH) -> None:
        self.db = IntegrityDatabase(db_path=db_path)
        self.ws = WebSocketManager()
        self.capture = VideoCaptureManager(db=self.db, ws_manager=self.ws)
        self._alert_lock = threading.Lock()
        self._alert_seq = 0

    def next_alert_seq(self) -> int:
        with self._alert_lock:
            self._alert_seq += 1
            return self._alert_seq


def create_app(db_path: Optional[Path | str] = None) -> FastAPI:
    """Application factory supporting custom DB paths for testing and production."""
    resolved_db_path = db_path if db_path is not None else DB_PATH

    @asynccontextmanager
    async def lifespan(fastapi_app: FastAPI) -> AsyncIterator[None]:
        ctx = fastapi_app.state.ctx
        ctx.ws.set_event_loop(asyncio.get_running_loop())
        logger.info(
            "VideoIntegrity backend started (db=%s, persisted_records=%d, "
            "verification_module=%s, tamper_module=%s)",
            ctx.db.db_path,
            ctx.db.get_summary()["total_records"],
            security_integration.is_verification_available(),
            security_integration.is_tamper_available(),
        )
        try:
            yield
        finally:
            ctx.capture.stop(allow_idle=True)
            logger.info("VideoIntegrity backend shut down cleanly.")

    fastapi_app = FastAPI(
        title="VideoIntegrity API",
        description="Real-Time Video Integrity Monitoring System using SHA-256 Hash Chaining",
        version="1.0.0",
        lifespan=lifespan,
    )
    fastapi_app.state.ctx = AppContext(db_path=resolved_db_path)

    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @fastapi_app.exception_handler(APIError)
    async def api_error_handler(_request: Request, exc: APIError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
        )

    @fastapi_app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid request parameters or JSON payload.",
                    "details": {"errors": exc.errors()},
                }
            },
        )

    @fastapi_app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        _request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": f"HTTP_{exc.status_code}",
                    "message": str(exc.detail),
                    "details": {},
                }
            },
        )

    @fastapi_app.exception_handler(Exception)
    async def unhandled_exception_handler(
        _request: Request, exc: Exception
    ) -> JSONResponse:
        logger.exception("Unhandled server exception: %s", exc)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An unexpected internal server error occurred.",
                    "details": {},
                }
            },
        )

    @fastapi_app.get("/health", tags=["health"])
    async def health_check() -> dict[str, object]:
        return {
            "status": "ok",
            "verification_module_loaded": security_integration.is_verification_available(),
            "tamper_module_loaded": security_integration.is_tamper_available(),
        }

    fastapi_app.include_router(stream.router)
    fastapi_app.include_router(chain.router)
    fastapi_app.include_router(verify.router)
    fastapi_app.include_router(tamper.router)
    fastapi_app.include_router(ws.router)

    return fastapi_app


app = create_app()
