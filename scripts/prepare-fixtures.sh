#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIX="$ROOT/.fixtures"

rm -rf "$FIX"
mkdir -p "$FIX"

# 1) vite (패키지 파일만 생성)
mkdir -p "$FIX/vite"
cat > "$FIX/vite/package.json" <<'JSON'
{ "name": "demo-vite", "private": true,
  "dependencies": { "react": "^19.1.1", "react-dom": "^19.1.1" },
  "devDependencies": { "vite": "^7.1.7", "@vitejs/plugin-react": "^5.0.3" }
}
JSON

# 2) next
mkdir -p "$FIX/next"
cat > "$FIX/next/package.json" <<'JSON'
{ "name": "next-app", "private": true,
  "dependencies": { "next": "14.2.5", "react": "18.2.0", "react-dom": "18.2.0" }
}
JSON

# 3) express
mkdir -p "$FIX/express"
cat > "$FIX/express/package.json" <<'JSON'
{ "name":"express-app","private":true,"dependencies":{"express":"4.19.2"} }
JSON

# 4) bare-node (package.json만)
mkdir -p "$FIX/bare"
echo '{ "name":"bare","private":true }' > "$FIX/bare/package.json"

# 5) no-pkg (package.json 없음)
mkdir -p "$FIX/no-pkg/subdir"

echo "Fixtures prepared at: $FIX"
