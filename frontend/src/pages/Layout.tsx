import React from 'react';
import { Outlet } from 'react-router-dom';
import { ThemeProvider } from '../registry/ThemeProvider';

export function Layout() {
  // In a real app, the theme would be determined by the tenant/domain, e.g., using window.location.hostname
  // For demo purposes, we will use a state to toggle between themes
  const [activeTheme, setActiveTheme] = React.useState('minimal');
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);

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
        <header className="border-b border-foreground/10 py-4 px-6 flex justify-between items-center bg-surface">
          <div className="font-bold text-xl uppercase tracking-wider">{shopName}</div>
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
