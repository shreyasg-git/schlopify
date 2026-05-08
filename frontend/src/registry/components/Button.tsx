import React from 'react';
import { useTheme } from '../ThemeProvider';

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>((props, ref) => {
  const { components } = useTheme();
  
  if (!components || !components.Button) return null;
  
  const ThemeButton = components.Button;
  return <ThemeButton ref={ref} {...props} />;
});

Button.displayName = "Button";
