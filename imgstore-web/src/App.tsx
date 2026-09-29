import React, { useState, useMemo, useEffect } from 'react';
import {
  ThemeProvider,
  CssBaseline,
  Container,
  Box,
  Typography,
} from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { getAppTheme } from './theme';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { UploadPage } from './pages/UploadPage';
import { LibraryPage } from './pages/LibraryPage';
import { DocsPage } from './pages/DocsPage';
import { SettingsModal } from './components/SettingsModal';
import { ApiKeyDialog } from './components/ApiKeyDialog';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { haptics } from './lib/haptics';
import { useHashRoute, type Route } from './lib/router';
import { useAuth } from './context/AuthContext';

/* Hallmark · macrostructure: Workbench (sidebar tree + canvas) · theme: Liquid Glass
 * routes: #/upload · #/library · #/docs · hash router, no dependency
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const ROUTE_ORDER: Route[] = ['upload', 'library', 'docs'];

export const AppContent: React.FC = () => {
  const [colorMode, setColorMode] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('imgstore_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => haptics.isEnabled());
  const [route, navigate] = useHashRoute();
  const {
    apiKeyDialogOpen,
    apiKeyDialogLoading,
    apiKeyDialogError,
    hideApiKeyDialog,
    submitApiKey,
  } = useAuth();

  const theme = useMemo(() => getAppTheme(colorMode), [colorMode]);

  // Sync data-theme attribute on root for OKLCH CSS tokens
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', colorMode);
  }, [colorMode]);

  const toggleColorMode = () => {
    setColorMode((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('imgstore_theme', next);
      return next;
    });
  };

  const toggleSound = () => {
    const next = haptics.toggle();
    setSoundEnabled(next);
  };

  // Global keybindings: 1/2/3 (pages), T (theme), M (sound), ? (shortcuts), Esc (close modals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.key === 't' || e.key === 'T') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          haptics.playTick();
          toggleColorMode();
        }
      } else if (e.key === 'm' || e.key === 'M') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleSound();
        }
      } else if (e.key === '?') {
        e.preventDefault();
        haptics.playClick();
        setShortcutsOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setSettingsOpen(false);
        setShortcutsOpen(false);
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          haptics.playTick();
          navigate(ROUTE_ORDER[Number(e.key) - 1]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider
        maxSnack={4}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        autoHideDuration={3000}
      >
        {/* Atmospheric Ambient Glow Background */}
        <div className="ambient-glow-bg" />

        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Top Navigation */}
          <Navbar
            colorMode={colorMode}
            onToggleColorMode={toggleColorMode}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            soundEnabled={soundEnabled}
            onToggleSound={toggleSound}
            route={route}
            onNavigate={navigate}
          />

          {/* Main Application Container — one page at a time */}
          <Container
            maxWidth="xl"
            sx={{ py: { xs: 2, sm: 3, md: 4.5 }, px: { xs: 1.5, sm: 2.5, md: 4 }, flexGrow: 1 }}
          >
            {route === 'upload' && <UploadPage />}
            {route === 'library' && <LibraryPage />}
            {route === 'docs' && <DocsPage />}
            <Box sx={{ textAlign: 'center', mt: 2 }}><a href="/privacy.html">Privacy &amp; image sharing</a></Box>
          </Container>

          {/* Footer */}
          <Box
            component="footer"
            className="glass-surface"
            sx={{
              py: 3.5,
              textAlign: 'center',
              borderRadius: '0 !important',
              border: 'none !important',
              borderTop: '1px solid var(--color-border-glass) !important',
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}
            >
              ImgStore · Shared Image Storage &amp; Cloudflare CDN
            </Typography>
          </Box>

          {/* Settings Modal */}
          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

          {/* API Key Connection Dialog */}
          <ApiKeyDialog
            open={apiKeyDialogOpen}
            loading={apiKeyDialogLoading}
            error={apiKeyDialogError}
            onSubmit={submitApiKey}
            onClose={hideApiKeyDialog}
          />

          {/* Keyboard Shortcuts Reference Modal */}
          <KeyboardShortcutsModal
            open={shortcutsOpen}
            onClose={() => setShortcutsOpen(false)}
          />
        </Box>
      </SnackbarProvider>
    </ThemeProvider>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
