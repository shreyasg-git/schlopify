import { useState, useEffect } from 'react';

export default function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/products')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setProducts(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>🛒 Shop 1 — Storefront</h1>
        <p style={styles.subtitle}>Powered by PostgREST + PostgreSQL (sidecar)</p>
      </header>

      <main style={styles.main}>
        {loading && <p style={styles.status}>Loading products…</p>}
        {error && <p style={styles.error}>Error: {error}</p>}
        {!loading && !error && products.length === 0 && (
          <p style={styles.status}>No products found.</p>
        )}
        <ul style={styles.list}>
          {products.map((p) => (
            <li key={p.id} style={styles.card}>
              <span style={styles.id}>#{p.id}</span>
              <span style={styles.name}>{p.name}</span>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

const styles = {
  page: {
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    color: '#eee',
    margin: 0,
    padding: 0,
  },
  header: {
    padding: '2rem',
    textAlign: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 700,
    margin: 0,
    color: '#fff',
  },
  subtitle: {
    marginTop: '0.5rem',
    color: 'rgba(255,255,255,0.5)',
    fontSize: '0.9rem',
  },
  main: {
    maxWidth: '640px',
    margin: '2rem auto',
    padding: '0 1rem',
  },
  status: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.6)',
  },
  error: {
    textAlign: 'center',
    color: '#ff6b6b',
    fontWeight: 600,
  },
  list: {
    listStyle: 'none',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    padding: '1rem 1.25rem',
    backdropFilter: 'blur(8px)',
  },
  id: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
    minWidth: '36px',
  },
  name: {
    fontWeight: 500,
    fontSize: '1rem',
  },
};
