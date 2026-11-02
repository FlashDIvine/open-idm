#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
DIST_DIR="$ROOT_DIR/dist"
KEYSTORE="$HOME/.android/debug.keystore"

echo "================================================================="
echo " Building LIDM Android (APK Package)"
echo " Standalone Mobile Edition - No Root Required"
echo "================================================================="

mkdir -p "$DIST_DIR"

# 1. Verify build tools
if ! command -v apktool >/dev/null 2>&1; then
    echo "[-] Error: apktool is not installed."
    exit 1
fi

if ! command -v zipalign >/dev/null 2>&1; then
    echo "[-] Error: zipalign is not installed."
    exit 1
fi

if ! command -v apksigner >/dev/null 2>&1; then
    echo "[-] Error: apksigner is not installed."
    exit 1
fi

# 2. Build APK with apktool
echo "[+] Assembling Smali bytecode and resources with apktool..."
apktool b "$ANDROID_DIR" -o "$DIST_DIR/LIDM-Android-unsigned.apk"

# 3. Zipalign APK (4-byte alignment)
echo "[+] Aligning APK boundaries with zipalign..."
zipalign -p -f 4 "$DIST_DIR/LIDM-Android-unsigned.apk" "$DIST_DIR/LIDM-Android-v1.0.0.apk"
rm -f "$DIST_DIR/LIDM-Android-unsigned.apk"

# 4. Sign APK with v1, v2, v3 schemes
if [ -f "$KEYSTORE" ]; then
    echo "[+] Signing APK with debug.keystore (v1, v2, v3)..."
    apksigner sign --ks "$KEYSTORE" --ks-pass pass:android "$DIST_DIR/LIDM-Android-v1.0.0.apk"
    apksigner verify -v "$DIST_DIR/LIDM-Android-v1.0.0.apk"
fi

echo ""
echo "================================================================="
echo " Build Succeeded!"
echo " Output APK: $DIST_DIR/LIDM-Android-v1.0.0.apk"
echo "================================================================="
