# OWASP Top 10 - 2025 Security Plan

This document outlines the strategic security plan for our application, focusing on protecting user and tenant data against the primary risks identified in the OWASP Top 10 guidelines (adapted for a modern, multi-tenant 2025 context). Given our multi-tenant architecture, specific emphasis is placed on strict data isolation, zero-trust principles, and defense-in-depth security.

---

## 1. Broken Access Control
**The Threat:** Attackers bypass authorization to access other users' or tenants' data, or elevate privileges to admin levels.
**Our Plan:**
*   **Strict Tenant Isolation:** Implement Row-Level Security (RLS) in the database to ensure a valid tenant identifier (`tenant_id`) is intrinsically required and enforced for every query.
*   **Zero Trust Architecture:** Every API endpoint must enforce explicit authorization checks (e.g., strictly validating JWT claims against the requested resource ownership).
*   **Deny by Default:** Ensure all routing and execution paths default to access denial unless explicitly granted by policy.
*   **Continuous Testing:** Integrate automated tools in the CI pipeline to test for Insecure Direct Object Reference (IDOR) to ensure users cannot manipulate payload IDs to access cross-tenant data.

### Implementation Summary
*   **Database Engine:** PostgreSQL utilizing strongly crafted RLS (Row-Level Security) policies. If using PostgREST, use `current_setting('request.jwt.claim.tenant_id')` to bind the DB context directly to incoming JWT claims.
*   **Backend Frameworks:** Custom middleware utilizing `PyJWT` (Python/FastAPI) or `jsonwebtoken` (Node.js/Express) to decode tokens, reject invalid signatures instantly, and inject the `tenant_id` into the request scope/context.
*   **Verification:** Integrate `OWASP ZAP` or `AuthMatrix` in E2E pipeline tests to assert cross-tenant HTTP 403 Forbidden responses.

## 2. Cryptographic Failures
**The Threat:** Exposure of sensitive data due to weak, deprecated, or missing cryptography in transit or at rest.
**Our Plan:**
*   **Data in Transit:** Strictly enforce TLS 1.3 across all external and internal microservice communication. Implement HTTP Strict Transport Security (HSTS).
*   **Data at Rest:** Encrypt sensitive PII, credentials, and financial information at the storage volume level and column level using modern algorithms.
*   **Secrets Management:** Utilize Kubernetes Secrets or a dedicated key-management vault. Absolutely no hardcoded secrets in source code.

### Implementation Summary
*   **Transit (Kubernetes):** Deploy `cert-manager` integrated with Let's Encrypt to automate TLS 1.3 certificate issuance and rotation. Configure NGINX Ingress rules with `force-ssl-redirect: "true"`.
*   **Data at Rest:** Use the `pgcrypto` extension in PostgreSQL for targeted column-level encryption (e.g., `PGP_SYM_ENCRYPT`).
*   **Hashing & Secrets:** Use `argon2-cffi` (Python) or `argon2` (Node.js) for robust password hashing. Manage credentials securely using `External-Secrets` Operator synced with AWS KMS or HashiCorp Vault.

## 3. Injection (SQL, NoSQL, OS Commands)
**The Threat:** Untrusted data is sent to an interpreter as part of a command or query, causing unintended execution.
**Our Plan:**
*   **Parameterized Queries Only:** Use modern ORMs or Query Builders exclusively. String concatenation for SQL queries is strictly prohibited.
*   **Rigorous Input Validation:** Implement strict, schema-based server-side validation to sanitize all incoming request payloads before they reach business logic.
*   **Execution Prevention:** Disable or strictly isolate unsafe API functions (like OS-level shell commands).

### Implementation Summary
*   **Database Queries:** Strictly mandate usage of ORMs like `SQLAlchemy` (Python) or `TypeORM`/`Prisma` (Node.js) which inherently parameterize SQL execution.
*   **Payload Validation:** Enforce heavy schema validation and coercion at the API boundary using `Pydantic` (Python) or `Zod` (TypeScript/Node.js). Break the pipeline on validation errors.
*   **Sanitization Scope:** Apply validation not just to JSON bodies, but strictly to URL query parameters and HTTP headers as well.

## 4. Insecure Design
**The Threat:** Flaws derived from poor architectural design and missing baseline security controls.
**Our Plan:**
*   **Proactive Threat Modeling:** Conduct structured threat modeling during the design phase of new features, prioritizing the prevention of cross-tenant data bleeding.
*   **Secure Defaults:** All configurations must default to their most restrictive and secure setting out-of-the-box.
*   **Granular Rate Limiting:** Implement rate limiting specific to both the tenant and the originating IP to prevent DoS, scraping, and brute-force attacks.

### Implementation Summary
*   **Ingress Level Limiting:** Apply NGINX Ingress annotations like `nginx.ingress.kubernetes.io/limit-rps` and `nginx.ingress.kubernetes.io/limit-connections` for broad mitigation.
*   **App Level Rate Limiting:** Utilize `slowapi` (FastAPI) or `express-rate-limit` (Node.js) backed by a Redis cluster for unified, cross-replica rate limiting (essential for distributed K8s pods).
*   **Design Frameworks:** Mandate STRIDE framework assessments before major architectural PRs are approved.

## 5. Security Misconfiguration
**The Threat:** Insecure default settings, open cloud buckets, misconfigured HTTP headers, and verbose error messages exposing system internals.
**Our Plan:**
*   **Infrastructure Hardening:** Automatically verify Kubernetes manifests, Dockerfiles, and cloud infrastructure pipelines against industry standards.
*   **Strict Security Headers:** Ensure robust HTTP security headers are enforced globally at the Ingress proxy.
*   **Safe Error Handling:** Intercept stack traces globally and return generic errors to clients.

### Implementation Summary
*   **Security Headers:** Use the `helmet` library (Node.js) or `Secure` middleware (FastAPI) to inject strict `Content-Security-Policy` (CSP), `X-Frame-Options`, and strip `.X-Powered-By`.
*   **Cluster Hardening:** Run `kube-bench` and `kube-hunter` to verify K8s cluster configurations against CIS Benchmarks. Enforce Pod `securityContext` settings (`runAsNonRoot: true`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`).
*   **Exception Masking:** Create custom global exception handlers that block 500-level stack traces and replace them with standard UI-friendly messages and a correlated trace UUID.

## 6. Vulnerable and Outdated Components
**The Threat:** Exploitation of known vulnerabilities hidden within third-party libraries, container images, or system frameworks.
**Our Plan:**
*   **Continuous Dependency Scanning:** Integrate automated SCA tools in the CI/CD pipeline to block PRs containing high/critical CVEs.
*   **Container Image Scanning:** Ensure all Docker base images and resulting artifacts are scanned for vulnerabilities before pushing to the registry.
*   **Aggressive Patch SLA:** Enforce strict Service Level Agreements (SLAs) for applying critical security patches.

### Implementation Summary
*   **Dependency Management:** Leverage `Dependabot` or `Renovate` for automated dependency updates and PR creation.
*   **CI Scanning Tools:** Introduce `Trivy` as a blocking step in your GitHub Actions / GitLab CI pipeline to scrutinize container builds (`frontend/Dockerfile`, `pod-shop-db.yaml` referenced images).
*   **Minimal Base Images:** Transition from bulky base OS images to distroless images (e.g., `gcr.io/distroless/python3` or `distroless/nodejs`) to drastically shrink the attack surface.

## 7. Identification and Authentication Failures
**The Threat:** Compromise of user passwords, cryptographic keys, or active session tokens.
**Our Plan:**
*   **Mandatory Multi-Factor Authentication (MFA):** Require MFA for administrative capabilities, tenant-owner accounts, and sensitive actions.
*   **Strong Password Policies:** Prevent the use of compromised credentials by checking against known-breached password databases.
*   **Secure Session Management:** Use standardized, secure cookies or short-lived, rotated JWTs.

### Implementation Summary
*   **Identity Provider (IdP):** Consider using robust, out-of-the-box IdPs like `Keycloak`, `Auth0`, or `Supabase Auth` to securely offload MFA, rate-limiting, and OAuth2/OIDC flows.
*   **Secure Session Flags:** For custom session management, ensure cookies are rigorously set with: `Secure`, `HttpOnly`, `SameSite=Strict`.
*   **Token Lifecycle:** Implement short expirations for Access Tokens (e.g., 15 mins) and enforce a Redis-backed deny-list / Refresh Token rotation pattern for explicit logouts.

## 8. Software and Data Integrity Failures
**The Threat:** Code or infrastructure execution that does not guarantee integrity (e.g., insecure CI/CD pipelines, untrusted auto-updates, or tampered CDNs).
**Our Plan:**
*   **Pipeline Security Controls:** Limit deployment capabilities strictly to defined/authenticated CI/CD pipelines.
*   **Signed Artifacts:** Require verified signatures for code commits and container image generation.
*   **Subresource Integrity (SRI):** External static assets must strictly utilize SRI verification attributes.

### Implementation Summary
*   **Container Trust:** Utilize `Cosign` (from Sigstore) to formally sign container images and configure a Kubernetes admission controller (such as `Kyverno`) to verify image signatures prior to scheduling.
*   **Frontend Security:** Configure build tools like `Vite` or `Webpack` to automatically inject `integrity` attributes into `<script>` and `<link>` tags to guarantee CDN payloads haven't been tampered with.

## 9. Security Logging and Monitoring Failures
**The Threat:** The inability to detect, escalate, and respond efficiently to active breaches and unauthorized access attempts.
**Our Plan:**
*   **Centralized Telemetry:** Aggregate logs from all microservices, gateways, and databases securely into a central SIEM platform.
*   **Immutable Audit Trails:** Maintain highly detailed logs of all critical tenant actions tagged securely with identifiers.
*   **Real-time Alerting:** Configure heuristic and threshold-based alerts for highly suspicious behavior.

### Implementation Summary
*   **Structured Logging Frameworks:** Mandate `.json` log lines using `python-json-logger` (Python) or `winston` (Node.js) so SIEM systems can parse key-value pairs trivially.
*   **Telemetry Injection:** Utilize custom middleware to extract incoming `tenant_id` and OpenTelemetry `trace_id` headers to be automatically appended to backend log outputs.
*   **Aggregation:** Deploy `Fluentbit` as a DaemonSet to stream all K8s pod stdout logs to Datadog, Elasticsearch, or Loki.

## 10. Server-Side Request Forgery (SSRF)
**The Threat:** A flaw where the web application fetches a remote resource without strictly validating the user-supplied URL, allowing access to internal servers and cloud metadata.
**Our Plan:**
*   **Strict Allow-listing:** If the application must fetch external remote resources, strictly validate and allow-list destination URLs.
*   **Network Segmentation:** Deploy strict Kubernetes Network Policies (Default Deny). Ensure application pods cannot route traffic to out-of-scope internal network ranges.

### Implementation Summary
*   **K8s Network Policies:** Write a `k8s/network-policy.yaml` with a Default Deny setup. Explicitly restrict pod egress so the backend cannot access internal databases it doesn't need or the notorious Cloud Metadata IP (`169.254.169.254`).
*   **Application Defenses:** Use rigorous libraries (e.g., `ssrf-req-filter` in Node.js) when executing webhooks using `axios` or `fetch` to ensure domain name resolution doesn't resolve to private IP blocks (`10.x.x.x`, `127.x.x.x`, `192.168.x.x`).
