#!/usr/bin/env python3
"""Restore the original SIPANDU launcher icon from its preserved repository asset."""
from base64 import b64decode
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
SOURCE_B64 = ROOT / "scripts" / "assets" / "sipandu-original-app-icon.b64"
TARGET = ROOT / "public" / "uploads" / "App Icon Picture.png"


def main() -> None:
    if not SOURCE_B64.is_file():
        raise SystemExit("Arsip ikon asli SIPANDU tidak ditemukan: " + str(SOURCE_B64))
    try:
        encoded = "".join(SOURCE_B64.read_text(encoding="ascii").split())
        data = b64decode(encoded, validate=True)
    except Exception as exc:
        raise SystemExit("Arsip ikon asli SIPANDU rusak: " + str(exc)) from exc
    if len(data) < 1000 or data[:8] != bytes.fromhex("89504e470d0a1a0a"):
        raise SystemExit("Arsip ikon asli SIPANDU bukan PNG yang valid.")
    width, height = struct.unpack(">II", data[16:24])
    if width < 64 or height < 64:
        raise SystemExit(f"Resolusi ikon asli terlalu kecil: {width}x{height}")
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_bytes(data)
    if TARGET.read_bytes() != data:
        raise SystemExit("Pemulihan ikon asli SIPANDU gagal diverifikasi.")
    print(f"Original SIPANDU app icon restored exactly: {TARGET.relative_to(ROOT)} ({width}x{height})")


if __name__ == "__main__":
    main()
