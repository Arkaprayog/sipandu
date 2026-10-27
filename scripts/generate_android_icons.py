#!/usr/bin/env python3
"""Generate Android launcher resources from SIPANDU's approved uploaded icon.

Source of truth: public/uploads/App Icon Picture.png.
No alternate/drawn logo is substituted. The source artwork is resized with
LANCZOS and kept fully visible; classic and adaptive Android launcher assets
are produced in all required density buckets.
"""
from pathlib import Path
import subprocess
import sys
import tempfile

_PILLOW_TMP = tempfile.TemporaryDirectory(prefix="sipandu-icon-deps-")
try:
    from PIL import Image, ImageDraw, ImageOps
except ImportError:
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "--disable-pip-version-check",
        "--upgrade", "--target", _PILLOW_TMP.name, "Pillow",
    ])
    sys.path.insert(0, _PILLOW_TMP.name)
    from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "uploads" / "App Icon Picture.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
BACKGROUND = (11, 20, 12, 255)  # SIPANDU dark forest green, #0B140C
DENSITIES = (
    ("mdpi", 1),
    ("hdpi", 3 / 2),
    ("xhdpi", 2),
    ("xxhdpi", 3),
    ("xxxhdpi", 4),
)


def compose_icon(size: int, scale: float, background: tuple[int, int, int, int]) -> Image.Image:
    """Fit the source inside a square canvas without cropping source artwork."""
    with Image.open(SOURCE) as opened:
        artwork = ImageOps.exif_transpose(opened).convert("RGBA")
    artwork.thumbnail(
        (max(1, round(size * scale)), max(1, round(size * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (size, size), background)
    canvas.alpha_composite(
        artwork,
        ((size - artwork.width) // 2, (size - artwork.height) // 2),
    )
    return canvas


def save_icon(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Ikon resmi aplikasi tidak ditemukan: {SOURCE}")
    try:
        with Image.open(SOURCE) as opened:
            width, height = opened.size
            if width < 64 or height < 64:
                raise SystemExit(f"Resolusi ikon sumber terlalu kecil: {width}x{height}")
            opened.verify()
    except SystemExit:
        raise
    except Exception as exc:
        raise SystemExit(f"Ikon sumber tidak dapat dibaca: {exc}") from exc

    # Classic launcher bitmaps are 48dp icons and should use most of the canvas.
    # Adaptive foregrounds are 108dp canvases, with artwork kept inside the
    # Android launcher safe zone so circular/squircle masks do not cut it off.
    for density, factor in DENSITIES:
        classic_size = round(48 * factor)
        adaptive_size = round(108 * factor)
        bucket = RES / f"mipmap-{density}-v4"
        classic = compose_icon(classic_size, 0.92, BACKGROUND)
        save_icon(classic, bucket / "ic_launcher.png")
        round_icon = classic.copy()
        round_mask = Image.new("L", (classic_size, classic_size), 0)
        ImageDraw.Draw(round_mask).ellipse((0, 0, classic_size - 1, classic_size - 1), fill=255)
        round_icon.putalpha(round_mask)
        save_icon(round_icon, bucket / "ic_launcher_round.png")
        foreground = compose_icon(adaptive_size, 0.67, (0, 0, 0, 0))
        save_icon(foreground, bucket / "ic_launcher_foreground.png")

    adaptive = RES / "mipmap-anydpi-v26"
    adaptive.mkdir(parents=True, exist_ok=True)
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/sipandu_launcher_background" />\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '</adaptive-icon>\n'
    )
    (adaptive / "ic_launcher.xml").write_text(xml, encoding="utf-8")
    (adaptive / "ic_launcher_round.xml").write_text(xml, encoding="utf-8")

    values = RES / "values"
    values.mkdir(parents=True, exist_ok=True)
    (values / "sipandu_launcher_colors.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        '    <color name="sipandu_launcher_background">#0B140C</color>\n'
        '</resources>\n',
        encoding="utf-8",
    )

    expected = [
        *(RES / f"mipmap-{density}-v4" / "ic_launcher.png" for density, _ in DENSITIES),
        *(RES / f"mipmap-{density}-v4" / "ic_launcher_round.png" for density, _ in DENSITIES),
        *(RES / f"mipmap-{density}-v4" / "ic_launcher_foreground.png" for density, _ in DENSITIES),
        RES / "mipmap-anydpi-v26" / "ic_launcher.xml",
        RES / "mipmap-anydpi-v26" / "ic_launcher_round.xml",
        RES / "values" / "sipandu_launcher_colors.xml",
    ]
    missing = [str(path.relative_to(ROOT)) for path in expected if not path.is_file() or path.stat().st_size == 0]
    if missing:
        raise SystemExit("Launcher resource generation incomplete: " + ", ".join(missing))
    print(
        f"Android launcher icons generated from {SOURCE.relative_to(ROOT)} "
        f"({width}x{height}); classic, round, and adaptive resources verified."
    )


if __name__ == "__main__":
    main()
