-- Initial schema for shop-1
-- Run this manually after the shop-db Pod is ready:
--
--   kubectl wait --for=condition=Ready pod/shop-db -n shop-1 --timeout=120s
--   kubectl exec -n shop-1 shop-db -c postgres -- \
--     psql -U shopuser -d shopdb -c "$(cat k8s/db-init.sql)"

CREATE TABLE IF NOT EXISTS products (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

INSERT INTO products (name) VALUES
  ('Widget A'),
  ('Widget B'),
  ('Gadget Pro'),
  ('Doohickey X')
ON CONFLICT DO NOTHING;

-- DB functions to be exposed via PostgREST
CREATE OR REPLACE FUNCTION search_products(search_term text)
RETURNS SETOF products AS $$
  SELECT * FROM products WHERE name ILIKE '%' || search_term || '%';
$$ LANGUAGE sql STABLE;

CREATE TYPE product_stats AS (total_products int, total_characters int);

CREATE OR REPLACE FUNCTION get_stats()
RETURNS product_stats AS $$
  SELECT count(*)::int, coalesce(sum(length(name)), 0)::int FROM products;
$$ LANGUAGE sql STABLE;
