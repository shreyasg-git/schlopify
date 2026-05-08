import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './registry/ThemeProvider';
import { Layout } from './pages/Layout';
import { ProductList } from './pages/ProductList';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/products" replace />} />
            <Route path="products" element={<ProductList />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

