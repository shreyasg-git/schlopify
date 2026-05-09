import React from 'react';
import { motion } from 'framer-motion';
import { Button } from './Button';
import { Product } from '../../../registry/components/ProductCard';

export const ProductCard = React.forwardRef<HTMLDivElement, { product: Product }>((props, ref) => {
  const { product, ...rest } = props;
  
  return (
    <motion.div
      ref={ref}
      whileHover={{ y: -4 }}
      className="flex flex-col bg-surface rounded-surface overflow-hidden shadow-brutal border border-black/5"
      {...rest}
    >
      <div className="aspect-square bg-black/5 p-4 flex items-center justify-center">
        {product.image ? (
          <img src={product.image} alt={product.name} className="object-cover w-full h-full rounded-sm" />
        ) : (
          <div className="text-4xl text-black/20 font-light tracking-tighter">no image</div>
        )}
      </div>
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="font-semibold text-surface-foreground mb-1">{product.name}</h3>
        {product.description && <p className="text-sm text-surface-foreground/70 line-clamp-2 mb-4">{product.description}</p>}
        <div className="mt-auto flex items-center justify-between pt-4">
          <span className="font-medium text-lg">${product.price || '0.00'}</span>
          <Button size="sm">Add to Cart</Button>
        </div>
      </div>
    </motion.div>
  );
});

ProductCard.displayName = "ProductCard";
