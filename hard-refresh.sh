#!/usr/bin/env bash
# hard-refresh.sh - rebuild local images, reload them into the cluster, and
# force Kubernetes deployments to consume the rebuilt images.
#
# Usage:
#   ./hard-refresh.sh [minikube|kind]
#   ./hard-refresh.sh [minikube|kind] --with-shop-1
#
# Useful env vars:
#   REFRESH_TAG=dev-123        Use a specific image tag instead of a timestamp.
#   NO_CACHE=0                 Allow Docker layer cache. Defaults to hard mode.
#   PULL_BASE_IMAGES=1         Pull newer base images during docker build.
#   KIND_CLUSTER_NAME=name     Target a specific kind cluster.
#   MINIKUBE_PROFILE=name      Target a specific minikube profile.
#
# Existing dynamic shops are kept intact. Their shop-frontend Deployment is
# moved to the fresh image tag, but database pods are not deleted.
# Use --delete-shops if you intentionally want to remove all shop-* namespaces
# so future shops are provisioned from the latest platform-api code.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

CLUSTER_TYPE="${CLUSTER_TYPE:-}"
INCLUDE_STATIC_SHOP=0
DELETE_SHOPS=0
ASSUME_YES=0
REFRESH_TAG="${REFRESH_TAG:-refresh-$(date +%Y%m%d%H%M%S)}"
NO_CACHE="${NO_CACHE:-1}"
PULL_BASE_IMAGES="${PULL_BASE_IMAGES:-0}"

STABLE_SHOP_FRONTEND_TAG="v5"
STABLE_PLATFORM_FRONTEND_TAG="v4"
STABLE_AUTH_TAG="latest"
STABLE_PLATFORM_API_TAG="v2"

usage() {
  cat <<'EOF'
Usage: ./hard-refresh.sh [minikube|kind] [options]

Options:
  --with-shop-1       Also apply the checked-in static shop-1 manifests.
  --delete-shops      Delete all shop-* namespaces before refreshing.
  --yes               Skip the --delete-shops confirmation prompt.
  --cached-build      Allow Docker layer cache for faster, softer refreshes.
  -h, --help          Show this help.

Environment:
  REFRESH_TAG         Override the generated per-run image tag.
  NO_CACHE=0          Same as --cached-build.
  PULL_BASE_IMAGES=1  Add --pull to docker builds.
EOF
}

log() {
  printf '\n==> %s\n' "$*"
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '[!] Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

while (($#)); do
  case "$1" in
    minikube|kind)
      CLUSTER_TYPE="$1"
      ;;
    --with-shop-1|--static-shop|--shop-1)
      INCLUDE_STATIC_SHOP=1
      ;;
    --delete-shops|--reset-shops|--purge-shops)
      DELETE_SHOPS=1
      ;;
    --yes|-y)
      ASSUME_YES=1
      ;;
    --cached-build)
      NO_CACHE=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf '[!] Unknown argument: %s\n\n' "$1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

detect_cluster_type() {
  if command -v minikube >/dev/null 2>&1; then
    local minikube_status
    minikube_status="$(minikube status --format='{{.Host}}' 2>/dev/null || true)"
    if [[ "$minikube_status" == "Running" ]]; then
      printf 'minikube'
      return 0
    fi
  fi

  if command -v kind >/dev/null 2>&1; then
    local kind_clusters
    kind_clusters="$(kind get clusters 2>/dev/null || true)"
    if [[ -n "$kind_clusters" ]]; then
      printf 'kind'
      return 0
    fi
  fi

  return 1
}

if [[ -z "$CLUSTER_TYPE" ]]; then
  if ! CLUSTER_TYPE="$(detect_cluster_type)"; then
    printf '[!] Could not auto-detect a running minikube or kind cluster.\n' >&2
    printf '    Pass one explicitly: ./hard-refresh.sh minikube\n' >&2
    exit 1
  fi
fi

need_cmd docker
need_cmd kubectl
need_cmd "$CLUSTER_TYPE"

if ! kubectl cluster-info >/dev/null 2>&1; then
  printf '[!] kubectl cannot reach a cluster with the current context.\n' >&2
  exit 1
fi

echo "=================================================================="
echo "  SCHLOPIFY - Hard Kubernetes Refresh"
echo "=================================================================="
echo "  Cluster type: $CLUSTER_TYPE"
echo "  Refresh tag:  $REFRESH_TAG"
echo "  Docker cache: $([[ "$NO_CACHE" == "1" ]] && printf 'disabled' || printf 'enabled')"
echo "=================================================================="

build_image() {
  local image_name="$1"
  local stable_tag="$2"
  local context_dir="$3"
  local build_flags=()

  if [[ "$NO_CACHE" == "1" ]]; then
    build_flags+=(--no-cache)
  fi

  if [[ "$PULL_BASE_IMAGES" == "1" ]]; then
    build_flags+=(--pull)
  fi

  docker build "${build_flags[@]}" \
    -t "${image_name}:${REFRESH_TAG}" \
    -t "${image_name}:${stable_tag}" \
    "$context_dir"
}

load_image() {
  local image="$1"

  case "$CLUSTER_TYPE" in
    minikube)
      local minikube_args=()
      if [[ -n "${MINIKUBE_PROFILE:-}" ]]; then
        minikube_args+=(-p "$MINIKUBE_PROFILE")
      fi
      minikube "${minikube_args[@]}" image load "$image"
      ;;
    kind)
      local kind_args=()
      if [[ -n "${KIND_CLUSTER_NAME:-}" ]]; then
        kind_args+=(--name "$KIND_CLUSTER_NAME")
      fi
      kind load docker-image "${kind_args[@]}" "$image"
      ;;
  esac
}

apply_manifest() {
  kubectl apply -f "$1"
}

shop_namespaces() {
  local ns
  while IFS= read -r ns; do
    if [[ "$ns" == shop-* ]]; then
      printf '%s\n' "$ns"
    fi
  done < <(kubectl get namespaces -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}')
}

delete_shop_namespaces() {
  mapfile -t namespaces < <(shop_namespaces)

  if ((${#namespaces[@]} == 0)); then
    echo "No shop-* namespaces found."
    return 0
  fi

  printf '[!] This will delete shop namespaces and their in-cluster data:\n'
  printf '    %s\n' "${namespaces[@]}"

  if [[ "$ASSUME_YES" != "1" ]]; then
    local confirmation
    read -r -p "Type DELETE_SHOPS to continue: " confirmation
    if [[ "$confirmation" != "DELETE_SHOPS" ]]; then
      echo "Aborted."
      exit 1
    fi
  fi

  local ns
  for ns in "${namespaces[@]}"; do
    kubectl delete namespace "$ns" --wait=false
  done

  for ns in "${namespaces[@]}"; do
    kubectl wait --for=delete "namespace/$ns" --timeout=180s || true
  done
}

set_deployment_image_if_present() {
  local namespace="$1"
  local deployment="$2"
  local container="$3"
  local image="$4"

  if kubectl -n "$namespace" get "deployment/$deployment" >/dev/null 2>&1; then
    kubectl -n "$namespace" set image "deployment/$deployment" "$container=$image"
  fi
}

wait_for_deployment_if_present() {
  local namespace="$1"
  local deployment="$2"

  if kubectl -n "$namespace" get "deployment/$deployment" >/dev/null 2>&1; then
    kubectl -n "$namespace" rollout status "deployment/$deployment" --timeout=180s
  fi
}

log "Building Docker images from the current repo state..."
build_image "shop-frontend" "$STABLE_SHOP_FRONTEND_TAG" ./frontend
build_image "platform-frontend" "$STABLE_PLATFORM_FRONTEND_TAG" ./platform-frontend
build_image "auth-server" "$STABLE_AUTH_TAG" ./auth
build_image "platform-api" "$STABLE_PLATFORM_API_TAG" ./platform-api

log "Loading fresh images into $CLUSTER_TYPE..."
for image in \
  "shop-frontend:${REFRESH_TAG}" \
  "shop-frontend:${STABLE_SHOP_FRONTEND_TAG}" \
  "platform-frontend:${REFRESH_TAG}" \
  "platform-frontend:${STABLE_PLATFORM_FRONTEND_TAG}" \
  "auth-server:${REFRESH_TAG}" \
  "auth-server:${STABLE_AUTH_TAG}" \
  "platform-api:${REFRESH_TAG}" \
  "platform-api:${STABLE_PLATFORM_API_TAG}"
do
  load_image "$image"
done

if [[ "$DELETE_SHOPS" == "1" ]]; then
  log "Deleting existing shop namespaces..."
  delete_shop_namespaces
fi

log "Applying auth and platform manifests..."
apply_manifest k8s/auth-namespace.yaml
apply_manifest k8s/auth-deployment.yaml
apply_manifest k8s/auth-ingress.yaml

apply_manifest k8s/platform-namespace.yaml
apply_manifest k8s/platform-api-rbac.yaml
apply_manifest k8s/platform-api-deployment.yaml
apply_manifest k8s/deployment-platform-frontend.yaml
apply_manifest k8s/service-platform-frontend.yaml
apply_manifest k8s/ingress-platform.yaml

if [[ "$INCLUDE_STATIC_SHOP" == "1" ]]; then
  log "Applying checked-in shop-1 manifests..."
  apply_manifest k8s/namespace.yaml

  if kubectl -n shop-1 get pod/shop-db >/dev/null 2>&1; then
    kubectl -n shop-1 delete pod/shop-db --wait=true
  fi

  apply_manifest k8s/pod-shop-db.yaml
  apply_manifest k8s/service-shop-api.yaml
  apply_manifest k8s/deployment-frontend.yaml
  apply_manifest k8s/service-frontend.yaml
  apply_manifest k8s/ingress.yaml
fi

log "Pointing deployments at the fresh image tag..."
set_deployment_image_if_present auth-system auth-server auth "auth-server:${REFRESH_TAG}"
set_deployment_image_if_present schlopify-platform platform-api api "platform-api:${REFRESH_TAG}"
set_deployment_image_if_present schlopify-platform platform-frontend frontend "platform-frontend:${REFRESH_TAG}"

kubectl -n schlopify-platform set env deployment/platform-api \
  "FRONTEND_IMAGE_TAG=${REFRESH_TAG}"

mapfile -t active_shop_namespaces < <(shop_namespaces)
for ns in "${active_shop_namespaces[@]}"; do
  set_deployment_image_if_present "$ns" shop-frontend frontend "shop-frontend:${REFRESH_TAG}"
done

log "Waiting for refreshed deployments..."
wait_for_deployment_if_present auth-system auth-server
wait_for_deployment_if_present schlopify-platform platform-api
wait_for_deployment_if_present schlopify-platform platform-frontend

for ns in "${active_shop_namespaces[@]}"; do
  wait_for_deployment_if_present "$ns" shop-frontend
done

if [[ "$INCLUDE_STATIC_SHOP" == "1" ]]; then
  kubectl wait --for=condition=Ready pod/shop-db -n shop-1 --timeout=180s
fi

echo ""
echo "=================================================================="
echo "  Hard refresh complete"
echo ""
echo "  Images rebuilt with tag: ${REFRESH_TAG}"
echo "  Platform UI:  http://schlopify.192.168.49.2.nip.io"
echo "  Platform API: http://schlopify.192.168.49.2.nip.io/api/health"
echo "=================================================================="
