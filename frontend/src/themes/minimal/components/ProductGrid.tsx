import React from 'react';

export const ProductGrid = React.forwardRef<HTMLDivElement, { children: React.ReactNode }>((props, ref) => {
  return (
    <div ref={ref} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" {...props} />
  );
});

ProductGrid.displayName = "ProductGrid";
