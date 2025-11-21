# 코드 붙여넣기#!/usr/bin/env bash set -euo pipefail PORT=${PORT:-5002} API="http://localhost:$PORT" ROOT="$(cd "$(dirname "$0")/.." && pwd)" FIX="$ROOT/.fixtures" chmod +x 
scripts/run-matrix.sh # jq가 없으면 python으로 포매팅 pretty() { python -m json.tool 2>/dev/null || cat; } bash scripts/run-matrix.sh # 기본 3라운드 declare -a CASES=(
ROUNDS=100 bash scripts/run-matrix.sh   # 100라운드
  "$FIX/vite"
  "$FIX/next"
  "$FIX/express"
  "$FIX/bare"
  "$FIX/no-pkg"
)

run_case() {
  local p="$1"
  echo "=== CASE: $p ==="
  echo "---- plan"
  curl -sS -X POST "$API/api/plan" \
    -H "Content-Type: application/json" \
    -d "{\"projectPath\":\"$p\"}" | pretty

  echo "---- apply (dryRun)"
  curl -sS -X POST "$API/api/apply" \
    -H "Content-Type: application/json" \
    -d "{\"projectPath\":\"$p\",\"dryRun\":true}" | pretty

  echo "---- apply (real)"
  curl -sS -X POST "$API/api/apply" \
    -H "Content-Type: application/json" \
    -d "{\"projectPath\":\"$p\"}" | pretty
}

# 준비
bash "$ROOT/scripts/prepare-fixtures.sh"

# 라운드 반복
ROUNDS=${ROUNDS:-3}
for ((i=1;i<=ROUNDS;i++)); do
  echo "######## ROUND $i ########"
  for c in "${CASES[@]}"; do
    run_case "$c" || echo "FAILED: $c"
  done
done

