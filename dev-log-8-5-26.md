# Schlopify Deep Dive Development Log - May 8, 2026

## Executive Summary
This document serves as an exhaustive, highly detailed post-mortem and development log of the session that transitioned the Schlopify Proof-of-Concept from a monolithic single-tenant testbed into a scalable, multi-tenant capable architecture. The core objectives were to implement a centralized authentication service and strictly bifurcate the frontend into a Platform UI (for tenants) and a Shop UI (for end customers). 

---

## Phase 1: Centralized Authentication Server

### 1.1 Architectural Motivation
The initial POC demonstrated "Zero-Hop" database latency by placing PostgREST and PostgreSQL in the same pod for a specific tenant (`shop-1`). However, authentication cannot be isolated per tenant if tenants themselves need a centralized way to log in and manage their billing or global settings. Therefore, we needed a single, centralized server.

### 1.2 Implementation Details
We opted to write the service from scratch in **Go (1.20)** for minimal footprint and maximum concurrency. 

**Database:**
To keep the POC simple and avoid spinning up a heavyweight centralized PostgreSQL cluster immediately, we opted for an embedded `sqlite3` database initialized directly inside the Go binary.
```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('tenant', 'customer')),
    tenant_id TEXT,
    UNIQUE(email, tenant_id, role)
);
```

**Application Logic:**
The server (`main.go`) imports `golang.org/x/crypto/bcrypt` for secure password hashing (cost factor 10) and `github.com/golang-jwt/jwt/v5` for stateless session management.
- `POST /auth/register`: Parses JSON credentials, hashes the password, and inserts into the SQLite DB.
- `POST /auth/login`: Queries the DB, compares the bcrypt hash, and issues an HMAC-SHA256 signed JWT with claims for `user_id`, `role`, and `tenant_id`.

**Containerization:**
A multi-stage `Dockerfile` was created. Because `go-sqlite3` relies on CGO, we had to explicitly install `gcc` and `musl-dev` in the Alpine builder stage, and build the binary with `CGO_ENABLED=1 GOOS=linux`.

### 1.3 Kubernetes Infrastructure
We established a strict namespace boundary:
- **Namespace:** `auth-system`
- **Deployment:** `auth-server`, mounting an `emptyDir` volume to `/data` to persist the SQLite database across container restarts (but not Pod evictions).
- **Service:** ClusterIP exposed on port `80`, targeting container port `8080`.

---

## Phase 2: The Two-Frontend Split

### 2.1 Architectural Motivation
With Auth centralized, the UI layer needed separation:
1. `schlopify.local` -> The admin dashboard for tenants.
2. `shop1.local` -> The storefront for end customers.

### 2.2 Execution
We duplicated the existing Vite/React SPA from `frontend/` into a new `platform-frontend/` directory. We updated `package.json` and `index.html` to reflect the new "Schlopify Platform" branding.

We provisioned a new Kubernetes namespace, `schlopify-platform`, and created dedicated Deployment and Service manifests for the platform frontend.

### 2.3 Advanced Ingress Routing
The most critical part of this phase was configuring the NGINX Ingress Controller to route `/auth` traffic from *both* domains transparently to the centralized auth service. We achieved this by defining multiple host rules in `auth-ingress.yaml`:

```yaml
spec:
  rules:
    - host: shop1.192.168.49.2.nip.io
      http:
        paths:
          - path: /auth
            backend:
              service:
                name: auth-service
                port: 80
    - host: schlopify.192.168.49.2.nip.io
      http:
        paths:
          - path: /auth
            backend:
              service:
                name: auth-service
                port: 80
```
This ensures that React apps on both domains can simply call `fetch('/auth/login')` without hitting CORS issues or needing to know the central domain.

---

## Phase 3: The Debugging Journey

Deploying this multi-faceted architecture locally on Minikube introduced a cascade of fascinating edge cases.

### Bug 1: Docker Disk Space Exhaustion
**The Symptom:** Minikube failed to start entirely, throwing `X Exiting due to RSRC_DOCKER_STORAGE: Docker is out of disk space! (/var is at 100% of capacity).`
**The Investigation:** The underlying Docker daemon had accumulated gigabytes of dangling images and build caches from previous POC iterations.
**The Fix:** We ran `docker system prune -f` to reclaim 164MB of cache, which was barely enough to allow Minikube to limp back to life. 

### Bug 2: The `/etc/hosts` Multi-Tenant Bottleneck
**The Symptom:** The user noted that manually updating `/etc/hosts` for every dynamically created shop was tedious and unscalable. We attempted to run an automated `sudo sed -i ...` command to append `schlopify.local` to the hosts file, but the agent terminal failed because `sudo` required interactive password input.
**The Investigation:** `/etc/hosts` fundamentally does not support wildcard entries (e.g., `*.local`). 
**The Fix:** We pivoted the entire local architecture to use **`nip.io`**. By rewriting our ingress hosts from `shop1.local` to `shop1.192.168.49.2.nip.io` (where `192.168.49.2` is the Minikube IP), public DNS servers automatically resolve the domain back to the local cluster. This completely eliminates the need to touch `/etc/hosts` ever again.

### Bug 3: The Kubectl Wait Condition Mismatch
**The Symptom:** The `./deploy.sh` script hung for 2 minutes and ultimately threw: `error: timed out waiting for the condition on deployments/auth-server`.
**The Investigation:** We ran `kubectl get pods -n auth-system` and saw that the pod was actually `Running` and `Ready` within 5 seconds. Why did `kubectl wait` fail?
**The Root Cause:** The script was executing `kubectl wait --for=condition=Ready deployment/auth-server`. In the Kubernetes API, `Deployment` objects do not have a `Ready` condition status—only `Pod` objects do. Deployments expose an `Available` condition. Because the script was polling a nonexistent status, it hung until timeout.
**The Fix:** Updated the script to `kubectl wait --for=condition=Available deployment/auth-server`.

### Bug 4: NGINX 503 Service Temporarily Unavailable
**The Symptom:** Visiting `http://schlopify.192.168.49.2.nip.io` resulted in an NGINX 503 error. 
**The Investigation:** We checked the pod status: `kubectl get pods -n schlopify-platform`. The output showed `platform-frontend-86b9f9c87b-qd4z2` was in a brutal `CrashLoopBackOff`.
We then inspected the logs: `kubectl logs deployment/platform-frontend -n schlopify-platform`.
The critical error was:
`nginx: [emerg] host not found in upstream "shop-api" in /etc/nginx/conf.d/default.conf:11`
**The Root Cause:** When we cloned the `frontend` codebase to create `platform-frontend`, we blindly copied `nginx.conf`. That config contained:
```nginx
location /api/ {
    proxy_pass http://shop-api:3000/;
}
```
Because the `platform-frontend` lives in the `schlopify-platform` namespace, the Kubernetes DNS resolver could not find `shop-api` (which lives strictly in `shop-1`). NGINX evaluates upstreams on boot; if an upstream is unresolvable, the master process crashes immediately with `Exit Code 1`.
**The Fix:** We removed the offending `/api/` proxy block from the platform's `nginx.conf`.

### Bug 5: Kubernetes `IfNotPresent` Caching Conflict
**The Symptom:** After fixing the NGINX config and rebuilding `platform-frontend:latest`, we ran `minikube image load platform-frontend:latest`. However, the pod *still* crashed with the same error!
**The Investigation:** `minikube image load` refused to overwrite the image because it was in use by the crashing container (`conflict: unable to remove repository reference`). Furthermore, the deployment was set to `imagePullPolicy: IfNotPresent`. Because an image tagged `latest` already existed on the node, the Kubelet bypassed pulling the new layers.
**The Fix:** Instead of fighting the Docker daemon cache, we simply tagged the newly built image as `platform-frontend:v2`:
```bash
docker build -t platform-frontend:v2 ./platform-frontend
minikube image load platform-frontend:v2
```
We then updated `k8s/deployment-platform-frontend.yaml` to reference the `:v2` tag and executed a `kubectl rollout restart`. 

### The Result
The rollout completed successfully (`condition=Available`), and a `curl -I` request to the platform frontend returned a pristine `HTTP/1.1 200 OK`. 

## Final State
The architecture is now fully decoupled, secure, and utilizes dynamic local routing. The foundation is solidly laid for adding robust multi-tenant provisioning logic to the Go Auth server in future sessions.
