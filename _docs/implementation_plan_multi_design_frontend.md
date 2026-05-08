# Multi-Design-System Architecture for Ecommerce

This architecture is designed to support 5+ completely different visual styles (flavors) for an ecommerce application, sharing the exact same business logic, API calls, and routing. It borrows heavily from the component registry patterns of white-label platforms and Shopify's theme architecture.

## Technical Decisions

> [!NOTE]
> **Code Splitting over Runtime Bundling:** Based on feedback, themes will NOT be bundled together. We will use `React.lazy` and dynamic imports (e.g. `import(\`@/themes/${activeTheme}/registry\`)`) to ensure Vite creates separate chunks for each theme. The client will only download the CSS and JS for the active theme.
> **Routing:** We will use `react-router-dom` for client-side routing, maintaining a pure React SPA architecture.

---

## Proposed Architecture

### 1. High-Level Folder Structure

The core concept is strict separation of **Logic (Core/Features)** from **Presentation (Themes)**.

```
frontend/src/
├── core/                  # Pure logic, UI agnostic
│   ├── api/               # API clients, GraphQL/REST endpoints
│   ├── hooks/             # Shared hooks (e.g., useCart, useAuth)
│   ├── store/             # Global state management (Zustand/Redux)
│   └── utils/             # Formatters, constants
├── features/              # Feature modules (UI agnostic orchestration)
│   ├── checkout/          # Checkout logic
│   └── product/           # Product fetching, filtering logic
├── registry/              # The heart of the architecture
│   ├── ThemeProvider.tsx  # Context provider for the active theme
│   └── components/        # Semantic component facades (<Button>, <ProductCard>)
├── themes/                # The Visual Layers
│   ├── shared/            # Shared base components (Radix primitives)
│   ├── minimal/           # Theme 1: Minimal Modern
│   │   ├── tokens.css     # CSS variables
│   │   ├── components/    # Implementation of UI
│   │   └── layouts/       # Theme-specific layout wrappers
│   ├── brutalist/         # Theme 2: Brutalist
│   └── luxury/            # Theme 3: Luxury Premium
└── pages/                 # Routing level. Composes features with Registry UI.
```

### 2. Design System Architecture (Registry Pattern)

Instead of giant `if/else` checks, we use an **Inversion of Control** component registry with dynamic imports. 

Pages import a semantic component:
```tsx
import { Button } from "@/registry/components/Button";
import { ProductCard } from "@/registry/components/ProductCard";
```

The semantic `Button` doesn't contain styles. It looks up the active theme from Context and renders the specific implementation:
```tsx
// src/registry/components/Button.tsx
export const Button = (props) => {
  const { components } = useTheme();
  
  if (!components) return null; // or skeleton
  
  const ThemeButton = components.Button;
  return <ThemeButton {...props} />;
};
```

### 3. Theme/Token Architecture (CSS Variables + Tailwind)

To prevent duplication and keep CSS sizes small, we use a token-driven approach. `tailwind.config.js` is configured to use CSS variables for *everything* semantic.

*No hardcoded colors* (`text-red-500`). We use `text-primary`.
*No hardcoded radii* (`rounded-md`). We use `rounded-surface`.

**`themes/brutalist/tokens.css`**:
```css
:root[data-theme="brutalist"] {
  --color-primary: 0 0% 10%;
  --color-surface: 0 0% 100%;
  --radius-surface: 0px;
  --shadow-brutal: 4px 4px 0px 0px rgba(0,0,0,1);
}
```

**`themes/minimal/tokens.css`**:
```css
:root[data-theme="minimal"] {
  --color-primary: 220 10% 50%;
  --color-surface: 0 0% 100%;
  --radius-surface: 12px;
  --shadow-brutal: 0px 4px 12px rgba(0,0,0,0.05); /* re-mapped to soft shadow */
}
```

### 4. Component Abstraction Strategy (CVA + shadcn)

shadcn/ui provides great accessible primitives via Radix UI. 
- **Structurally Similar Components**: If a Button is just visually different (colors/shadows), we handle it purely via Tailwind + CSS variables + CVA (Class Variance Authority).
- **Structurally Different Components**: If Brutalist has extra DOM nodes for an offset shadow container that Minimal does not, we create separate files: `themes/brutalist/components/Button.tsx` and `themes/minimal/components/Button.tsx`.

### 5. Framer Motion Integration

Animations are tokens too. We map animation intents in the theme registry.

```tsx
// themes/luxury/animations.ts
export const luxuryAnimations = {
  cardHover: { scale: 1.05, transition: { type: 'spring', stiffness: 300 } },
  pageLoad: { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }
};
```
The semantic component injects these animation intents dynamically.

### 6. Example Implementation Patterns

#### A. The Page (Shared logic, zero theming knowledge)
```tsx
// src/pages/ProductList.tsx
import { useProducts } from '@/core/hooks/useProducts';
import { ProductGrid, ProductCard } from '@/registry/components';
import { PageLayout } from '@/registry/layouts';

export function ProductList() {
  const { products, isLoading } = useProducts();

  return (
    <PageLayout>
      <ProductGrid>
        {products.map(p => <ProductCard key={p.id} product={p} />)}
      </ProductGrid>
    </PageLayout>
  );
}
```

#### B. The Registry Provider (Code Split)
```tsx
// src/registry/ThemeProvider.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext({ components: null });

export function ThemeProvider({ themeName, children }) {
  const [components, setComponents] = useState(null);

  useEffect(() => {
    // Dynamic import forces Vite to code-split themes into separate chunks
    import(`../themes/${themeName}/registry.ts`)
      .then((module) => {
        setComponents(module.components);
        document.documentElement.setAttribute('data-theme', themeName);
        
        // Dynamically load the theme's CSS variables
        import(`../themes/${themeName}/tokens.css`);
      })
      .catch(console.error);
  }, [themeName]);

  if (!components) return <div>Loading theme...</div>;

  return <ThemeContext.Provider value={{ components }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
```

#### C. The Headless Hook
```tsx
// src/core/hooks/useCart.ts
import { create } from 'zustand';

export const useCart = create((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  // ... pure logic
}));
```

### 7. AI-Theme Generation Friendly

Because the architecture strictly isolates logic from presentation:
1. An AI can generate a new folder `themes/cyberpunk/`.
2. The AI only needs to write `tokens.css` and the mapping of Radix components to Tailwind classes.
3. The AI does not need to understand how the Cart works, it just needs to style a generic `CartDrawer` interface.
4. We can define a strict TypeScript interface `IThemeRegistry` that the AI must fulfill (guaranteeing it implements Button, Card, Navbar, etc.).

## Verification Plan

1. **Scaffolding**: Setup the root folder structure in `/frontend`.
2. **Provider Setup**: Implement the `ThemeProvider`, CSS variable infrastructure, and Tailwind config.
3. **Core Registry**: Define the `IThemeComponents` interface.
4. **Theme Mockups**: Create two example themes (`minimal` and `brutalist`).
5. **Component Proof of Concept**: Implement `<Button>`, `<ProductCard>`, and `<Navbar>` in both themes.
6. **Integration**: Create a mock Product page that allows toggling the theme at runtime using a dropdown, proving logic remains persistent while UI swaps seamlessly.
