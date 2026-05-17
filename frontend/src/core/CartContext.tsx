import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Simple UUID generator
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function getSessionId() {
  let sessionId = localStorage.getItem('cart_session_id');
  if (!sessionId) {
    sessionId = generateUUID();
    localStorage.setItem('cart_session_id', sessionId);
  }
  return sessionId;
}

export interface CartItem {
  id: number;
  session_id: string;
  quantity: number;
  product_id: number;
  name: string;
  price: number;
  image_url: string;
}

interface CartContextType {
  items: CartItem[];
  loading: boolean;
  error: string | null;
  addToCart: (productId: number | string) => Promise<void>;
  removeFromCart: (cartItemId: number) => Promise<void>;
  clearCart: () => Promise<void>;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sessionId = getSessionId();

  const fetchCart = useCallback(async () => {
    try {
      const res = await fetch(`/api/cart_details?session_id=eq.${sessionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const addToCart = async (productId: number | string) => {
    try {
      // Check if product already in cart
      const existingItem = items.find(item => item.product_id.toString() === productId.toString());
      
      let res;
      if (existingItem) {
        // Update quantity
        res = await fetch(`/api/cart_items?id=eq.${existingItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantity: existingItem.quantity + 1 })
        });
      } else {
        // Insert new item
        res = await fetch(`/api/cart_items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, product_id: Number(productId), quantity: 1 })
        });
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchCart();
    } catch (err: any) {
      console.error('Failed to add to cart:', err);
      alert('Failed to add item to cart. Please try again.');
    }
  };

  const removeFromCart = async (cartItemId: number) => {
    try {
      const res = await fetch(`/api/cart_items?id=eq.${cartItemId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchCart();
    } catch (err: any) {
      console.error('Failed to remove from cart:', err);
    }
  };

  const clearCart = async () => {
    try {
      const res = await fetch(`/api/cart_items?session_id=eq.${sessionId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchCart();
    } catch (err: any) {
      console.error('Failed to clear cart:', err);
    }
  };

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <CartContext.Provider value={{ items, loading, error, addToCart, removeFromCart, clearCart, totalItems, totalPrice }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
