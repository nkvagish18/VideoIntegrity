"""WebSocket route: ws://HOST:8000/ws/live."""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/live")
async def websocket_live(websocket: WebSocket) -> None:
    ctx = websocket.app.state.ctx
    await ctx.ws.connect(websocket)

    try:
        # Hydrate newly connected client immediately per API_CONTRACT.md Section 6
        await ctx.ws.send_to_client(
            websocket, "stream_status", ctx.capture.get_status_dict()
        )
        await ctx.ws.send_to_client(
            websocket, "integrity_update", ctx.capture.get_integrity_dict()
        )

        while True:
            message = await websocket.receive_json()
            if isinstance(message, dict) and message.get("event") == "ping":
                await ctx.ws.send_to_client(websocket, "pong", {})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await ctx.ws.disconnect(websocket)
