#!/bin/bash
# Fetch script for Stitch designs from Google Cloud Storage
# Handles redirects and security handshakes

URL="$1"
OUTPUT="$2"

if [ -z "$URL" ] || [ -z "$OUTPUT" ]; then
    echo "Usage: $0 <url> <output_path>"
    exit 1
fi

# Create output directory if needed
mkdir -p "$(dirname "$OUTPUT")"

# Download with curl, following redirects
curl -L -o "$OUTPUT" "$URL"

if [ $? -eq 0 ]; then
    echo "Downloaded: $OUTPUT"
else
    echo "Failed to download"
    exit 1
fi
