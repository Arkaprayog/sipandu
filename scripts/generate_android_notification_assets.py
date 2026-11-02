#!/usr/bin/env python3
"""Generate original Android notification assets for SIPANDU's native app."""
from pathlib import Path
import math
import struct
import wave

ROOT = Path("android/app/src/main/res")
RAW = ROOT / "raw"
DRAWABLE = ROOT / "drawable"
RAW.mkdir(parents=True, exist_ok=True)
DRAWABLE.mkdir(parents=True, exist_ok=True)

# Short original two-tone notification chime. Kept intentionally quiet and brief.
sample_rate = 44100
notes = [(784.0, 0.16), (0.0, 0.07), (988.0, 0.20)]
samples = []
for frequency, duration in notes:
    count = int(sample_rate * duration)
    for i in range(count):
        if frequency == 0:
            sample = 0.0
        else:
            edge = min(1.0, i / (sample_rate * 0.012), (count - i - 1) / (sample_rate * 0.035))
            envelope = max(0.0, edge) ** 0.8
            sample = 0.22 * envelope * math.sin(2.0 * math.pi * frequency * i / sample_rate)
        samples.append(max(-1.0, min(1.0, sample)))

wav_path = RAW / "sipandu_notification.wav"
with wave.open(str(wav_path), "wb") as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(sample_rate)
    wav.writeframes(b"".join(struct.pack("<h", int(value * 32767)) for value in samples))

# Android status-bar small icons must be monochrome/alpha. Use a vector bell.
icon_path = DRAWABLE / "ic_stat_sipandu.xml"
icon_path.write_text("""<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M12,22c1.1,0 2,-0.9 2,-2h-4c0,1.1 0.9,2 2,2zM18,16v-5c0,-3.07 -1.63,-5.64 -4.5,-6.32V4a1.5,1.5 0,0 0,-3 0v0.68C7.63,5.36 6,7.92 6,11v5l-2,2v1h16v-1z" />
</vector>
""", encoding="utf-8")

assert wav_path.stat().st_size > 1000
assert icon_path.stat().st_size > 100
print(f"Generated {wav_path} ({wav_path.stat().st_size} bytes)")
print(f"Generated {icon_path}")
