# Single-Tenant E-Commerce Deployment Platform (Sidecar DB Architecture)

## 1. Overview

This system is a platform that allows users (shop owners) to create and deploy fully functional e-commerce websites with a single action. Each deployment provisions an isolated, single-tenant stack consisting of:

* PostgreSQL (database)
* PostgREST (API layer)
* React frontend (storefront)

The platform guarantees **strong isolation per shop** and **low-latency data access** by colocating PostgREST and PostgreSQL within the same Pod (sidecar pattern), eliminating network hops between API and database.

---

## 2. Core Design Principles

### 2.1 Single-Tenant Isolation

Each shop gets:

* Dedicated PostgreSQL instance
* Dedicated PostgREST instance
* Dedicated frontend deployment
* Separate Kubernetes namespace

This ensures:

* No noisy neighbor issues
* Independent scaling and lifecycle
* Strong data isolation

---

### 2.2 Zero-Hop Data Access

PostgREST and PostgreSQL run inside the same Pod:

* Communication via `localhost`
* No Kubernetes Service routing
* No CNI/network overhead

**Outcome:**

* Microsecond-level API-to-DB latency
* Predictable performance
* Reduced tail latency

---

### 2.3 Stateless Control Plane

The platform backend is stateless and responsible only for:

* Authentication
* Shop provisioning
* Lifecycle management

All runtime state lives inside tenant deployments.

---

## 3. High-Level Architecture

### 3.1 Control Plane (Shared)

Components:

* Auth Service (centralized JWT issuer)
* Platform API (shop creation, orchestration)
* CI/CD system (Jenkins)

Responsibilities:

* User authentication (owners + customers)
* Provisioning tenant infrastructure
* Managing deployments via Kubernetes API

---

### 3.2 Data Plane (Per Shop)

Each shop is deployed as:

```
Namespace: shop-{id}

Pod:
  - postgres (localhost:5432)
  - postgrest (localhost:3000)

Deployment:
  - frontend (React app)

Ingress:
  - shop-{id}.platform.com → frontend
```

---

## 4. Authentication Model

### 4.1 Centralized Auth Service

A single auth service issues JWT tokens for both:

* Shop Owners
* Shop Customers

### 4.2 Token Structure

```
{
  user_id: string,
  user_type: "owner" | "customer",
  shop_id: string,
  exp: timestamp
}
```

### 4.3 Validation

* PostgREST validates JWT using shared secret/public key
* Row-level security (RLS) in PostgreSQL enforces per-user access

---

## 5. Deployment Flow

### Step 1: User Action

* User logs in
* Clicks “Create Shop”

### Step 2: Control Plane

* Generates `shop_id`
* Calls Kubernetes API

### Step 3: Kubernetes Provisions

* Creates namespace: `shop-{id}`
* Deploys Pod:

  * PostgreSQL container
  * PostgREST container (configured to use localhost)
* Deploys frontend
* Configures ingress

### Step 4: Output

User receives:

```
https://shop-{id}.platform.com
```

---

## 6. Pod Design (Sidecar Pattern)

### Pod Composition

```
Pod: shop-db

Containers:
  - postgres
  - postgrest
```

### Communication

* PostgREST connects to:

  ```
  postgres://localhost:5432
  ```

### Benefits

* Zero network hops
* Reduced latency
* Simplified service discovery
* Strong coupling (intentional)

### Tradeoff

* Cannot scale PostgREST independently of PostgreSQL

---

## 7. Technology Roles

### Docker

* Packages all services into container images
* Ensures reproducibility

---

### Kubernetes

* Orchestrates deployments
* Provides:

  * Namespaces (tenant isolation)
  * Pods (sidecar execution)
  * Ingress (routing)
  * Self-healing

---

### Jenkins

* CI/CD pipeline:

  * Build Docker images
  * Push to registry
  * Deploy to Kubernetes

---

### Ansible

* Bootstraps infrastructure:

  * Install Docker
  * Setup Kubernetes cluster
* Not used during runtime

---

## 8. Data Model Strategy

### Per-Shop Database

Each shop has:

* Independent PostgreSQL instance
* Fixed schema (initially minimal)

Example tables:

* products
* orders
* users (customers)

---

### Future Extensions

* Schema customization per shop
* Migration system
* Plugin system for extensions

---

## 9. Networking

### Internal

* No service between PostgREST and PostgreSQL
* Uses localhost

### External

* Ingress routes:

  * `shop-{id}.platform.com` → frontend
  * frontend → PostgREST (cluster-internal)

---

## 10. Scaling Strategy

### Horizontal Scaling

* Scale by adding more shops (namespaces)

### Vertical Scaling

* Increase resources per Pod:

  * CPU/memory for Postgres

### Limitation

* API and DB scale together (due to sidecar design)

---

## 11. Failure Model

### Pod Failure

* Entire shop (DB + API) restarts together

### Node Failure

* Pod rescheduled on another node

### Data Persistence

* Backed by Persistent Volumes (PV)

---

## 12. Security Considerations

* Namespace isolation per tenant
* JWT-based stateless auth
* PostgreSQL RLS for fine-grained access
* Secrets managed via Kubernetes Secrets

---

## 13. Future Directions

* Replace PostgREST with custom query layer
* Introduce read replicas for scaling
* Multi-region deployment
* In-memory DB integration (Masstree + OCC)
* Tenant-level autoscaling policies

---

## 14. Summary

This design prioritizes:

* Strong tenant isolation
* Minimal latency between API and DB
* Simplicity of deployment per shop

By using a **sidecar architecture**, it eliminates unnecessary network overhead while maintaining a clean, scalable control plane powered by Kubernetes.

The system is intentionally biased toward **systems clarity and performance**, making it a strong foundation for deeper experimentation in database and distributed system design.
