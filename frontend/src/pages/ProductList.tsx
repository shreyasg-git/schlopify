import React, { useState } from 'react';
import { useProducts } from '../core/hooks/useProducts';
import { ProductCard, ProductGrid, Button } from '../registry/components';

export function ProductList() {
  const { products, stats, loading, error, fetchProducts } = useProducts();
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProducts(searchTerm);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <header className="mb-12 flex flex-col items-center text-center">
        <h1 className="text-4xl md:text-5xl font-black mb-4 uppercase tracking-tight">Shop Storefront</h1>
        <p className="text-foreground/60 text-lg max-w-2xl">
          Powered by PostgREST + PostgreSQL. Switch themes to see the architecture in action.
        </p>
        
        {stats && (
          <div className="mt-6 inline-flex items-center gap-4 bg-surface px-6 py-2 rounded-full border border-black/10 shadow-sm text-sm font-medium">
            <span>Total Products: {stats.total_products}</span>
            <span className="w-1 h-1 rounded-full bg-foreground/20"></span>
            <span>Total Characters: {stats.total_characters}</span>
          </div>
        )}
      </header>

      <form onSubmit={handleSearch} className="flex gap-4 max-w-2xl mx-auto mb-12">
        <input 
          type="text" 
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search products..."
          className="flex-1 h-12 px-4 rounded-button border-2 border-foreground/20 bg-surface text-foreground outline-none focus:border-primary transition-colors"
        />
        <Button type="submit" className="h-12 px-8">Search</Button>
      </form>

      {loading && (
        <div className="flex justify-center items-center py-20">
          <p className="text-xl font-medium animate-pulse">Loading products...</p>
        </div>
      )}
      
      {error && (
        <div className="bg-red-50 text-red-600 p-6 rounded-surface text-center font-medium max-w-2xl mx-auto border border-red-200">
          Error: {error}
        </div>
      )}
      
      {!loading && !error && products.length === 0 && (
        <div className="text-center py-20">
          <p className="text-xl text-foreground/50">No products found.</p>
        </div>
      )}

      {!loading && !error && products.length > 0 && (
        <ProductGrid>
          {products.map((p: any) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </ProductGrid>
      )}
    </div>
  );
}
