from pathlib import Path
import subprocess
import sys
import tempfile

print("SIPANDU Android branding: starting asset generator", flush=True)

ROOT = Path(__file__).resolve().parents[1]
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
SOURCE_ICON = ROOT / "public" / "uploads" / "App Icon Picture.png"
BACKGROUND = "#0b140c"

# Pillow is only a CI build-time tool; it is not packaged into the Android app.
_PIL_TMP = tempfile.TemporaryDirectory(prefix="sipandu-android-assets-")
try:
    from PIL import Image, ImageDraw
except ImportError:
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "--disable-pip-version-check",
        "--target", _PIL_TMP.name, "Pillow"
    ])
    sys.path.insert(0, _PIL_TMP.name)
    from PIL import Image, ImageDraw

print("SIPANDU Android branding: Pillow ready", flush=True)
if not SOURCE_ICON.is_file():
    raise FileNotFoundError(f"Official SIPANDU app icon not found: {SOURCE_ICON}")
if not ANDROID_RES.is_dir():
    raise FileNotFoundError(f"Android resources not found: {ANDROID_RES}")

with Image.open(SOURCE_ICON) as source_image:
    source_image.load()
    source = source_image.convert("RGBA")
if source.width < 256 or source.height < 256:
    raise ValueError(f"App icon must be at least 256x256; received {source.size}")
print(f"SIPANDU Android branding: source icon dimensions {source.size}", flush=True)

# Density sizes: standard launcher icon and adaptive foreground (108 dp).
densities = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}
for density, (icon_size, foreground_size) in densities.items():
    folder = ANDROID_RES / f"mipmap-{density}-v4"
    folder.mkdir(parents=True, exist_ok=True)

    base_icon = source.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    base_icon.save(folder / "ic_launcher.png", optimize=True)

    round_icon = base_icon.copy()
    mask = Image.new("L", (icon_size, icon_size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, icon_size - 1, icon_size - 1), fill=255)
    round_icon.putalpha(mask)
    round_icon.save(folder / "ic_launcher_round.png", optimize=True)

    # Place artwork in the center safe zone so launcher masks do not crop it.
    foreground_canvas = Image.new("RGBA", (foreground_size, foreground_size), (0, 0, 0, 0))
    inner_size = int(foreground_size * 0.76)
    foreground = source.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
    offset = ((foreground_size - inner_size) // 2, (foreground_size - inner_size) // 2)
    foreground_canvas.alpha_composite(foreground, offset)
    foreground_canvas.save(folder / "ic_launcher_foreground.png", optimize=True)

colors_file = ANDROID_RES / "values" / "sipandu_icon_colors.xml"
colors_file.parent.mkdir(parents=True, exist_ok=True)
colors_file.write_text(
    "\n".join([
        '<?xml version="1.0" encoding="utf-8"?>',
        '<resources>',
        '  <color name="sipandu_launcher_background">#0b140c</color>',
        '</resources>',
    ]) + "\n",
    encoding="utf-8",
)

adaptive_dir = ANDROID_RES / "mipmap-anydpi-v26"
adaptive_dir.mkdir(parents=True, exist_ok=True)
adaptive_xml = "\n".join([
    '<?xml version="1.0" encoding="utf-8"?>',
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
    '    <background android:drawable="@color/sipandu_launcher_background" />',
    '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />',
    '</adaptive-icon>',
]) + "\n"
(adaptive_dir / "ic_launcher.xml").write_text(adaptive_xml, encoding="utf-8")
(adaptive_dir / "ic_launcher_round.xml").write_text(adaptive_xml, encoding="utf-8")

# Replace the Capacitor starter splash art while preserving generated dimensions.
splash_files = [ANDROID_RES / "drawable" / "splash.png"]
splash_files.extend(ANDROID_RES.glob("drawable-port-*/splash.png"))
splash_files.extend(ANDROID_RES.glob("drawable-land-*/splash.png"))
splash_files = [path for path in splash_files if path.is_file()]
if not splash_files:
    print("SIPANDU Android branding: no generated PNG splash resources found; keeping native XML splash defaults.", flush=True)

for splash_path in splash_files:
    print(f"SIPANDU Android branding: replacing {splash_path.name}", flush=True)
    with Image.open(splash_path) as current:
        current.load()
        width, height = current.size
    splash = Image.new("RGBA", (width, height), BACKGROUND)
    logo_size = max(1, int(min(width, height) * 0.34))
    logo = source.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    splash.alpha_composite(logo, ((width - logo_size) // 2, (height - logo_size) // 2))
    splash.convert("RGB").save(splash_path, optimize=True)

expected = [
    *(ANDROID_RES / f"mipmap-{density}-v4" / "ic_launcher.png" for density in densities),
    *(ANDROID_RES / f"mipmap-{density}-v4" / "ic_launcher_foreground.png" for density in densities),
    adaptive_dir / "ic_launcher.xml",
    adaptive_dir / "ic_launcher_round.xml",
    colors_file,
    *splash_files,
]
missing = [str(path.relative_to(ROOT)) for path in expected if not path.is_file() or path.stat().st_size == 0]
if missing:
    raise RuntimeError("Android branding assets missing/empty: " + ", ".join(missing))
print(
    f"Generated SIPANDU launcher icons at {len(densities)} densities, adaptive icon XML, "
    f"and {len(splash_files)} native splash resources.", flush=True
)
