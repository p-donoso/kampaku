"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import CssBaseline from "@mui/material/CssBaseline";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useMemo } from "react";
import { useTheme } from "@/hooks/use-theme";

const DARK = {
  primary: "#c93c35",
  paper: "#121010",
  default: "#0a0908",
  elevated: "#1c1816",
  textPrimary: "#f5f0eb",
  textSecondary: "#c4b8ae",
  divider: "#2a2320",
} as const;

const LIGHT = {
  primary: "#a82f28",
  paper: "#ffffff",
  default: "#faf6f0",
  elevated: "#f3ece3",
  textPrimary: "#1a1210",
  textSecondary: "#5c4f48",
  divider: "#e5dcd4",
} as const;

function buildMuiTheme(mode: "dark" | "light") {
  const t = mode === "dark" ? DARK : LIGHT;
  return createTheme({
    palette: {
      mode,
      primary: { main: t.primary, contrastText: mode === "dark" ? "#f5f0eb" : "#faf6f0" },
      background: { default: t.default, paper: t.paper },
      text: { primary: t.textPrimary, secondary: t.textSecondary },
      divider: t.divider,
      success: { main: mode === "dark" ? "#6d9a72" : "#4a7a50" },
      warning: { main: mode === "dark" ? "#e07840" : "#c45a20" },
      error: { main: mode === "dark" ? "#d64545" : "#b54d4d" },
      info: { main: mode === "dark" ? "#8a9eb8" : "#4a6d85" },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      button: { textTransform: "none", fontWeight: 500 },
    },
    components: {
      MuiButtonBase: { defaultProps: { disableRipple: true } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: "var(--bg-base)",
            color: "var(--text-primary)",
          },
        },
      },
    },
  });
}

export function MaterialProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const muiTheme = useMemo(() => buildMuiTheme(theme), [theme]);

  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
