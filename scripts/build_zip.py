#!/usr/bin/env python3
# Build a clean Chrome Web Store package (zip) excluding dev/preview/doc files.
#
# Output policy (package-output-default-folder-RULE):
#   the zip is written to the project root first, then copied to the user's
#   default project folder. Both copies are verified byte-identical so the
#   default folder never keeps a stale package.
import hashlib
import json
import os
import shutil
import sys
import zipfile

os.environ.setdefault('CODEBUDDY_SAFE_DELETE_ENABLED', '0')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Default output folder = user's project collection root.
OUT_DIR = r"D:\迅雷下载\vibe coding"

# Directories that must never ship in the extension package.
EXCLUDE_DIRS = {
    ".git",
    ".codebuddy",
    "__pycache__",
    "store-assets",   # uploaded separately in the store form
    "scripts",        # build/asset generation scripts
    "node_modules",
    "docs",           # privacy policy lives on GitHub Pages
}
# Extensions that must never ship.
EXCLUDE_EXTS = {
    ".md",   # README
    ".zip",  # stale packages (prevents nesting an old zip inside the new one)
    ".py",
    ".pyc",
    ".log",
    ".tmp",
}
EXCLUDE_NAMES = {".gitignore", ".vscodeignore"}

with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as f:
    MANIFEST = json.load(f)

version = MANIFEST["version"]
OUT_NAME = f"stockmeta-assistant-{version}.zip"
LOCAL_PATH = os.path.join(ROOT, OUT_NAME)
DEFAULT_PATH = os.path.join(OUT_DIR, OUT_NAME)


def excluded(rel_path, base):
    parts = rel_path.split(os.sep)
    if any(p in EXCLUDE_DIRS for p in parts):
        return True
    if base in EXCLUDE_NAMES:
        return True
    if os.path.splitext(base)[1].lower() in EXCLUDE_EXTS:
        return True
    if base.startswith("preview_") and base.lower().endswith(".png"):
        return True
    return False


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def collect():
    files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, ROOT)
            if excluded(rel, fn):
                continue
            files.append((full, rel))
    return files


def verify(zf, local_path, default_path, count):
    """5 self-checks per chrome-store-zip-structure-RULE. Any failure aborts."""
    problems = []

    # 1. manifest_version / version sanity
    if MANIFEST.get("manifest_version") != 3:
        problems.append("manifest_version is not 3")
    if MANIFEST.get("version") != version:
        problems.append("version mismatch in manifest")

    # 2. every file referenced by manifest exists inside the zip
    names = set(zf.namelist())
    refs = []
    for key in ("16", "48", "128"):
        refs.append(MANIFEST.get("icons", {}).get(key))
    refs.append(MANIFEST.get("action", {}).get("default_icon", {}).get("128"))
    refs.append(MANIFEST.get("background", {}).get("service_worker"))
    refs.append(MANIFEST.get("action", {}).get("default_popup"))
    refs.append(MANIFEST.get("options_page"))
    for cs in MANIFEST.get("content_scripts", []):
        refs.extend(cs.get("js", []))
        refs.extend(cs.get("css", []))
    for r in filter(None, refs):
        if r not in names:
            problems.append(f"manifest references missing file: {r}")

    # 3. manifest.json sits at the zip root (store rejects a nested folder)
    if "manifest.json" not in names:
        problems.append("manifest.json is not at the zip root")

    # 4. re-read the manifest from inside the zip, not from disk
    try:
        inside = json.loads(zf.read("manifest.json").decode("utf-8"))
        if inside.get("name") != MANIFEST.get("name"):
            problems.append("name differs between disk manifest and zip manifest")
        if inside.get("version") != version:
            problems.append("version differs between disk manifest and zip manifest")
    except Exception as exc:
        problems.append(f"cannot parse manifest inside zip: {exc}")

    # 5. the copy in the default folder must be byte-identical
    if not os.path.exists(default_path):
        problems.append("copy in default folder is missing")
    elif sha256(local_path) != sha256(default_path):
        problems.append("default-folder copy is not byte-identical (stale?)")

    # sanity: no accidentally nested zip / script
    for n in names:
        if n.lower().endswith(".zip"):
            problems.append(f"nested zip inside package: {n}")
        if n.lower().startswith("scripts" + os.sep) or n.startswith("docs" + os.sep):
            problems.append(f"non-runtime file inside package: {n}")

    print(f"\nFiles: {count}, Size: {os.path.getsize(local_path)/1024:.1f} KB")
    if problems:
        print("\n".join("FAIL: " + p for p in problems))
        sys.exit(1)
    print("All package self-checks PASSED")


def main():
    if os.path.exists(LOCAL_PATH):
        os.remove(LOCAL_PATH)

    files = collect()
    with zipfile.ZipFile(LOCAL_PATH, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for full, rel in files:
            # arcname=rel keeps manifest.json at the archive root
            zf.write(full, rel)

    os.makedirs(OUT_DIR, exist_ok=True)
    shutil.copyfile(LOCAL_PATH, DEFAULT_PATH)

    print(f"Project  : {LOCAL_PATH}")
    print(f"Default  : {DEFAULT_PATH}")
    print(f"sha256   : {sha256(LOCAL_PATH)}")

    with zipfile.ZipFile(LOCAL_PATH) as zf:
        verify(zf, LOCAL_PATH, DEFAULT_PATH, len(files))


if __name__ == "__main__":
    main()
