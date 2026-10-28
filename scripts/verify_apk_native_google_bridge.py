#!/usr/bin/env python3
"""Verify the native Google OAuth Activity bridge in the built APK's DEX bytecode."""
from __future__ import annotations
import struct
import sys
import zipfile
from pathlib import Path

TARGET_ACTIVITY = "Lid/my/sipandu/odhiv/MainActivity;"
REQUIRED_INTERFACE = "Lee/forgr/capacitor/social/login/ModifiedMainActivityForSocialLoginPlugin;"
REQUIRED_METHOD = "IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin"

def uleb128(data: bytes, offset: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while True:
        if offset >= len(data) or shift > 35:
            raise ValueError("invalid/truncated ULEB128")
        byte = data[offset]
        offset += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, offset
        shift += 7

def dex_strings(data: bytes) -> list[str]:
    size, offset = struct.unpack_from("<II", data, 56)
    strings = []
    for index in range(size):
        string_data_off = struct.unpack_from("<I", data, offset + index * 4)[0]
        _, cursor = uleb128(data, string_data_off)
        end = data.index(b"\0", cursor)
        strings.append(data[cursor:end].decode("utf-8", errors="replace"))
    return strings

def check_dex(data: bytes) -> tuple[bool, str]:
    strings = dex_strings(data)
    type_count, type_offset = struct.unpack_from("<II", data, 64)
    types = [strings[struct.unpack_from("<I", data, type_offset + i * 4)[0]] for i in range(type_count)]
    method_count, method_offset = struct.unpack_from("<II", data, 88)
    method_names = []
    for i in range(method_count):
        _, _, name_idx = struct.unpack_from("<HHI", data, method_offset + i * 8)
        method_names.append(strings[name_idx])
    class_count, class_offset = struct.unpack_from("<II", data, 96)
    for i in range(class_count):
        off = class_offset + i * 32
        class_idx, _, _, interfaces_off = struct.unpack_from("<IIII", data, off)
        if types[class_idx] != TARGET_ACTIVITY:
            continue
        implemented = []
        if interfaces_off:
            count = struct.unpack_from("<I", data, interfaces_off)[0]
            implemented = [types[struct.unpack_from("<H", data, interfaces_off + 4 + j * 2)[0]] for j in range(count)]
        if REQUIRED_INTERFACE not in implemented:
            return False, f"{TARGET_ACTIVITY} does not implement {REQUIRED_INTERFACE}"
        class_data_off = struct.unpack_from("<I", data, off + 24)[0]
        if not class_data_off:
            return False, f"{TARGET_ACTIVITY} has no class data"
        cursor = class_data_off
        _, cursor = uleb128(data, cursor) # static fields
        _, cursor = uleb128(data, cursor) # instance fields
        direct_methods, cursor = uleb128(data, cursor)
        virtual_methods, cursor = uleb128(data, cursor)
        found_method = False
        for count in (direct_methods, virtual_methods):
            method_index = 0
            for _ in range(count):
                diff, cursor = uleb128(data, cursor)
                _, cursor = uleb128(data, cursor) # access flags
                _, cursor = uleb128(data, cursor) # code offset
                method_index += diff
                if method_index < len(method_names) and method_names[method_index] == REQUIRED_METHOD:
                    found_method = True
        if not found_method:
            return False, f"{TARGET_ACTIVITY} does not declare {REQUIRED_METHOD}"
        return True, f"{TARGET_ACTIVITY} implements {REQUIRED_INTERFACE} and declares {REQUIRED_METHOD}"
    return False, f"{TARGET_ACTIVITY} not found in this DEX"

def main() -> int:
    if len(sys.argv) != 2:
        print(f"Usage: {Path(sys.argv[0]).name} <apk>", file=sys.stderr)
        return 2
    apk = Path(sys.argv[1])
    if not apk.is_file():
        print(f"APK not found: {apk}", file=sys.stderr)
        return 2
    try:
        with zipfile.ZipFile(apk) as archive:
            dex_files = sorted(name for name in archive.namelist() if name.endswith(".dex"))
            errors = []
            for name in dex_files:
                ok, message = check_dex(archive.read(name))
                if ok:
                    print(f"Native Google scope bridge verified in {apk} ({name}): {message}")
                    return 0
                errors.append(f"{name}: {message}")
            print("Native Google scope bridge verification failed: " + "; ".join(errors), file=sys.stderr)
            return 1
    except (OSError, zipfile.BadZipFile, struct.error, ValueError, IndexError) as error:
        print(f"Could not inspect APK DEX files: {error}", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
