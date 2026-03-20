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
