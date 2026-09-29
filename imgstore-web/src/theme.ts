import { createTheme } from '@mui/material/styles';

/* Hallmark · theme: Liquid Glass — neutral slate, indigo accent, soft radii */

export const getAppTheme = (mode: 'light' | 'dark') =>
  createTheme({
    palette: {
      mode,
      ...(mode === 'dark'
        ? {
            primary: {
              main: '#818cf8',
              light: '#a5b4fc',
              dark: '#6366f1',
              contrastText: '#1e1b4b',
            },
            secondary: {
              main: '#38bdf8',
              light: '#7dd3fc',
              dark: '#0284c7',
              contrastText: '#082f49',
            },
            background: {
              default: '#0f172a',
              paper: '#1e293b',
            },
            text: {
              primary: '#f1f5f9',
              secondary: '#94a3b8',
            },
            divider: 'rgba(148, 163, 184, 0.16)',
          }
        : {
            primary: {
              main: '#4f46e5',
              light: '#6366f1',
              dark: '#4338ca',
              contrastText: '#ffffff',
            },
            secondary: {
              main: '#0ea5e9',
              light: '#38bdf8',
              dark: '#0284c7',
              contrastText: '#ffffff',
            },
            background: {
              default: '#f6f8fb',
              paper: '#ffffff',
            },
            text: {
              primary: '#1e293b',
              secondary: '#475569',
            },
            divider: 'rgba(15, 23, 42, 0.10)',
          }),
    },
    typography: {
      fontFamily: [
        '"Inter"',
        'system-ui',
        '-apple-system',
        '"Segoe UI"',
        'Roboto',
        'sans-serif',
      ].join(','),
      // Glass-neutral type scale — Inter, hierarchy via weight/size/tracking
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
      borderRadius: 12,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            boxShadow: 'none',
            '&:hover': {
              boxShadow: 'none',
            },
          },
          contained: {
            // Liquid Glass: soft accent fill, no heavy gradient
            boxShadow: 'none',
          },
          outlined: {
            backgroundColor: 'var(--color-paper-glass)',
            backdropFilter: 'blur(calc(var(--glass-blur) * 0.6)) saturate(var(--glass-saturate))',
            WebkitBackdropFilter: 'blur(calc(var(--glass-blur) * 0.6)) saturate(var(--glass-saturate))',
            borderColor: 'var(--color-border-glass)',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: `1px solid ${
              mode === 'dark' ? 'rgba(148, 163, 184, 0.16)' : 'rgba(15, 23, 42, 0.10)'
            }`,
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
            borderRadius: 12,
          },
        },
      },
      MuiAccordion: {
        styleOverrides: {
          root: {
            backgroundColor: 'transparent',
            boxShadow: 'none',
          },
        },
      },
      /* Liquid Glass: outlined inputs are panes, not boxes */
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: 'var(--color-paper-glass)',
            backdropFilter: 'var(--backdrop-blur)',
            WebkitBackdropFilter: 'var(--backdrop-blur)',
            borderRadius: 'var(--radius-sm)',
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: 'var(--color-border)',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: 'var(--color-border-strong)',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: 'var(--color-focus)',
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontWeight: 500,
            fontFamily: 'JetBrains Mono, monospace',
          },
          outlined: {
            backgroundColor: 'var(--color-paper-glass)',
            backdropFilter: 'blur(calc(var(--glass-blur) * 0.6)) saturate(var(--glass-saturate))',
            WebkitBackdropFilter: 'blur(calc(var(--glass-blur) * 0.6)) saturate(var(--glass-saturate))',
            borderColor: 'var(--color-border-glass)',
          },
        },
      },
      MuiTooltip: {
        defaultProps: {
          arrow: true,
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 'var(--radius-sm)',
            backdropFilter: 'var(--backdrop-blur)',
            WebkitBackdropFilter: 'var(--backdrop-blur)',
          },
        },
      },
    },
  });
