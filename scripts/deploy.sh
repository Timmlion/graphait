#!/bin/bash
set -e

export PATH="/opt/podman/bin:$PATH"

REGISTRY="ghcr.io/timmlion"
API_IMAGE="$REGISTRY/graphait-api:latest"
FRONTEND_IMAGE="$REGISTRY/graphait-frontend:latest"
COOLIFY_WEBHOOK="${COOLIFY_WEBHOOK_URL:-}"

# Frontend budujemy natywnie na Macu — esbuild nie lubi QEMU
echo "▶ Budowanie frontendu (native, bez QEMU)..."
cd frontend
npm ci
npm run build
cd ..

echo "▶ Budowanie obrazu API..."
podman build --platform linux/amd64 -t "$API_IMAGE" .

echo "▶ Budowanie obrazu Frontend (kopiowanie dist do nginx)..."
podman build --platform linux/amd64 -f Dockerfile.frontend -t "$FRONTEND_IMAGE" .

echo "▶ Pushowanie do ghcr.io..."
podman push "$API_IMAGE"
podman push "$FRONTEND_IMAGE"

echo "✓ Obrazy wgrane."

if [ -n "$COOLIFY_WEBHOOK" ]; then
  echo "▶ Triggerowanie redeploy w Coolify..."
  curl -s -X GET "$COOLIFY_WEBHOOK"
  echo "✓ Coolify deployment uruchomiony."
else
  echo "  (brak COOLIFY_WEBHOOK_URL — uruchom redeploy ręcznie w panelu)"
fi

echo ""
echo "✓ Gotowe!"
