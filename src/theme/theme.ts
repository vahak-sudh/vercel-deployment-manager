"use client";

import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "dark",
    primary: {
      main: "#2dd4bf",
      light: "#5eead4",
      dark: "#14b8a6",
      contrastText: "#042f2e",
    },
    secondary: {
      main: "#fbbf24",
    },
    success: {
      main: "#4ade80",
    },
    warning: {
      main: "#f59e0b",
    },
    error: {
      main: "#f87171",
    },
    background: {
      default: "#0c1110",
      paper: "#121a18",
    },
    divider: "rgba(45, 212, 191, 0.12)",
    text: {
      primary: "#ecfdf5",
      secondary: "#94a3a0",
      disabled: "#5b6b66",
    },
  },
  typography: {
    fontFamily: '"IBM Plex Sans", "Roboto", "Helvetica", "Arial", sans-serif',
    h6: { fontWeight: 700, letterSpacing: "-0.02em", fontSize: "1rem" },
    subtitle2: {
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      fontSize: "0.65rem",
    },
    button: {
      textTransform: "none",
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage:
            "radial-gradient(900px 420px at 8% -8%, rgba(45,212,191,0.1), transparent 55%), radial-gradient(700px 360px at 92% 0%, rgba(251,191,36,0.05), transparent 50%)",
          backgroundAttachment: "fixed",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "rgba(18,26,24,0.9)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(45,212,191,0.12)",
          boxShadow: "none",
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: "48px !important",
        },
        dense: {
          minHeight: "40px !important",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid rgba(45,212,191,0.1)",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid rgba(45,212,191,0.1)",
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
        size: "small",
      },
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
        sizeSmall: {
          fontSize: "0.75rem",
          padding: "4px 10px",
        },
      },
    },
    MuiChip: {
      defaultProps: {
        size: "small",
      },
      styleOverrides: {
        root: {
          fontWeight: 600,
          height: 24,
        },
        sizeSmall: {
          height: 22,
          fontSize: "0.7rem",
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: "small",
      },
    },
    MuiFormControl: {
      defaultProps: {
        size: "small",
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          paddingTop: 8,
          paddingBottom: 8,
        },
        head: {
          fontSize: "0.65rem",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "text.disabled",
          backgroundColor: "rgba(255,255,255,0.02)",
          paddingTop: 6,
          paddingBottom: 6,
        },
      },
    },
  },
});
