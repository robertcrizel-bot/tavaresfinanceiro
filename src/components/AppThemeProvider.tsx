import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";

export const THEME_STORAGE_KEY = "financecontrol-theme";

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      themes={["dark", "light"]}
      storageKey={THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}