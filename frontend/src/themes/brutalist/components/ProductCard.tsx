import React from 'react';
import { motion } from 'framer-motion';
import { Button } from './Button';
import { Product } from '../../../registry/components/ProductCard';

export const ProductCard = React.forwardRef<HTMLDivElement, { product: Product }>((props, ref) => {
  const { product, ...rest } = props;
  
  return (
    <motion.div
      ref={ref}
      className="flex flex-col bg-surface border-4 border-black shadow-brutal p-4"
      {...rest}
    >
      <div className="aspect-square bg-white border-2 border-black mb-4 flex items-center justify-center p-2 relative overflow-hidden">
        {/* Brutalist stripe pattern overlay */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 2px, transparent 2px, transparent 10px)' }}></div>
        {product.image ? (
          <img src={product.image} alt={product.name} className="object-cover w-full h-full relative z-10 filter grayscale contrast-125" />
        ) : (
          <div className="text-2xl font-black uppercase tracking-widest relative z-10 text-center">No Image<br/>Found</div>
        )}
      </div>
      <div className="flex flex-col flex-grow">
        <h3 className="font-black text-xl uppercase tracking-wider mb-2 line-clamp-1 border-b-2 border-black pb-2">{product.name}</h3>
        {product.description && <p className="text-sm font-medium mb-4 line-clamp-2">{product.description}</p>}
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="font-black text-2xl">${product.price || '0.00'}</span>
          <Button size="sm" className="h-10 px-4 text-sm shadow-none hover:shadow-brutal hover:-translate-x-1 hover:-translate-y-1">Buy Now</Button>
        </div>
      </div>
    </motion.div>
  );
});

ProductCard.displayName = "ProductCard";
