#!/usr/bin/env bash
set -euo pipefail

# MoFix Auto Tester (macOS-safe bash edition)
# - Zips each subfolder in --input
# - Uploads to MoFix server via /upload
# - Saves responses per case and a CSV summary
#
# Usage:
#   ./mofix-auto-tester.sh --input ./cases --server http://localhost:3000 [--pattern '*/'] [--out ./reports]

INPUT_DIR=""
SERVER_URL=""
OUT_DIR="./mofix_reports"
PATTERN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)   INPUT_DIR="$2"; shift 2;;
    --server)  SERVER_URL="$2"; shift 2;;
    --pattern) PATTERN="$2"; shift 2;;
    --out)     OUT_DIR="$2"; shift 2;;
    -h|--help) echo "Usage: $0 --input <dir> --server <url> [--pattern '*/'] [--out <dir>]"; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

if [[ -z "${INPUT_DIR}" || -z "${SERVER_URL}" ]]; then
  echo "Usage: $0 --input <dir> --server <url> [--pattern '*/'] [--out <dir>]"
  exit 1
fi
if [[ ! -d "${INPUT_DIR}" ]]; then
  echo "Input dir not found: ${INPUT_DIR}"
  exit 1
fi

# Make OUT_DIR absolute (avoids path confusion when we cd into case folders)
mkdir -p "${OUT_DIR}" || true
OUT_ABS="$(cd "${OUT_DIR}" && pwd)"

# Create subdirs safely (no brace expansion assumptions)
mkdir -p "${OUT_ABS}/zips"
mkdir -p "${OUT_ABS}/responses"
mkdir -p "${OUT_ABS}/logs"

SUMMARY_CSV="${OUT_ABS}/summary.csv"
echo "case,zip_path,http_code,bytes,elapsed_seconds,ok" > "${SUMMARY_CSV}"

# Count cases (immediate subdirectories only)
TOTAL=0
while IFS= read -r -d '' _dir; do TOTAL=$((TOTAL+1)); done < <(find "${INPUT_DIR}" -mindepth 1 -maxdepth 1 -type d -print0)
if [[ "${TOTAL}" -eq 0 ]]; then
  echo "No subfolders found in ${INPUT_DIR}"
  exit 1
fi

echo "Found ${TOTAL} case(s). Starting uploads to ${SERVER_URL} ..."
START_TS=$(date +%s)
i=0

# Iterate cases (null-delimited; safe with spaces/non-ascii)
# Sort for stable order (use awk trick to split on \0)
find "${INPUT_DIR}" -mindepth 1 -maxdepth 1 -type d -print0 | \
  awk 'BEGIN{RS="\0"; ORS="\n"} {print}' | sort | \
  while IFS= read -r case_dir; do
    [[ -z "${case_dir}" ]] && continue
    case_name="$(basename "$case_dir")"

    if [[ -n "${PATTERN}" ]]; then
      # Pattern match like bash [[ "name" == ${PATTERN} ]]
      if ! [[ "${case_name}" == ${PATTERN} ]]; then
        continue
      fi
    fi

    i=$((i+1))
    zip_path="${OUT_ABS}/zips/${case_name}.zip"
    resp_path="${OUT_ABS}/responses/${case_name}.json"

    echo "[$i/${TOTAL}] Zipping ${case_name} -> ${zip_path}"
    # Zip from inside the case dir to avoid capturing parent paths
    (cd "${case_dir}" && zip -qr "${zip_path}" .)

    echo "[$i/${TOTAL}] Uploading ${zip_path} -> ${SERVER_URL}/upload"
    http_meta="$(curl -sS -w "%{http_code}|%{time_total}" -o "${resp_path}.tmp" \
      -F "file=@${zip_path}" \
      "${SERVER_URL}/upload" || echo "000|0")"

    code="${http_meta%%|*}"
    elapsed="${http_meta##*|}"

    # Pretty print if jq exists and response is JSON
    if command -v jq >/dev/null 2>&1 && jq . >/dev/null 2>&1 < "${resp_path}.tmp"; then
      jq . < "${resp_path}.tmp" > "${resp_path}"
      rm -f "${resp_path}.tmp"
    else
      mv "${resp_path}.tmp" "${resp_path}"
    fi

    bytes=$(wc -c < "${resp_path}" | tr -d ' ')
    ok="false"; [[ "${code}" == "200" || "${code}" == "201" ]] && ok="true"

    echo "${case_name},${zip_path},${code},${bytes},${elapsed},${ok}" >> "${SUMMARY_CSV}"
    echo "[$i/${TOTAL}] Done: case=${case_name}, http=${code}, ok=${ok}, time=${elapsed}s"
  done

END_TS=$(date +%s)
DUR=$((END_TS-START_TS))
echo "All done in ${DUR}s. Summary: ${SUMMARY_CSV}"
