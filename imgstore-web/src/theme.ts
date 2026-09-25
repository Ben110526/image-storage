import { createTheme } from '@mui/material/styles';

/* Hallmark · theme: Terminal — dark phosphor, green accent, hairline rules */

export const getAppTheme = (mode: 'light' | 'dark') =>
  createTheme({
    palette: {
      mode,
      ...(mode === 'dark'
        ? {
            primary: {
              main: '#34d399',
              light: '#6ee7b7',
              dark: '#10b981',
              contrastText: '#04120c',
            },
            secondary: {
              main: '#a3e635',
              light: '#bef264',
              dark: '#65a30d',
              contrastText: '#0a0f05',
            },
            background: {
              default: '#0a120d',
              paper: '#101a14',
            },
            text: {
              primary: '#e6f4ec',
              secondary: '#8fbc9f',
            },
            divider: 'rgba(148, 210, 189, 0.14)',
          }
        : {
            primary: {
              main: '#15803d',
              light: '#16a34a',
              dark: '#166534',
              contrastText: '#ffffff',
            },
            secondary: {
              main: '#4d7c0f',
              light: '#65a30d',
              dark: '#3f6212',
              contrastText: '#ffffff',
            },
            background: {
              default: '#f6faf7',
              paper: '#ffffff',
            },
            text: {
              primary: '#12211a',
              secondary: '#3f5a4c',
            },
            divider: 'rgba(22, 101, 52, 0.16)',
          }),
    },
    typography: {
      fontFamily: [
        '"JetBrains Mono"',
        'ui-monospace',
        'SFMono-Regular',
        'Menlo',
        'monospace',
      ].join(','),
      // Pure terminal type scale — single family, hierarchy via weight/size/tracking
      h1: {
        fontWeight: 700,
        letterSpacing: '-0.02em',
        lineHeight: 1.15,
        fontSize: '1.75rem',
      },
      h2: {
        fontWeight: 700,
        letterSpacing: '-0.015em',
        lineHeight: 1.2,
        fontSize: '1.375rem',
      },
      h3: {
        fontWeight: 600,
        letterSpacing: '-0.01em',
        lineHeight: 1.25,
        fontSize: '1.125rem',
      },
      h4: {
        fontWeight: 600,
        letterSpacing: '-0.01em',
        lineHeight: 1.3,
        fontSize: '1rem',
      },
      h5: {
        fontWeight: 600,
        letterSpacing: '-0.01em',
        lineHeight: 1.3,
        fontSize: '0.9375rem',
      },
      h6: {
        fontWeight: 600,
        letterSpacing: '-0.005em',
        lineHeight: 1.35,
        fontSize: '0.875rem',
      },
      body1: {
        fontSize: '0.875rem',
        lineHeight: 1.5,
      },
      body2: {
        fontSize: '0.8125rem',
        lineHeight: 1.45,
      },
      caption: {
        fontSize: '0.75rem',
        lineHeight: 1.3,
      },
      overline: {
        fontSize: '0.75rem',
        fontWeight: 500,
        letterSpacing: '0.08em',
        lineHeight: 1.3,
      },
      button: {
        textTransform: 'none',
        fontWeight: 600,
      },
    },
    shape: {
      borderRadius: 6,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            boxShadow: 'none',
            '&:hover': {
              boxShadow: 'none',
            },
          },
          contained: {
            // Terminal: flat accent fill, no gradient, no glow
            background: mode === 'dark' ? '#34d399' : '#15803d',
            boxShadow: 'none',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            backgroundImage: 'none',
            border: `1px solid ${mode === 'dark' ? 'rgba(148, 210, 189, 0.14)' : 'rgba(22, 101, 52, 0.16)'}`,
            boxShadow: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
          rounded: {
            borderRadius: 6,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            fontWeight: 500,
            fontFamily: 'JetBrains Mono, monospace',
          },
        },
      },
    },
  });
