#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
KEYSTORE_DIR="$ANDROID_DIR/keystore"

STORE_PASSWORD="${ECHOMAP_KEYSTORE_PASSWORD:-}"
if [[ -z "$STORE_PASSWORD" ]]; then
  echo "Missing ECHOMAP_KEYSTORE_PASSWORD"
  echo "Example:"
  echo "  export ECHOMAP_KEYSTORE_PASSWORD='your-strong-password'"
  echo "  export ECHOMAP_KEY_PASSWORD='your-strong-password'   # optional, defaults to store password"
  echo "  export ECHOMAP_KEY_ALIAS='echomap'                   # optional"
  echo "  npm run android:setup-signing:local"
  exit 1
fi

KEY_ALIAS="${ECHOMAP_KEY_ALIAS:-echomap}"
KEY_PASSWORD="${ECHOMAP_KEY_PASSWORD:-$STORE_PASSWORD}"
KEYSTORE_FILE="${ECHOMAP_KEYSTORE_FILE:-$KEYSTORE_DIR/echomap-release.jks}"
DNAME="${ECHOMAP_KEY_DNAME:-CN=EchoMap, OU=Mobile, O=EchoMap, L=Shanghai, ST=Shanghai, C=CN}"

mkdir -p "$(dirname "$KEYSTORE_FILE")"

if [[ ! -f "$KEYSTORE_FILE" ]]; then
  "$ROOT_DIR/tools/jdk21/Contents/Home/bin/keytool" -genkeypair -v \
    -keystore "$KEYSTORE_FILE" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass "$STORE_PASSWORD" \
    -keypass "$KEY_PASSWORD" \
    -dname "$DNAME"
  echo "Created keystore: $KEYSTORE_FILE"
else
  echo "Keystore already exists: $KEYSTORE_FILE"
fi

REL_KEYSTORE_PATH="$KEYSTORE_FILE"
if [[ "$KEYSTORE_FILE" == "$ANDROID_DIR/"* ]]; then
  REL_KEYSTORE_PATH="${KEYSTORE_FILE#"$ANDROID_DIR/"}"
fi

cat > "$ANDROID_DIR/keystore.properties" <<EOF
storeFile=$REL_KEYSTORE_PATH
storePassword=$STORE_PASSWORD
keyAlias=$KEY_ALIAS
keyPassword=$KEY_PASSWORD
EOF

chmod 600 "$ANDROID_DIR/keystore.properties"
echo "Wrote $ANDROID_DIR/keystore.properties"
echo "Release signing is now configured."

