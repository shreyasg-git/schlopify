#!/usr/bin/env bash
# deploy.sh — Apply POC manifests in order
# Usage: ./deploy.sh [minikube|kind]
#
# Prerequisites:
#   - kubectl pointing at your cluster
#   - NGINX Ingress Controller installed
#   - Frontend image already built and loaded (see README.md)

set -euo pipefail

CLUSTER_TYPE="${1:-}"

echo "==> Building frontend Docker image..."
docker build -t shop-frontend:latest ./frontend

# Load image into local cluster
if [[ "$CLUSTER_TYPE" == "minikube" ]]; then
  echo "==> Loading image into minikube..."
  minikube image load shop-frontend:latest
elif [[ "$CLUSTER_TYPE" == "kind" ]]; then
  echo "==> Loading image into kind..."
  kind load docker-image shop-frontend:latest
else
  echo "[!] No cluster type specified; skipping image load."
  echo "    Run manually: minikube image load shop-frontend:latest"
  echo "               or: kind load docker-image shop-frontend:latest"
fi

echo "==> Applying Kubernetes manifests..."
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/pod-shop-db.yaml
kubectl apply -f k8s/service-shop-api.yaml
kubectl apply -f k8s/deployment-frontend.yaml
kubectl apply -f k8s/service-frontend.yaml
kubectl apply -f k8s/ingress.yaml

echo "==> Waiting for shop-db Pod to be ready..."
kubectl wait --for=condition=Ready pod/shop-db -n shop-1 --timeout=120s

echo "==> Initialising database schema..."
kubectl exec -n shop-1 shop-db -c postgres -- \
  psql -U shopuser -d shopdb < k8s/db-init.sql

echo ""
echo "✅ Done! Add to /etc/hosts:"
echo "   127.0.0.1  shop1.local"
echo ""
echo "Then open: http://shop1.local"
