import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, HTMLMotionProps } from 'framer-motion';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Brutalist theme button implementation
// Brutalist features: hard borders, hard shadow, no border radius, distinct active state
export const Button = React.forwardRef<HTMLButtonElement, HTMLMotionProps<"button">>((props, ref) => {
  const { className, ...rest } = props;
  
  return (
    <motion.button
      ref={ref}
      // Instead of scale, brutalist might just offset the translation to remove the shadow
      whileTap={{ x: 4, y: 4, boxShadow: "0px 0px 0px 0px rgba(0,0,0,1)" }}
      className={cn(
        "inline-flex items-center justify-center border-2 border-black bg-primary text-primary-foreground h-12 px-6 font-bold uppercase tracking-wider transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black disabled:pointer-events-none disabled:opacity-50",
        "shadow-brutal",
        className
      )}
      {...rest}
    />
  );
});

Button.displayName = "Button";
