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

echo "==> Building Docker images..."
docker build -t shop-frontend:latest ./frontend
docker build -t platform-frontend:v3 ./platform-frontend
docker build -t auth-server:latest ./auth

# Load image into local cluster
if [[ "$CLUSTER_TYPE" == "minikube" ]]; then
  echo "==> Loading images into minikube..."
  minikube image load shop-frontend:latest
  minikube image load platform-frontend:v3
  minikube image load auth-server:latest
elif [[ "$CLUSTER_TYPE" == "kind" ]]; then
  echo "==> Loading images into kind..."
  kind load docker-image shop-frontend:latest
  kind load docker-image platform-frontend:v3
  kind load docker-image auth-server:latest
else
  echo "[!] No cluster type specified; skipping image load."
  echo "    Run manually: minikube image load shop-frontend:latest && minikube image load platform-frontend:v3 && minikube image load auth-server:latest"
  echo "               or: kind load docker-image shop-frontend:latest && kind load docker-image platform-frontend:v3 && kind load docker-image auth-server:latest"
fi

echo "==> Applying Kubernetes manifests..."
kubectl apply -f k8s/auth-namespace.yaml
kubectl apply -f k8s/auth-deployment.yaml
kubectl apply -f k8s/auth-ingress.yaml
kubectl apply -f k8s/platform-namespace.yaml
kubectl apply -f k8s/deployment-platform-frontend.yaml
kubectl apply -f k8s/service-platform-frontend.yaml
kubectl apply -f k8s/ingress-platform.yaml
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/pod-shop-db.yaml
kubectl apply -f k8s/service-shop-api.yaml
kubectl apply -f k8s/deployment-frontend.yaml
kubectl apply -f k8s/service-frontend.yaml
kubectl apply -f k8s/ingress.yaml

echo "==> Waiting for shop-db Pod to be ready..."
kubectl wait --for=condition=Ready pod/shop-db -n shop-1 --timeout=120s
echo "==> Waiting for auth-server Deployment to be available..."
kubectl wait --for=condition=Available deployment/auth-server -n auth-system --timeout=120s

echo "==> Initialising database schema..."
kubectl exec -i -n shop-1 shop-db -c postgres -- \
  psql -U shopuser -d shopdb < k8s/db-init.sql

echo ""
echo "✅ Done! You can now access the applications without /etc/hosts changes:"
echo "   Platform: http://schlopify.192.168.49.2.nip.io"
echo "   Shop 1:   http://shop1.192.168.49.2.nip.io"
