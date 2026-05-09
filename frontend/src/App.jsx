import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./registry/ThemeProvider";
import { Layout } from "./pages/Layout";
import { ProductList } from "./pages/ProductList";
import { Login } from "./pages/Login";
import { LoginCallback } from "./pages/LoginCallback";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/login" replace />} />
            <Route path="products" element={<ProductList />} />
            <Route path="login" element={<Login />} />
            <Route path="login-callback" element={<LoginCallback />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
