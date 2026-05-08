import React from 'react';

export const ProductGrid = React.forwardRef<HTMLDivElement, { children: React.ReactNode }>((props, ref) => {
  return (
    <div ref={ref} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 gap-y-12" {...props} />
  );
});

ProductGrid.displayName = "ProductGrid";
