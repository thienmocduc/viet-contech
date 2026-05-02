#!/bin/bash
# Smoke test cho 3 endpoint cong khai (no auth).
# Chay sau khi `npm run dev` len.
# Yeu cau: jq, curl
set -e

BASE="${BASE:-http://localhost:8787}"

echo "==> [1/3] GET /healthz"
curl -fsS "$BASE/healthz" | jq

echo ""
echo "==> [2/3] POST /api/contact"
curl -fsS -X POST "$BASE/api/contact" \
  -H 'content-type: application/json' \
  -d '{"name":"Test User","phone":"0912345678","email":"t@t.com","area":"100","need":"thiet ke noi that","note":"smoke test"}' \
  | jq

echo ""
echo "==> [3/3] POST /api/phongthuy/log"
curl -fsS -X POST "$BASE/api/phongthuy/log" \
  -H 'content-type: application/json' \
  -d '{"yearBorn":1985,"gender":"male","cungMenh":"Khan","nguHanh":"Thuy"}' \
  | jq

echo ""
echo "Smoke test PASS"
