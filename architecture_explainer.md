# Schlopify: Zero-Hop Architecture Explainer

This document provides an in-depth explanation of the Schlopify Proof-of-Concept (POC) deployment model. It breaks down the core components, networking, and design choices behind this single-tenant, sidecar-based e-commerce platform.

---

## 1. High-Level Concept

Schlopify is designed to provide **maximum tenant isolation** combined with **minimal database latency**. 

Instead of traditional architectures where a fleet of stateless microservices talk to a shared, centralized database cluster, Schlopify provisions a **dedicated micro-stack per tenant**. Every shop gets exactly one Kubernetes Namespace containing its own independent database, API layer, and frontend.

### The "Zero-Hop" Philosophy

The defining characteristic of this architecture is the **Sidecar Pattern**. By deploying the API layer (PostgREST) and the database (PostgreSQL) directly into the **same Kubernetes Pod**, they share a network namespace.

This means the API talks to the database via `localhost`, completely bypassing Kubernetes DNS, kube-proxy, CNI overlays, and external network hops. This results in microsecond-latency data access.

---

## 2. Infrastructure Components

### 2.1 The Data Plane (Pod: `shop-db`)

At the heart of the tenant's backend is a single Kubernetes Pod running two containers.

#### Container A: PostgreSQL (port 5432)
- **Role:** The authoritative data store for the shop.
- **Image:** `postgres:15-alpine`
- **Why:** Relational databases are strongly consistent. By giving each tenant their own instance, there is no "noisy neighbor" problem where a poorly written query in Shop A slows down Shop B.

#### Container B: PostgREST (port 3000)
- **Role:** Auto-generates a fully-featured REST API from the PostgreSQL schema.
- **Image:** `postgrest/postgrest:v12.0.2`
- **Why:** PostgREST eliminates the need for an ORM or custom backend code for basic CRUD operations. If a table or view exists in PostgreSQL, PostgREST instantly exposes it as an HTTP endpoint. It acts as an ultra-thin query translation layer.
- **The Magic Link:** PostgREST connects using `PGRST_DB_URI=postgres://.../shopdb@localhost:5432`. It reaches across the Pod's shared filesystem/network boundary directly into PostgreSQL.

### 2.2 The Presentation Layer (Deployment: `shop-frontend`)

- **Role:** The customer-facing storefront (React SPA).
- **Image:** A custom Docker image (`shop-frontend:latest`) built with Vite and served by NGINX.
- **Why NGINX?** NGINX serves the static React assets (`index.html`, `.js`, `.css`) extremely efficiently. More importantly, it acts as a **reverse proxy** for the API, forwarding requests that hit `/api/` down to the backend. This prevents Cross-Origin Resource Sharing (CORS) issues because the frontend and API share the exact same origin domain.

### 2.3 The Networking Layer (Ingress & Services)

How does traffic get from a user's browser to the correct database?

1. **Host (`shop1.local`)**: NGINX Ingress Controller inspects the HTTP Host header. If it sees `shop1.local`, it funnels traffic into the `shop-1` namespace.
2. **Path Routing**: Ingress uses two separate rules to handle traffic:
   - **Frontend Ingress (`shop-ingress-frontend`)**: Any request starting with `/` (e.g., `/assets/main.js`) is routed exactly as-is to the `shop-frontend` Service.
   - **API Ingress (`shop-ingress-api`)**: Any request starting with `/api/` (e.g., `/api/products`) is intercepted. The Ingress **strips** the `/api` prefix (using `rewrite-target: /$2`) and forwards the clean request (e.g., `/products`) to the `shop-api` Service.

---

## 3. The Lifecycle of a Request

Let's trace what happens when a customer visits `http://shop1.local` and sees the product list.

#### Phase 1: Loading the SPA
1. Browser requests `GET http://shop1.local/`.
2. NGINX Ingress checks its rules, matches the default `/` path, and forwards to `shop-frontend` Service (port 80).
3. The NGINX container inside the `shop-frontend` Pod returns the 332-byte `index.html` shell.
4. The browser reads `index.html` and sees a `<script src="/assets/index-BFR...js">`.
5. Browser requests `GET http://shop1.local/assets/...js`.
6. Ingress forwards this (unmodified) to `shop-frontend`, which serves the Vite JS bundle.
7. React boots up in the browser.

#### Phase 2: Fetching Data
1. React mounts `<App />` and fires `fetch('/api/products')`.
2. Browser sends `GET http://shop1.local/api/products`.
3. NGINX Ingress intercepts this via the `/api/` rule.
4. **Rewrite:** Ingress strips `/api` and forwards the request as `GET /products` to the `shop-api` Service.
5. The `shop-api` Service routes the TCP connection to port 3000 of the `shop-db` Pod.
6. **PostgREST** receives `GET /products`.
7. **Zero-Hop Query:** PostgREST instantly translates this to `SELECT * FROM products;` and fires it via the persistent connection to `localhost:5432`.
8. PostgreSQL executes the query and returns binary rows.
9. PostgREST streams the result back as a JSON array (`[{"id":1, "name":"Widget A"}]`).
10. NGINX Ingress passes the JSON back to the browser.
11. React receives the JSON and renders the UI.

---

## 4. Tradeoffs & Limitations

This architecture is deeply opinionated and prioritizes **isolation and latency** over resource efficiency.

**The Benefits:**
- **Zero-Hop Latency:** Removing network calls between the API and DB dramatically reduces response times, particularly for complex endpoints that require multiple round-trips.
- **Security & Blast Radius:** If `shop-1` is compromised or overwhelmed by traffic, `shop-2` is completely insulated. They share no compute, memory, or network routing beyond the K8s node level.
- **Simplicity:** No need to manage complex multi-tenant query routing, schema partitioning, or row-level security (RLS) data-leakage risks in the application code.

**The Costs:**
- **Resource Overhead:** Every shop requires at least two dedicated long-running containers (Postgres + PostgREST). Running 10,000 shops means running 10,000 idle databases, consuming massive amounts of base RAM. 
- **Coupled Scaling:** Because PostgREST and PostgreSQL are in the same Pod, they must scale vertically together. You cannot spin up 5 PostgREST API nodes pointing to 1 PostgreSQL node. If the API is CPU-bound, you must scale up the DB container as well.
- **Cold Starts:** If a tenant's Pod is evicted or crashes, restarting takes seconds (PostgreSQL boot time) rather than milliseconds.

## 5. Summary

The Schlopify POC proves that Kubernetes primitives (Namespaces, Pods, sidecars, and advanced Ingress rewriting) can be composed to build a platform that gives every user a dedicated, ultra-fast, "private" slice of infrastructure, abstracted entirely behind a unified domain routing layer.
