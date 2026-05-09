#!/usr/bin/env bash
# deploy.sh — Build images, load into cluster, apply platform manifests
# Usage: ./deploy.sh [minikube|kind]
#
# This deploys the PLATFORM stack only (control plane).
# Individual shop stacks are provisioned dynamically via the Platform API.

set -euo pipefail

CLUSTER_TYPE="${1:-}"

echo "══════════════════════════════════════════════════════════════════"
echo "  SCHLOPIFY — Platform Deployment"
echo "══════════════════════════════════════════════════════════════════"

# ── Build Docker images ──────────────────────────────────────────────────────
echo ""
echo "==> Building Docker images..."
docker build -t shop-frontend:v5 ./frontend
docker build -t platform-frontend:v4 ./platform-frontend
docker build -t auth-server:latest ./auth
docker build -t platform-api:v2 ./platform-api

# ── Load images into cluster ────────────────────────────────────────────────
if [[ "$CLUSTER_TYPE" == "minikube" ]]; then
  echo "==> Loading images into minikube..."
  minikube image load shop-frontend:v5
  minikube image load platform-frontend:v4
  minikube image load auth-server:latest
  minikube image load platform-api:v2
elif [[ "$CLUSTER_TYPE" == "kind" ]]; then
  echo "==> Loading images into kind..."
  kind load docker-image shop-frontend:v5
  kind load docker-image platform-frontend:v4
  kind load docker-image auth-server:latest
  kind load docker-image platform-api:v1
else
  echo "[!] No cluster type specified; skipping image load."
  echo "    Usage: ./deploy.sh minikube"
fi

# ── Apply Kubernetes manifests ──────────────────────────────────────────────
echo ""
echo "==> Applying Kubernetes manifests..."

# Auth system
kubectl apply -f k8s/auth-namespace.yaml
kubectl apply -f k8s/auth-deployment.yaml
kubectl apply -f k8s/auth-ingress.yaml

# Platform namespace + RBAC (must come before deployments)
kubectl apply -f k8s/platform-namespace.yaml
kubectl apply -f k8s/platform-api-rbac.yaml

# Platform services
kubectl apply -f k8s/platform-api-deployment.yaml
kubectl apply -f k8s/deployment-platform-frontend.yaml
kubectl apply -f k8s/service-platform-frontend.yaml
kubectl apply -f k8s/ingress-platform.yaml

echo ""
echo "==> Waiting for platform-api to be available..."
kubectl wait --for=condition=Available deployment/platform-api -n schlopify-platform --timeout=120s

echo "==> Waiting for auth-server to be available..."
kubectl wait --for=condition=Available deployment/auth-server -n auth-system --timeout=120s

echo ""
echo "══════════════════════════════════════════════════════════════════"
echo "  ✅ Platform deployed!"
echo ""
echo "  Platform UI:  http://schlopify.192.168.49.2.nip.io"
echo "  Platform API: http://schlopify.192.168.49.2.nip.io/api/health"
echo ""
echo "  Individual shops are now created dynamically via the UI."
echo "══════════════════════════════════════════════════════════════════"
