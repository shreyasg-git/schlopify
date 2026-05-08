import React from 'react';
import { Outlet } from 'react-router-dom';
import { ThemeProvider } from '../registry/ThemeProvider';

export function Layout() {
  // In a real app, the theme would be determined by the tenant/domain, e.g., using window.location.hostname
  // For demo purposes, we will use a state to toggle between themes
  const [activeTheme, setActiveTheme] = React.useState('minimal');

  return (
    <ThemeProvider themeName={activeTheme}>
      <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
        <div className="absolute top-4 right-4 z-50 bg-white/10 backdrop-blur-md p-2 rounded-lg border border-black/10 flex items-center gap-2">
          <span className="text-sm font-medium mr-2">Flavor:</span>
          <select 
            className="bg-transparent border border-black/20 rounded px-2 py-1 text-sm outline-none"
            value={activeTheme} 
            onChange={(e) => setActiveTheme(e.target.value)}
          >
            <option value="minimal">Minimal Modern</option>
            <option value="brutalist">Brutalist</option>
          </select>
        </div>
        <Outlet />
      </div>
    </ThemeProvider>
  );
}
