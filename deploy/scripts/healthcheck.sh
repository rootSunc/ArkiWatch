#!/usr/bin/env bash
set -euo pipefail

API_HEALTH_URL="${API_HEALTH_URL:-}"
WEB_URL="${WEB_URL:-}"

: "${API_HEALTH_URL:?Set API_HEALTH_URL to the public API health endpoint}"
: "${WEB_URL:?Set WEB_URL to the public web login endpoint}"

curl_check() {
  local label="$1"
  local url="$2"

  curl --fail --silent --show-error --location \
    --retry 3 --retry-delay 2 --retry-connrefused \
    "$url" >/dev/null
  echo "$label ok: $url"
}

curl_check "API" "$API_HEALTH_URL"
curl_check "Web" "$WEB_URL"
