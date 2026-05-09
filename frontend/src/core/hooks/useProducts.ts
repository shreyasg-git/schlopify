import { useState, useEffect, useCallback } from 'react';

export function useProducts() {
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState<{ total_products: number; total_characters: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback((term: string = '') => {
    setLoading(true);
    setError(null);
    let url = '/api/products';
    let options: RequestInit = {};

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
  }, []);

  useEffect(() => {
    fetch('/api/rpc/get_stats', { method: 'POST' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setStats(data);
      })
      .catch(console.error);
      
    fetchProducts('');
  }, [fetchProducts]);

  return {
    products,
    stats,
    loading,
    error,
    fetchProducts,
  };
}
