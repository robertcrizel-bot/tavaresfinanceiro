# Architecture rules

- AppThemeProvider wraps the application at its entry point; theme state stays independent of authentication and financial providers.
- Theme colors are defined in global CSS tokens, with light overrides on the root class, so shared controls and charts inherit the selected palette.