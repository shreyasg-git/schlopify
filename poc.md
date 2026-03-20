# POC Design Doc: Single-Tenant E-Commerce Deployment (Sidecar DB)

## 1. Objective

Build a minimal proof-of-concept that demonstrates:

* Single-tenant deployment per shop
* Zero-hop communication between API and database (PostgREST + PostgreSQL sidecar)
* End-to-end data flow: frontend → API → database
* Kubernetes-based deployment model

This POC is not production-ready. It exists to validate **core architectural decisions**, especially the sidecar pattern.

---

## 2. Scope

### Included

* One shop (`shop-1`)
* Kubernetes namespace isolation
* PostgreSQL + PostgREST in same Pod
* Minimal React frontend
* Basic ingress routing

### Excluded

* Authentication
* Multi-tenant provisioning
* CI/CD (Jenkins)
* Infra automation (Ansible)
* Scaling strategies

---

## 3. Architecture Overview

### Control Plane

Not implemented in this POC.

All resources are manually applied via `kubectl`.

---

### Data Plane (Single Tenant)

```text
Namespace: shop-1

Pod: shop-db
  ├── postgres (port 5432)
  └── postgrest (port 3000, connects via localhost)

Service: shop-api → routes to PostgREST

Deployment: shop-frontend (React app)

Service: shop-frontend

Ingress:
  /api → shop-api
  / → shop-frontend
```

---

## 4. Key Design Decisions

### 4.1 Sidecar Pattern (Zero-Hop)

PostgREST and PostgreSQL run in the same Pod.

* Connection string: `localhost:5432`
* No Kubernetes Service between them

**Reasoning:**

* Eliminates network hop latency
* Simplifies service discovery
* Matches tightly coupled API-DB model

**Tradeoff:**

* Cannot scale API independently of DB

---

### 4.2 Single-Tenant Isolation

* All resources deployed in `shop-1` namespace
* Dedicated database instance

**Reasoning:**

* Strong isolation
* Simplifies reasoning about data ownership

---

### 4.3 Thin API Layer (PostgREST)

* Auto-generates REST API from PostgreSQL schema
* No custom backend logic

**Reasoning:**

* Minimizes implementation effort
* Keeps focus on infra + architecture

---

### 4.4 Minimal Frontend

* React app fetches data from `/api/products`
* No routing/auth complexity

**Reasoning:**

* Only validates connectivity and flow

---

## 5. Data Flow

### Request Path

```text
Browser
  ↓
Ingress (shop1.local)
  ↓
Frontend Service
  ↓
React App (fetch /api/products)
  ↓
Ingress (/api route)
  ↓
shop-api Service
  ↓
PostgREST (same Pod)
  ↓
PostgreSQL (localhost)
```

---

## 6. Components

### 6.1 PostgreSQL

* Stores shop data
* Runs as container in Pod

Initial schema:

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name TEXT
);
```

---

### 6.2 PostgREST

* Connects to PostgreSQL via `localhost`
* Exposes REST endpoints

Example:

```
GET /products
```

---

### 6.3 Frontend

* React app
* Fetches from `/api/products`
* Displays product list

---

### 6.4 Kubernetes Resources

| Resource   | Purpose                     |
| ---------- | --------------------------- |
| Namespace  | Tenant isolation            |
| Pod        | DB + API sidecar            |
| Service    | Expose PostgREST internally |
| Deployment | Run frontend                |
| Ingress    | Route external traffic      |

---

## 7. Networking Model

### Internal

* PostgREST → PostgreSQL via `localhost`
* Frontend → PostgREST via ClusterIP Service

### External

* Domain: `shop1.local`
* Ingress routes:

  * `/` → frontend
  * `/api` → PostgREST

---

## 8. Deployment Steps

1. Create namespace
2. Deploy sidecar Pod (Postgres + PostgREST)
3. Create Service for PostgREST
4. Deploy frontend
5. Create frontend Service
6. Apply ingress
7. Initialize database schema manually

---

## 9. Validation Criteria

The POC is successful if:

* Visiting `shop1.local` loads frontend
* Frontend fetches `/api/products`
* API returns rows from PostgreSQL
* Data flows correctly end-to-end
* PostgREST connects via `localhost` (no network hop)

---

## 10. Limitations

* No persistence guarantees beyond default Pod lifecycle (unless PV added)
* No authentication or authorization
* No multi-tenant orchestration
* No observability (logs/metrics minimal)
* Manual DB initialization

---

## 11. Future Extensions

* Add persistent volumes for PostgreSQL
* Introduce centralized auth service (JWT)
* Automate shop provisioning (control plane)
* Convert static YAML into templates (Helm)
* Add schema migration system
* Explore replacing PostgREST with custom query layer

---

## 12. Summary

This POC validates a **sidecar-based, single-tenant architecture** where:

* Each shop runs its own isolated stack
* API and DB are colocated for zero-hop communication
* Kubernetes manages deployment and routing

The design intentionally prioritizes **simplicity and architectural clarity** over completeness, making it a strong base for further system evolution.
