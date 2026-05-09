# Developer Log - May 9, 2026 — Create Shop Loop

## Overview
This session implemented the **core product loop** of Schlopify: user fills a deployment form → platform dynamically provisions a full Kubernetes tenant stack → user receives a live URL. This is the transition from static, manually-applied YAML manifests to a proper **Control Plane** that orchestrates tenant infrastructure programmatically via the Kubernetes API.

---

## 1. Platform API — The Control Plane (`platform-api/`)

**The Problem:**
Up to this point, every shop (`shop-1`) was provisioned manually by running `kubectl apply` on hardcoded YAML files. There was no automation — the POC doc explicitly listed "multi-tenant orchestration" as excluded scope. To close the main loop, we needed a service that could receive a form submission and translate it into live infrastructure.

**The Solution:**
A new Go HTTP service (`platform-api/`) built with `k8s.io/client-go`. It exposes a single endpoint:

```
POST /api/deploy
Body: { "shop_name": "cool-kicks", "theme": "brutalist" }
```

The handler:
1. Validates inputs and sanitizes the shop name into a URL-safe slug
2. Calls the `Provisioner` which creates **6 Kubernetes resources** programmatically:
   - Namespace (`shop-{id}`)
   - Pod (`shop-db` — PostgreSQL + PostgREST sidecar, identical spec to the original `pod-shop-db.yaml`)
   - Service (`shop-api` — ClusterIP exposing PostgREST on 3000)
   - Deployment (`shop-frontend` — React app with `SHOP_THEME` env var)
   - Service (`shop-frontend` — ClusterIP on 80)
   - Dual Ingress rules (API with `/api` rewrite + frontend catch-all)
3. Polls for pod readiness (2s intervals, 120s timeout)
4. Runs DB schema init via `remotecommand.NewSPDYExecutor` (the client-go equivalent of `kubectl exec`)
5. Returns `{ "url": "http://cool-kicks.192.168.49.2.nip.io", "status": "ready" }`

**Key Design Decision — client-go vs. shelling out to kubectl:**
We used the native Go Kubernetes SDK rather than exec'ing `kubectl` commands. This gives us typed objects, proper error handling, and no dependency on `kubectl` being installed in the container image. The only tricky part was the DB init step, which requires SPDY exec — but `client-go` has `remotecommand` for exactly this.

**RBAC:**
The platform-api pod needs cluster-wide permissions (creating namespaces across the cluster). We created a `ServiceAccount` + `ClusterRole` + `ClusterRoleBinding` with the minimum required verbs: create/get/list/watch/delete on namespaces, pods, pods/exec, services, deployments, and ingresses.

---

## 2. Runtime Theme Injection

**The Problem:**
The shop frontend supports multiple themes (brutalist, minimal) via a `ThemeProvider` that dynamically imports theme registries and CSS tokens. But the theme name was previously hardcoded. When the control plane deploys a new shop, it needs to tell the frontend _which_ theme to render — without rebuilding the Docker image per deployment.

**The Solution — One Image, Runtime Configuration:**
Instead of building separate Docker images per theme (which would add 30-60s build latency per deployment), we inject the theme at container startup using NGINX's built-in `envsubst` template system:

1. **Dockerfile:** The `nginx.conf` is placed at `/etc/nginx/templates/default.conf.template` (instead of directly in `conf.d/`). NGINX 1.25's Alpine entrypoint automatically runs `envsubst` on `*.template` files before starting.

2. **nginx.conf:** Added a `sub_filter` directive:
   ```nginx
   sub_filter '</head>' '<script>window.__SCHLOPIFY_THEME__="${SHOP_THEME}";</script></head>';
   ```
   After `envsubst` processes the template, `${SHOP_THEME}` becomes the literal theme value (e.g., `brutalist`). Every HTML response then includes the theme script tag.

3. **ThemeProvider.tsx:** Updated to resolve the theme from (in priority order):
   - Explicit prop passed by parent component
   - `window.__SCHLOPIFY_THEME__` (injected by NGINX at runtime)
   - Fallback default (`minimal`)
   
   Includes a guard against the raw template string `${SHOP_THEME}` appearing if envsubst fails.

4. **K8s Deployment:** The provisioner passes `SHOP_THEME=brutalist` (or whatever the user chose) as an env var on the frontend container. NGINX picks it up at boot.

**Result:** A single `shop-frontend:v5` image serves any theme. The provisioner just sets an env var.

---

## 3. Platform Frontend — Deploy Dashboard

**The Problem:**
The platform frontend (`schlopify.192.168.49.2.nip.io`) had a landing page and auth forms, but no way to actually _do_ anything after logging in. We needed a deployment form that feeds into the Platform API.

**The Solution:**
Added a `DashboardView` component to the platform frontend with three states:

### Form State (`idle`)
- **Shop Name input** with live URL preview (shows the slugified name as it would appear in the domain)
- **Theme Selector** — two cards (Brutalist and Minimal Modern) with color swatches, descriptions, and a check indicator. Uses Framer Motion `layoutId` for smooth selection transitions.
- **Deploy button** — disabled until name is entered

### Deploying State
- Animated spinner with step-by-step progress indicators:
  - Creating namespace...
  - Provisioning database...
  - Starting API layer...
  - Deploying frontend...
  - Configuring routing...
  - Initialising schema...
- Steps animate in sequentially while the real API call runs in the background

### Success State
- Large animated checkmark (spring physics via Framer Motion)
- The live URL displayed as a prominent clickable link with the accent color
- Namespace metadata shown
- "Deploy Another" button to reset

**Auth bypass:** Initially the dashboard was gated behind login/signup. For this iteration, we set the initial view directly to `'dashboard'` so the deploy form is immediately accessible.

---

## 4. Infrastructure Updates

### Platform Ingress Split
The original `ingress-platform.yaml` had a single rule routing all traffic to the platform frontend. We split it into two:
- `/api` → `platform-api` service (port 8090) — handles deploy requests
- `/` → `platform-frontend` service (port 80) — serves the SPA

This keeps the frontend's `fetch('/api/deploy')` call on the same origin, avoiding CORS.

### Deploy Script Rewrite
`deploy.sh` was rebuilt to deploy only the **platform stack** (control plane). The hardcoded `shop-1` namespace provisioning was removed entirely — shops are now created dynamically through the UI. The script now:
1. Builds 4 images: `shop-frontend:v5`, `platform-frontend:v4`, `auth-server:latest`, `platform-api:v1`
2. Loads all into minikube
3. Applies RBAC before deployments (order matters)
4. Waits for `platform-api` and `auth-server` readiness

---

## 5. Files Changed / Created

### New Files
| File | Purpose |
|------|---------|
| `platform-api/main.go` | HTTP server, `/api/deploy` handler, validation, CORS |
| `platform-api/provisioner.go` | client-go K8s orchestration (the core engine) |
| `platform-api/Dockerfile` | Multi-stage Go build → Alpine |
| `platform-api/go.mod` / `go.sum` | Module with k8s.io/client-go deps |
| `k8s/platform-api-rbac.yaml` | ServiceAccount + ClusterRole + ClusterRoleBinding |
| `k8s/platform-api-deployment.yaml` | Deployment + Service for the API |

### Modified Files
| File | Change |
|------|--------|
| `frontend/nginx.conf` | Added `sub_filter` for theme injection |
| `frontend/Dockerfile` | Switched to NGINX template system for envsubst |
| `frontend/src/registry/ThemeProvider.tsx` | Reads `window.__SCHLOPIFY_THEME__` at runtime |
| `frontend/src/App.jsx` | Wrapped with `<ThemeProvider>` (no explicit theme prop) |
| `platform-frontend/src/App.jsx` | Added DashboardView with deploy form, deploying animation, success state |
| `k8s/ingress-platform.yaml` | Split into API + frontend ingress rules |
| `k8s/deployment-platform-frontend.yaml` | Tag bump v3 → v4 |
| `k8s/deployment-frontend.yaml` | Tag bump v4 → v5 |
| `deploy.sh` | Rebuilt for platform-only deployment |

---

## 6. Verification Status

- **Go build:** ✅ Compiles clean (`go build` exit code 0)
- **Go dependencies:** ✅ `go mod tidy` resolved all client-go transitive deps
- **Next:** Run `./deploy.sh minikube` and test the full loop end-to-end
