#!/usr/bin/env python3
# Build a clean Chrome Web Store package (zip) excluding dev/preview/doc files.
import os
import zipfile
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as f:
    version = json.load(f)["version"]

OUT_NAME = f"stockmeta-assistant-{version}.zip"
OUT_DIR = r"D:\迅雷下载\vibe coding"
OUT_PATH = os.path.join(OUT_DIR, OUT_NAME)

EXCLUDE_DIRS = {".git", ".codebuddy", "__pycache__", "store-assets", "scripts", "node_modules"}
EXCLUDE_EXT = {".md"}
EXCLUDE_NAMES = {"preview_*.png", ".gitignore", "*.md"}


def excluded(name, dirpath):
    base = os.path.basename(name)
    if base in EXCLUDE_DIRS:
        return True
    if base.lower().endswith(".md"):
        return True
    if base == ".gitignore":
        return True
    if base.startswith("preview_") and base.lower().endswith(".png"):
        return True
    return False


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    if os.path.exists(OUT_PATH):
        os.remove(OUT_PATH)
    count = 0
    with zipfile.ZipFile(OUT_PATH, "w", zipfile.ZIP_DEFLATED) as z:
        for dirpath, dirnames, filenames in os.walk(ROOT):
            # prune excluded dirs in place
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
            for fn in filenames:
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, ROOT)
                parts = rel.split(os.sep)
                if any(p in EXCLUDE_DIRS for p in parts):
                    continue
                if excluded(fn, dirpath):
                    continue
                z.write(full, rel)
                count += 1
    size = os.path.getsize(OUT_PATH)
    print(f"Created {OUT_PATH}")
    print(f"Files: {count}, Size: {size/1024:.1f} KB")


if __name__ == "__main__":
    main()
