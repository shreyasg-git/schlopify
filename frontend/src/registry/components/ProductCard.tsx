import React from 'react';
import { useTheme } from '../ThemeProvider';

export interface Product {
  id: string | number;
  name: string;
  price?: number;
  image?: string;
  description?: string;
}

export const ProductCard = React.forwardRef<HTMLDivElement, { product: Product }>((props, ref) => {
  const { components } = useTheme();
  if (!components || !components.ProductCard) return null;
  const ThemeCard = components.ProductCard;
  return <ThemeCard ref={ref} {...props} />;
});

ProductCard.displayName = "ProductCard";
