import React from 'react';
import { useTheme } from '../ThemeProvider';

export const ProductGrid = React.forwardRef<HTMLDivElement, { children: React.ReactNode }>((props, ref) => {
  const { components } = useTheme();
  if (!components || !components.ProductGrid) return null;
  const ThemeGrid = components.ProductGrid;
  return <ThemeGrid ref={ref} {...props} />;
});

ProductGrid.displayName = "ProductGrid";
