# Schlopify POC

Minimal single-tenant e-commerce deployment validating the **sidecar DB architecture** from [`poc.md`](poc.md).

## Architecture

```
Browser
  ↓ shop1.local
Ingress
  ├── /api/* → shop-api (Service) → PostgREST (container)
  │                                       ↓ localhost:5432
  │                                  PostgreSQL (container)
  └── /     → shop-frontend (Service) → React app (nginx)
```

All components run in the `shop-1` Kubernetes namespace.

## File Structure

```
schlopify/
├── frontend/
│   ├── src/
│   │   ├── main.jsx         # React entry point
│   │   └── App.jsx          # Fetches /api/products, renders list
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js       # Dev proxy: /api → PostgREST
│   ├── nginx.conf           # Prod: proxy /api, serve SPA
│   └── Dockerfile           # Multi-stage: node build → nginx serve
│
├── k8s/
│   ├── namespace.yaml        # Namespace: shop-1
│   ├── pod-shop-db.yaml      # Sidecar Pod: postgres + postgrest
│   ├── service-shop-api.yaml # ClusterIP → PostgREST :3000
│   ├── deployment-frontend.yaml
│   ├── service-frontend.yaml # ClusterIP → nginx :80
│   ├── ingress.yaml          # NGINX Ingress for shop1.local
│   └── db-init.sql           # Schema + seed data
│
├── deploy.sh                 # One-shot deploy script
├── poc.md                    # POC design document
└── plan.md                   # Full system design
```

## Prerequisites

- Docker
- `kubectl` connected to a cluster (minikube or kind)
- NGINX Ingress Controller

### Install NGINX Ingress (minikube)
```bash
minikube addons enable ingress
```

### Install NGINX Ingress (kind)
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

## Deploy

```bash
# For minikube:
./deploy.sh minikube

# For kind:
./deploy.sh kind
```

The script will:
1. Build the `shop-frontend:latest` Docker image
2. Load it into your local cluster
3. Apply all Kubernetes manifests
4. Wait for the Pod to be ready
5. Run the DB init SQL

## Add to /etc/hosts

```bash
echo "127.0.0.1 shop1.local" | sudo tee -a /etc/hosts

# For minikube, use:
echo "$(minikube ip) shop1.local" | sudo tee -a /etc/hosts
```

## Validate

```bash
# 1. Check all resources in namespace
kubectl get all -n shop-1

# 2. Test the API directly
kubectl port-forward -n shop-1 pod/shop-db 3000:3000 &
curl http://localhost:3000/products

# 3. Open frontend
open http://shop1.local   # or navigate in browser
```

Expected API response:
```json
[{"id":1,"name":"Widget A"},{"id":2,"name":"Widget B"},...]
```

## Key Points

| Concept | Implementation |
|---|---|
| Sidecar zero-hop | PostgREST → `localhost:5432` (no K8s service in between) |
| Tenant isolation | Dedicated namespace `shop-1` |
| Thin API layer | PostgREST auto-generates REST from PG schema |
| Routing | NGINX Ingress strips `/api` prefix before forwarding |
