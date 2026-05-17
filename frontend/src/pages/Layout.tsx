import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { ThemeProvider } from '../registry/ThemeProvider';
import { useCart } from '../core/CartContext';

export function Layout() {
  // In a real app, the theme would be determined by the tenant/domain, e.g., using window.location.hostname
  // For demo purposes, we will use a state to toggle between themes
  const [activeTheme, setActiveTheme] = React.useState('minimal');
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);
  
  const { totalItems } = useCart();

  React.useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem('shop_token'));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('shop_token');
    setIsLoggedIn(false);
  };

  const shopName = window.location.hostname.split('.')[0] || 'Demo Shop';

  return (
    <ThemeProvider themeName={activeTheme}>
      <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
        <header className="border-b border-foreground/10 py-4 px-6 flex justify-between items-center bg-surface sticky top-0 z-50">
          <Link to="/products" className="font-bold text-xl uppercase tracking-wider hover:opacity-80 transition-opacity">
            {shopName}
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-foreground/5 px-2 py-1 rounded">
              <span className="text-xs font-medium uppercase tracking-widest text-foreground/50">Theme</span>
              <select 
                className="bg-transparent border-none text-sm outline-none font-medium cursor-pointer"
                value={activeTheme} 
                onChange={(e) => setActiveTheme(e.target.value)}
              >
                <option value="minimal">Minimal</option>
                <option value="brutalist">Brutalist</option>
              </select>
            </div>
            
            <Link to="/cart" className="relative p-2 hover:bg-foreground/5 rounded-full transition-colors group flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="21" r="1"></circle>
                <circle cx="19" cy="21" r="1"></circle>
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path>
              </svg>
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center border-2 border-surface">
                  {totalItems}
                </span>
              )}
            </Link>
            
            {isLoggedIn ? (
              <button onClick={handleLogout} className="text-sm font-medium hover:opacity-70 transition-opacity">
                Logout
              </button>
            ) : (
              <a href="/login" className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-bold uppercase tracking-wider hover:opacity-90 transition-opacity">
                Login
              </a>
            )}
          </div>
        </header>
        
        <Outlet />
      </div>
    </ThemeProvider>
  );
}
