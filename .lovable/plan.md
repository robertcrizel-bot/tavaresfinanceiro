

## Plan: Improve KPI Cards with Contextual Colors

The current KPI cards all look identical -- same neutral colors, no visual distinction. The goal is to give each card a color that matches its meaning:

- **Total de Entradas** (Income): Green accent (success/income color)
- **Total de Saídas** (Expenses): Red accent (destructive/expense color)
- **Gasto Médio Diário** (Daily Average): Amber/warning accent
- **Maior Categoria** (Top Category): Blue accent

### Changes

**1. Update `KpiCard` component** (`src/components/KpiCard.tsx`)
- Add an optional `color` prop (`"green" | "red" | "amber" | "blue"`)
- Apply the color as a tinted left border or icon color and a subtle background tint
- Map each color to specific Tailwind classes (e.g., `border-l-4 border-l-income`, icon `text-income`, subtle `bg-income/5`)

**2. Update `Dashboard.tsx`** (lines 105-110)
- Pass the `color` prop to each `KpiCard`:
  - Entradas → green
  - Saídas → red
  - Gasto Médio → amber/warning
  - Maior Categoria → blue

**3. Add utility colors in `tailwind.config.ts`** if needed
- Ensure `warning` and `info` (blue) colors are available — warning already exists, may add a `info` color for the blue card.

This is a small, focused change across 2-3 files that makes the dashboard immediately more readable and visually meaningful.

