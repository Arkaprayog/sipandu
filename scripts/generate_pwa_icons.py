#!/usr/bin/env python3
"""Generate PWA/iOS icons from the official uploaded SIPANDU ODHIV logo.

Source of truth: public/uploads/sipandu-odhiv-logo.webp.
The uploaded composition is preserved; only pixel dimensions are resized.
"""
from pathlib import Path
import subprocess
import sys
import tempfile

_PILLOW_TMP = tempfile.TemporaryDirectory(prefix="sipandu-pwa-icon-deps-")
try:
    from PIL import Image, ImageOps
except ImportError:
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "--disable-pip-version-check",
        "--upgrade", "--target", _PILLOW_TMP.name, "Pillow",
    ])
    sys.path.insert(0, _PILLOW_TMP.name)
    from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "uploads" / "sipandu-odhiv-logo.webp"
OUTPUT = ROOT / "public" / "icons"
ICONS = {
    "sipandu-icon-192.png": 192,
    "sipandu-icon-512.png": 512,
    "sipandu-apple-touch-icon.png": 180,
    "sipandu-favicon.png": 48,
}


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Logo sumber SIPANDU tidak ditemukan: {SOURCE}")
    try:
        with Image.open(SOURCE) as opened:
            width, height = opened.size
            if width < 512 or height < 512:
                raise SystemExit(f"Resolusi logo sumber terlalu kecil: {width}x{height}")
            opened.verify()
        with Image.open(SOURCE) as opened:
            artwork = ImageOps.exif_transpose(opened).convert("RGB")
    except SystemExit:
        raise
    except Exception as exc:
        raise SystemExit(f"Logo sumber tidak dapat dibaca: {exc}") from exc

    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, size in ICONS.items():
        icon = artwork.resize((size, size), Image.Resampling.LANCZOS)
        target = OUTPUT / name
        icon.save(target, format="PNG", optimize=True)
        if not target.is_file() or target.stat().st_size < 1000:
            raise SystemExit(f"Ikon tidak berhasil dibuat: {target}")
        with Image.open(target) as check:
            if check.size != (size, size):
                raise SystemExit(f"Ukuran ikon salah pada {target}: {check.size}")
    print(
        f"PWA/iOS/favicon icons generated from {SOURCE.relative_to(ROOT)} "
        f"({width}x{height}); {len(ICONS)} icon files verified."
    )


if __name__ == "__main__":
    main()
