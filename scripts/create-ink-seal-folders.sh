#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Ink & Seal Notary Pros — Dropbox Folder Structure Setup
#  Run this script once on your local Mac or Linux machine.
#  Usage:  bash create-ink-seal-folders.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

# ── 1. Locate Dropbox ────────────────────────────────────────────────────────
DROPBOX=""

# Check Dropbox config file first (most reliable)
for config in \
    "$HOME/.dropbox/info.json" \
    "$HOME/Library/Application Support/Dropbox/info.json"
do
    if [ -f "$config" ]; then
        # Extract the "path" value from the JSON
        DROPBOX=$(grep -o '"path": *"[^"]*"' "$config" | head -1 | sed 's/"path": *"//' | sed 's/"//')
        break
    fi
done

# Fall back to common default locations
if [ -z "$DROPBOX" ]; then
    for candidate in \
        "$HOME/Dropbox" \
        "$HOME/Library/CloudStorage/Dropbox"
    do
        if [ -d "$candidate" ]; then
            DROPBOX="$candidate"
            break
        fi
    done
fi

if [ -z "$DROPBOX" ]; then
    echo "ERROR: Could not locate your Dropbox folder."
    echo "Please open Dropbox preferences, find the local folder path,"
    echo "then re-run this script with:"
    echo "  DROPBOX_PATH=\"/your/dropbox/path\" bash create-ink-seal-folders.sh"
    exit 1
fi

# Allow manual override via environment variable
if [ -n "$DROPBOX_PATH" ]; then
    DROPBOX="$DROPBOX_PATH"
fi

echo "Dropbox found at: $DROPBOX"

# ── 2. Define root folder ────────────────────────────────────────────────────
ROOT="$DROPBOX/Ink & Seal Notary Pros"

# ── 3. Create main workflow folders ─────────────────────────────────────────
FOLDERS=(
    "01 - New Intake Submissions"
    "02 - Pending Review"
    "03 - Awaiting Payment"
    "04 - Awaiting Original Documents"
    "05 - Awaiting RON"
    "06 - Approved For Processing"
    "07 - Submitted For Apostille"
    "08 - Completed Orders"
    "09 - Rejected - On Hold"
    "10 - Internal Templates & Forms"
)

for folder in "${FOLDERS[@]}"; do
    target="$ROOT/$folder"
    if [ ! -d "$target" ]; then
        mkdir -p "$target"
        echo "  Created: $target"
    else
        echo "  Exists (skipped): $target"
    fi
done

# ── 4. Create Client Folder Template subfolders ──────────────────────────────
TEMPLATE_ROOT="$ROOT/10 - Internal Templates & Forms/Client Folder Template"

TEMPLATE_FOLDERS=(
    "01 - Uploaded Documents"
    "02 - RON Documents"
    "03 - Shipping Labels"
    "04 - Apostille Submission"
    "05 - Completed Documents"
    "06 - Client Communication"
)

for folder in "${TEMPLATE_FOLDERS[@]}"; do
    target="$TEMPLATE_ROOT/$folder"
    if [ ! -d "$target" ]; then
        mkdir -p "$target"
        echo "  Created: $target"
    else
        echo "  Exists (skipped): $target"
    fi
done

# ── 5. Create README.txt ─────────────────────────────────────────────────────
README="$ROOT/README.txt"

if [ ! -f "$README" ]; then
cat > "$README" <<'README_CONTENT'
CLIENT FOLDER NAMING FORMAT:
ORDER# - CLIENT NAME - DOCUMENT TYPE


EXAMPLES:
INS-1001 - John Smith - Birth Certificate
INS-1002 - Maria Lopez - POA
INS-1003 - David Jones - Passport Copy


RECOMMENDED FILE NAMING FORMAT:
ORDER#_DOCUMENTTYPE_DATE


EXAMPLES:
INS1001_BirthCertificate_2026-05-28.pdf
INS1002_POA_2026-05-28.pdf
INS1003_PassportCopy_2026-05-28.pdf
README_CONTENT
    echo "  Created: $README"
else
    echo "  Exists (skipped): $README"
fi

# ── 6. Summary ───────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────"
echo "COMPLETE. Folder structure created at:"
echo ""
echo "  $ROOT"
echo ""
echo "Structure:"
find "$ROOT" | sed "s|$ROOT||" | sort | sed 's|/[^/]*$|  &|' | grep -v "^$" | sed 's|^  /|  |'
echo "────────────────────────────────────────────────────────"
