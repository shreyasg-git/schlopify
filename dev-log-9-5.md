# Developer Log - May 9, 2026

## Overview
This session focused on architecting, debugging, and deploying a multi-design-system frontend for the Schlopify platform. The primary goal was to construct a scalable architecture that allows completely swappable UI flavors (e.g., Minimal Modern vs. Brutalist) while sharing the exact same underlying business logic, API calls, and routing infrastructure. During the implementation and subsequent deployment to the local Kubernetes cluster (`shop-1`), we encountered and resolved a series of deep-dive architectural, containerization, and build toolchain issues.

---

## 1. Multi-Design-System Architecture Setup

**The Problem:** 
The Schlopify storefront needed a robust method to support 5+ entirely distinct visual styles. A naive approach would involve injecting massive `if (theme === 'brutalist')` conditionals inside every single React component, leading to highly coupled, bloated, and unmaintainable code. Furthermore, sending all CSS and components for all themes to the client would severely degrade performance.

**The Solution:**
We implemented an **Inversion of Control (IoC) Component Registry** paired with **Vite Code Splitting**.

1. **Decoupled Logic (Headless Hooks):** 
   All data fetching, state management, and business logic was isolated into pure React hooks. For example, `src/core/hooks/useProducts.ts` manages the API interaction with the PostgREST backend.
2. **Facade Component Layer:** 
   We created semantic, unstyled component facades (e.g., `src/registry/components/ProductCard.tsx`). The application pages import these facades instead of direct implementations.
3. **Dynamic Theme Provider:** 
   The `ThemeProvider` resolves the active theme at runtime. Using Vite's dynamic import capabilities, it fetches the actual React implementation and CSS variables lazily:
   ```tsx
   // src/registry/ThemeProvider.tsx
   useEffect(() => {
     import(`../themes/${themeName}/registry.tsx`).then((module) => {
       setComponents(module.components);
       import(`../themes/${themeName}/tokens.css`); // Lazy load CSS tokens
     });
   }, [themeName]);
   ```
4. **Tokenized Theming:** 
   Instead of hardcoding Tailwind colors (e.g., `bg-zinc-900`), we used CSS variables mapped in Tailwind:
   ```css
   /* themes/brutalist/tokens.css */
   :root[data-theme="brutalist"] {
     --color-primary: 50 100% 50%;
     --radius-surface: 0px;
     --shadow-brutal: 4px 4px 0px 0px rgba(0,0,0,1);
   }
   ```
**Result:** Vite natively chunked the build. A user browsing the `brutalist` theme downloads *only* `dist/assets/registry-<hash>.js` and its specific CSS token map.

---

## 2. Kubernetes Local Image Caching Issue

**The Problem:**
After scaffolding the architecture and verifying it locally via `npm run dev`, we built the Docker image (`shop-frontend:latest`) and loaded it into the Minikube cluster. A rollout restart was issued to the deployment. However, the browser continued to serve the old React application.

**The Root Cause:**
The original `k8s/deployment-frontend.yaml` was configured aggressively for caching:
```yaml
containers:
  - name: frontend
    image: shop-frontend:latest
    imagePullPolicy: IfNotPresent
```
When `minikube image load shop-frontend:latest` was executed, it successfully placed the new digest in the cluster's internal registry. However, when the Kubelet spun up the new pod, it evaluated the `IfNotPresent` rule against the `latest` tag. Because a layer with the `latest` tag *already existed* in the node's daemon cache from the previous build, the Kubelet bypassed the registry entirely and blindly booted the stale filesystem. 

Even after changing `imagePullPolicy` to `Always`, Minikube threw an `ImagePullBackOff` because it attempted to resolve `shop-frontend:latest` from Docker Hub rather than the local daemon cache.

**The Solution:**
We enforced an **incremental tag-bumping pipeline** to ensure the Kubelet recognized the image as genuinely new.
1. Altered `deploy.sh` to build explicit tags (`shop-frontend:v2`, then `v3`, `v4`).
2. Updated the deployment manifest to reference the exact tag:
   ```yaml
   image: shop-frontend:v4
   imagePullPolicy: IfNotPresent
   ```
Because `v4` did not exist in the Kubelet's cache, it was forced to unpack the freshly loaded `v4` minikube archive, successfully rolling out the new frontend.

---

## 3. TypeScript JSX Type Resolution Error

**The Problem:**
Upon transitioning the architecture from pure JavaScript (`.jsx`) to TypeScript (`.tsx`), the IDE surfaced a persistent compiler error across all React components:
`JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.`

**The Root Cause:**
The Vite project lacked a `tsconfig.json` file. Without it, the TypeScript Language Server defaults to standard DOM typings and refuses to interpret JSX syntax as React elements. Furthermore, the type definitions for React were not installed in the `node_modules`.

**The Solution:**
We established the TypeScript environment by:
1. Installing the definitions:
   ```bash
   npm install -D typescript @types/react @types/react-dom
   ```
2. Creating a rigorous `tsconfig.json` with the critical `jsx` compiler option configured for modern React:
   ```json
   {
     "compilerOptions": {
       "target": "ES2020",
       "jsx": "react-jsx",
       "moduleResolution": "bundler",
       "strict": true
     },
     "include": ["src"]
   }
   ```
This immediately bound `JSX.IntrinsicElements` to the React namespace, resolving all IDE intelligence errors.

---

## 4. Tailwind CSS v4 Vite Integration Failure

**The Problem:**
Following a successful build and deployment, the storefront UI was entirely unstyled. It rendered as raw HTML using default browser serifs. The Vite build output showed that the CSS chunk was suspiciously small (~8kB instead of the expected ~35kB), indicating that the Tailwind compiler was failing to inject the utility classes.

**The Root Cause:**
The `package.json` had upgraded the dependency to **Tailwind CSS v4** (`^4.3.0`), but the project was still configured using a legacy PostCSS pipeline designed for Tailwind v3 (`postcss.config.js` pointing to `tailwindcss`). 

Tailwind v4 features an entirely rewritten Rust-based engine that deprecates the old `@tailwind base;` directives and relies heavily on its dedicated Vite plugin (`@tailwindcss/vite`). 

When we attempted to use the Vite plugin, the build crashed with:
`[plugin: externalize-deps] "@tailwindcss/vite" resolved to an ESM file. ESM file cannot be loaded by require.`

**The Solution:**
We modernized the build pipeline to support Tailwind v4 and ES Modules natively:
1. **ESM Declaration:** Added `"type": "module"` to `package.json` to inform Node.js and Vite that configuration files should be treated as ES Modules.
2. **Vite Plugin Integration:** Removed PostCSS dependencies entirely and injected the Tailwind Vite plugin:
   ```javascript
   // vite.config.js
   import tailwindcss from '@tailwindcss/vite';
   export default defineConfig({
     plugins: [react(), tailwindcss()],
   });
   ```
3. **CSS Syntax Overhaul:** Replaced the deprecated directives in `src/index.css` with the v4 import syntax and referenced the config explicitly:
   ```css
   @import "tailwindcss";
   @config "../tailwind.config.js";
   ```
4. **Token Cleanup:** Stripped out all legacy `@tailwind` declarations from the individual theme `tokens.css` files, as they now solely function as standard CSS variable stores.

After a final rebuild (`v4`), Vite successfully compiled the full 34.84 kB utility sheet, and the Minimal Modern and Brutalist themes rendered flawlessly.
