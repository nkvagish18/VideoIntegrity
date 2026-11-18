"""Unit tests verifying SHA-256 golden test vectors from docs/API_CONTRACT.md."""

from __future__ import annotations

from app.security import verification
from app.services import hashing


def test_verification_reuses_shared_hashing_functions() -> None:
    """Confirm verification.py imports shared hashing utilities instead of duplicating rules."""
    assert verification.GENESIS_HASH == hashing.GENESIS_HASH == "0" * 64
    assert verification.compute_frame_hash is hashing.compute_frame_hash
    assert verification.canonical_json is hashing.canonical_json
    assert verification.compute_chain_hash is hashing.compute_chain_hash


def test_golden_vector_1_genesis_frame() -> None:
    fb1 = b"VideoIntegrity-test-frame-1"
    ts1 = "2026-11-18T10:00:00.000Z"

    fh1 = verification.compute_frame_hash(fb1)
    assert fh1 == "c32872a33b9346c21836772de1ba37723d132f39a49f1058ce0ef1614a7436fe"

    cj1 = verification.canonical_json(1, ts1, fh1, verification.GENESIS_HASH).decode("utf-8")
    assert (
        cj1
        == '{"frame_hash":"c32872a33b9346c21836772de1ba37723d132f39a49f1058ce0ef1614a7436fe",'
        '"frame_id":1,'
        '"previous_hash":"0000000000000000000000000000000000000000000000000000000000000000",'
        '"timestamp":"2026-11-18T10:00:00.000Z"}'
    )

    ch1 = verification.compute_chain_hash(1, ts1, fh1, verification.GENESIS_HASH)
    assert ch1 == "4e8db6e9abf3678546f40acd4d0deb5720e5152dc702abcf5baa5327ab15af14"


def test_golden_vector_2_chained_frame() -> None:
    fb2 = b"VideoIntegrity-test-frame-2"
    ts2 = "2026-11-18T10:00:00.500Z"
    prev_hash = "4e8db6e9abf3678546f40acd4d0deb5720e5152dc702abcf5baa5327ab15af14"

    fh2 = verification.compute_frame_hash(fb2)
    assert fh2 == "504c50139c605e56384a36e01d3aebb1c99bd05ce9327014bc835824c143beff"

    cj2 = verification.canonical_json(2, ts2, fh2, prev_hash).decode("utf-8")
    assert (
        cj2
        == '{"frame_hash":"504c50139c605e56384a36e01d3aebb1c99bd05ce9327014bc835824c143beff",'
        '"frame_id":2,'
        '"previous_hash":"4e8db6e9abf3678546f40acd4d0deb5720e5152dc702abcf5baa5327ab15af14",'
        '"timestamp":"2026-11-18T10:00:00.500Z"}'
    )

    ch2 = verification.compute_chain_hash(2, ts2, fh2, prev_hash)
    assert ch2 == "8977be4f7320b8edb7682d1dd8b48e743071f7d3626a257c0da639cdc1267640"
