# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────────────────────
FROM nginx:1.25-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy nginx config as a TEMPLATE (envsubst will process it at runtime)
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Default theme (can be overridden via env var in K8s deployment)
ENV SHOP_THEME=minimal

EXPOSE 80

# nginx:1.25-alpine's default entrypoint already runs envsubst on
# /etc/nginx/templates/*.template → /etc/nginx/conf.d/
# We just need to tell it which env vars to substitute
ENV NGINX_ENVSUBST_TEMPLATE_SUFFIX=.template
CMD ["nginx", "-g", "daemon off;"]
