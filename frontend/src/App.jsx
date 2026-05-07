import { useState, useEffect } from 'react';

export default function App() {
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProducts = (term) => {
    setLoading(true);
    setError(null);
    let url = '/api/products';
    let options = {};

    if (term.trim() !== '') {
      url = '/api/rpc/search_products';
      options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_term: term }),
      };
    }

    fetch(url, options)
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
  };

  useEffect(() => {
    fetch('/api/rpc/get_stats', { method: 'POST' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setStats(data);
      })
      .catch(console.error);
      
    fetchProducts('');
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchProducts(searchTerm);
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>🛒 Shop 1 — Storefront</h1>
        <p style={styles.subtitle}>Powered by PostgREST + PostgreSQL (sidecar)</p>
        {stats && (
          <div style={styles.stats}>
            Total Products: {stats.total_products} | Total Characters: {stats.total_characters}
          </div>
        )}
      </header>

      <main style={styles.main}>
        <form onSubmit={handleSearch} style={styles.searchForm}>
          <input 
            type="text" 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search products..."
            style={styles.searchInput}
          />
          <button type="submit" style={styles.searchButton}>Search</button>
        </form>

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
  stats: {
    marginTop: '1rem',
    color: '#00e5ff',
    fontWeight: 'bold',
    fontSize: '0.9rem',
    background: 'rgba(0, 229, 255, 0.1)',
    padding: '0.5rem 1rem',
    borderRadius: '20px',
    display: 'inline-block',
  },
  searchForm: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '2rem',
  },
  searchInput: {
    flex: 1,
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(0,0,0,0.2)',
    color: '#fff',
    fontSize: '1rem',
    outline: 'none',
  },
  searchButton: {
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    background: '#00e5ff',
    color: '#000',
    fontWeight: 'bold',
    fontSize: '1rem',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
};
