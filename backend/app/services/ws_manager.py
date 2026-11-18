"""WebSocket connection registry and thread-safe event broadcaster."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from fastapi import WebSocket

from app.services.hashing import utc_now_iso

logger = logging.getLogger("videointegrity.ws")


class WebSocketManager:
    """Manages active /ws/live clients and broadcasts contract-compliant event envelopes."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_event_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    @property
    def client_count(self) -> int:
        return len(self._connections)

    @staticmethod
    def build_envelope(event: str, data: dict[str, Any]) -> dict[str, Any]:
        return {
            "event": event,
            "timestamp": utc_now_iso(),
            "data": data,
        }

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)

    async def send_to_client(
        self, websocket: WebSocket, event: str, data: dict[str, Any]
    ) -> None:
        payload = self.build_envelope(event, data)
        try:
            await websocket.send_json(payload)
        except Exception:
            await self.disconnect(websocket)

    async def broadcast(self, event: str, data: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._connections)
        if not targets:
            return

        payload = self.build_envelope(event, data)
        dead: list[WebSocket] = []

        for ws in targets:
            try:
                await ws.send_json(payload)
            except Exception as exc:
                logger.debug("Removing disconnected WebSocket client: %s", exc)
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    self._connections.discard(ws)

    def broadcast_threadsafe(self, event: str, data: dict[str, Any]) -> None:
        """Schedule a broadcast safely from a background capture thread."""
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            asyncio.run_coroutine_threadsafe(self.broadcast(event, data), loop)
        except Exception as exc:
            logger.debug("Failed to schedule WebSocket broadcast: %s", exc)
