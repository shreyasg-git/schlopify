import React, { createContext, useContext, useState, useEffect } from 'react';

// Define the shape of our component registry
interface ComponentRegistry {
  Button: React.ComponentType<any>;
  // We'll add more components like ProductCard, Navbar, etc.
}

interface ThemeContextType {
  components: ComponentRegistry | null;
  themeName: string;
}

declare global {
  interface Window {
    __SCHLOPIFY_THEME__?: string;
  }
}

const ThemeContext = createContext<ThemeContextType>({ components: null, themeName: 'minimal' });

/**
 * Resolves the active theme name from (in priority order):
 * 1. Explicit prop
 * 2. Runtime injection via NGINX envsubst (window.__SCHLOPIFY_THEME__)
 * 3. Fallback default
 */
function resolveTheme(propTheme?: string): string {
  if (propTheme) return propTheme;
  if (typeof window !== 'undefined' && window.__SCHLOPIFY_THEME__ && window.__SCHLOPIFY_THEME__ !== '${SHOP_THEME}') {
    return window.__SCHLOPIFY_THEME__;
  }
  return 'minimal';
}

export function ThemeProvider({ themeName, children }: { themeName?: string, children: React.ReactNode }) {
  const resolvedTheme = resolveTheme(themeName);
  const [components, setComponents] = useState<ComponentRegistry | null>(null);

  useEffect(() => {
    // Dynamic import forces Vite to code-split themes into separate chunks
    import(`../themes/${resolvedTheme}/registry.tsx`)
      .then((module) => {
        setComponents(module.components);
        document.documentElement.setAttribute('data-theme', resolvedTheme);
        
        // Dynamically load the theme's CSS variables
        import(`../themes/${resolvedTheme}/tokens.css`);
      })
      .catch((error) => {
        console.error(`Failed to load theme "${resolvedTheme}":`, error);
      });
  }, [resolvedTheme]);

  if (!components) {
    return <div className="min-h-screen w-full flex items-center justify-center text-foreground bg-background">Loading flavor...</div>;
  }

  return <ThemeContext.Provider value={{ components, themeName: resolvedTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
