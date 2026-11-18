"""Backend runtime configuration for VideoIntegrity."""

from __future__ import annotations

import os
from pathlib import Path

GENESIS_HASH: str = "0" * 64
DEFAULT_ENCODING: str = "image/jpeg"
DEFAULT_FPS: float = 2.0
DEFAULT_JPEG_QUALITY: int = 85

BACKEND_ROOT: Path = Path(__file__).resolve().parent.parent
DATA_DIR: Path = Path(
    os.getenv("VIDEOINTEGRITY_DATA_DIR", str(BACKEND_ROOT / "data"))
)
DB_PATH: Path = Path(
    os.getenv("VIDEOINTEGRITY_DB_PATH", str(DATA_DIR / "videointegrity.db"))
)

HOST: str = os.getenv("VIDEOINTEGRITY_HOST", "0.0.0.0")
PORT: int = int(os.getenv("VIDEOINTEGRITY_PORT", "8000"))

CORS_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv("VIDEOINTEGRITY_CORS_ORIGINS", "*").split(",")
    if origin.strip()
]
