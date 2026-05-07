# Schlopify Configuration: First Principles Explainer

This document explains every configuration file in this project from first principles. We will build our understanding from the ground up: starting with the database, moving to the API, then the frontend, and finally the network routing that ties it all together.

---

## 1. The Foundation: Namespaces and the Database

### `k8s/namespace.yaml`
**What it does:** Creates an isolated environment called `shop-1`.
**First Principles:** In Kubernetes, a physical cluster can host dozens of applications. A Namespace provides a logical "fence" around resources. By putting all our resources in the `shop-1` namespace, we ensure they don't accidentally conflict with other applications (or other instances of this shop).

### `k8s/db-init.sql`
**What it does:** Defines the initial structure and logic of our database.
**First Principles:** Before an application can store data, it needs a blueprint (schema).
1. It creates a `products` table and inserts some initial mock data.
2. It introduces two functions (`search_products` and `get_stats`). This is crucial for our architecture: instead of writing a traditional backend server (like Node.js or Python) to handle business logic, we put the logic directly into the database as SQL functions. When combined with PostgREST (explained below), these functions instantly become callable API endpoints.

---

## 2. The Data Layer: The "Sidecar" Pod

### `k8s/pod-shop-db.yaml`
**What it does:** Deploys a single unit of compute (a Pod) containing *two* containers: PostgreSQL and PostgREST.
**First Principles:** In Kubernetes, the smallest deployable unit is a "Pod". Usually, a Pod contains one container. However, you can put multiple tightly-coupled containers in the same Pod—a pattern known as a "Sidecar".
- **Container 1 (Postgres):** Runs the actual database engine using the credentials `shopuser`/`shoppass`.
- **Container 2 (PostgREST):** A specialized web server that reads the Postgres database schema and automatically generates a complete RESTful API.
- **Why group them?** Because they share the same network namespace within the Pod, PostgREST can securely connect to Postgres using `localhost:5432` without traffic ever leaving the pod. This eliminates latency (zero network hop) and improves security.

### `k8s/service-shop-api.yaml`
**What it does:** Creates a stable network endpoint (`shop-api`) for the PostgREST server.
**First Principles:** Pods are ephemeral; they can be deleted and recreated with new IP addresses. If the frontend tried to talk directly to the `shop-db` Pod's IP, the connection would eventually break. A "Service" acts as a stable load balancer. It intercepts traffic on port 3000 and forwards it to the dynamically changing underlying Pod.

---

## 3. The Presentation Layer: The React Frontend

### `k8s/deployment-frontend.yaml`
**What it does:** Deploys and manages the React application.
**First Principles:** Unlike our database (which is currently just a raw Pod), the frontend is managed by a "Deployment". Deployments provide self-healing and scaling. If the frontend container crashes, the Deployment controller automatically spins up a new one. It ensures that precisely `1` replica of the frontend is running at all times. It runs the custom `shop-frontend:latest` image on port 80.

### `k8s/service-frontend.yaml`
**What it does:** Creates a stable network endpoint (`shop-frontend`) for the React app.
**First Principles:** Just like the API service, this gives other parts of the cluster a stable DNS name (`http://shop-frontend`) to reach the React application, regardless of what the underlying Pod IP happens to be.

### `frontend/nginx.conf`
**What it does:** configures the web server running *inside* the frontend container.
**First Principles:** A React app compiles down to static HTML, CSS, and JS files. We need a web server (NGINX) to serve these files to visitors.
- **Serving Files:** It tells NGINX to serve `index.html` from `/usr/share/nginx/html`. For any path requested (e.g., `/products`), it uses `try_files` to elegantly route traffic back to `index.html`, allowing React Router to handle client-side page changes (Single Page Application routing).
- **Internal Proxy:** It includes an internal proxy rule for `/api/`. When the Javascript code makes a request to `/api/get_stats`, NGINX intercepts it and forwards it internally to `http://shop-api:3000/`. This helps avoid Cross-Origin Resource Sharing (CORS) issues because the browser thinks everything is coming from the same server.

---

## 4. The Edge: Routing External Traffic

### `k8s/ingress.yaml`
**What it does:** Acts as the cluster's front door, routing HTTP traffic (`shop1.local`) to the correct internal Services.
**First Principles:** "Services" are typically internal to the cluster. An "Ingress" exposes them to the outside world based on URL rules. This file defines two main paths:
1. **Frontend (`/`):** Traffic going to the root `shop1.local/` is routed directly to the `shop-frontend` service. This returns the HTML/CSS/JS.
2. **API (`/api`):** Traffic going to `shop1.local/api/*` is routed to the `shop-api` service. Crucially, it uses an annotation (`rewrite-target: /$2`) to strip the `/api` prefix. PostgREST doesn't know about the `/api` prefix—it expects requests like `/products` or `/rpc/get_stats`. The Ingress cleanly removes `/api` before passing the request to PostgREST.

---

### Summary of the Request Lifecycle
1. User visits `http://shop1.local` in their browser.
2. The **Ingress** routes the request to the `shop-frontend` **Service**.
3. The Service forwards it to the frontend **Deployment**, served by **NGINX**.
4. NGINX returns the React app.
5. The React app runs in the browser and makes a fetch request to `http://shop1.local/api/rpc/get_stats`.
6. The request hits the **Ingress**, which strips `/api` and routes `/rpc/get_stats` to the `shop-api` **Service**.
7. The Service forwards it to the **PostgREST** container inside the `shop-db` **Pod**.
8. PostgREST uses `localhost` to instantly query the **Postgres** database container.
9. Postgres executes the custom SQL function defined in `db-init.sql`, returning JSON data continuously back through the chain to the user's browser.
