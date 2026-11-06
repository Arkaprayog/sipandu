#!/usr/bin/env python3
"""Ensure generated Capacitor Android manifest requests accurate foreground GPS."""
from pathlib import Path
import re

manifest = Path("android/app/src/main/AndroidManifest.xml")
if not manifest.is_file():
    raise SystemExit(f"Android manifest not found: {manifest}")

content = manifest.read_text(encoding="utf-8")
required = [
    (
        r'<uses-permission\b[^>]*android:name="android.permission.ACCESS_COARSE_LOCATION"',
        '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    ),
    (
        r'<uses-permission\b[^>]*android:name="android.permission.ACCESS_FINE_LOCATION"',
        '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    ),
    (
        r'<uses-feature\b[^>]*android:name="android.hardware.location.gps"',
        '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />',
    ),
]

missing = [element for pattern, element in required if not re.search(pattern, content)]
if missing:
    application = re.search(r"(?m)^\s*<application\b", content)
    if not application:
        raise SystemExit("Could not find <application> in generated AndroidManifest.xml.")
    content = content[:application.start()] + "\n".join(missing) + "\n" + content[application.start():]
    manifest.write_text(content, encoding="utf-8")

verified = manifest.read_text(encoding="utf-8")
not_found = [element for pattern, element in required if not re.search(pattern, verified)]
if not_found:
    raise SystemExit("Precise GPS permissions are still missing from AndroidManifest.xml.")

print("Verified Android foreground location permissions:")
print(" - ACCESS_COARSE_LOCATION")
print(" - ACCESS_FINE_LOCATION")
print(" - android.hardware.location.gps (optional hardware feature)")
