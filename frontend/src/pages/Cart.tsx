import React from 'react';
import { useCart } from '../core/CartContext';
import { Button } from '../registry/components';

export function Cart() {
  const { items, loading, error, removeFromCart, clearCart, totalItems, totalPrice } = useCart();

  const handleCheckout = async () => {
    if (items.length === 0) return;
    
    // Fake checkout process
    alert(`Checkout successful! You paid $${totalPrice.toFixed(2)} for ${totalItems} items.`);
    await clearCart();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-xl animate-pulse">Loading cart...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-red-50 text-red-600 p-6 rounded text-center border border-red-200">
          Error loading cart: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-black mb-8 uppercase tracking-tight">Your Cart</h1>
      
      {items.length === 0 ? (
        <div className="text-center py-20 bg-surface rounded-surface border border-black/10">
          <p className="text-xl text-foreground/50 mb-6">Your cart is empty.</p>
          <a href="/products" className="text-primary font-bold hover:underline">
            Continue Shopping
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-8 md:flex-row">
          <div className="flex-grow space-y-4">
            {items.map((item) => (
              <div key={item.id} className="flex gap-4 items-center bg-surface p-4 rounded-surface border border-black/10 shadow-sm">
                <div className="w-20 h-20 bg-black/5 rounded-sm overflow-hidden flex-shrink-0">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-black/40">No Img</div>
                  )}
                </div>
                <div className="flex-grow">
                  <h3 className="font-bold text-lg">{item.name}</h3>
                  <p className="text-foreground/60">${Number(item.price).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-medium bg-foreground/5 px-3 py-1 rounded">Qty: {item.quantity}</span>
                  <button 
                    onClick={() => removeFromCart(item.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded transition-colors"
                    aria-label="Remove item"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="md:w-80 flex-shrink-0">
            <div className="bg-surface p-6 rounded-surface border border-black/10 shadow-brutal flex flex-col gap-4 sticky top-6">
              <h2 className="text-2xl font-black uppercase mb-2 border-b-2 border-black/10 pb-2">Order Summary</h2>
              <div className="flex justify-between items-center text-lg">
                <span className="text-foreground/70">Total Items:</span>
                <span className="font-bold">{totalItems}</span>
              </div>
              <div className="flex justify-between items-center text-xl mb-4">
                <span className="font-bold">Total Price:</span>
                <span className="font-black">${totalPrice.toFixed(2)}</span>
              </div>
              
              <Button onClick={handleCheckout} className="w-full h-14 text-lg mt-auto">
                Checkout Now
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
