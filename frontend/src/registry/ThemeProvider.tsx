import React, { createContext, useContext, useState, useEffect } from 'react';

// Define the shape of our component registry
interface ComponentRegistry {
  Button: React.ComponentType<any>;
  // We'll add more components like ProductCard, Navbar, etc.
}

interface ThemeContextType {
  components: ComponentRegistry | null;
}

const ThemeContext = createContext<ThemeContextType>({ components: null });

export function ThemeProvider({ themeName, children }: { themeName: string, children: React.ReactNode }) {
  const [components, setComponents] = useState<ComponentRegistry | null>(null);

  useEffect(() => {
    // Dynamic import forces Vite to code-split themes into separate chunks
    import(`../themes/${themeName}/registry.tsx`)
      .then((module) => {
        setComponents(module.components);
        document.documentElement.setAttribute('data-theme', themeName);
        
        // Dynamically load the theme's CSS variables
        import(`../themes/${themeName}/tokens.css`);
      })
      .catch((error) => {
        console.error(`Failed to load theme "${themeName}":`, error);
      });
  }, [themeName]);

  if (!components) {
    return <div className="min-h-screen w-full flex items-center justify-center text-foreground bg-background">Loading flavor...</div>;
  }

  return <ThemeContext.Provider value={{ components }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
