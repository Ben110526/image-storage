import React, { useState, useMemo, useEffect } from 'react';
import {
  ThemeProvider,
  CssBaseline,
  Container,
  Box,
} from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { getAppTheme } from './theme';
import { AuthProvider } from './context/AuthContext';
import { AppearanceProvider, useAppearance } from './context/AppearanceContext';
import { UploadQueueProvider } from './context/UploadQueueContext';
import { Navbar } from './components/Navbar';
import { MobileNavigation } from './components/ui/MobileNavigation';
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
  const { resolvedTheme, setTheme, reduceMotion } = useAppearance();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => haptics.isEnabled());
  const [route] = useHashRoute();
  const {
    apiKeyDialogOpen,
    apiKeyDialogLoading,
    apiKeyDialogError,
    hideApiKeyDialog,
    submitApiKey,
  } = useAuth();

  /* R3 — the theme owns MUI transition durations, and the reduced-motion
   * config lives in the theme: re-create it the moment the effective flag
   * (app toggle OR OS) flips, so already-mounted Drawers/Dialogs switch to
   * instant without a reload. */
  const theme = useMemo(() => getAppTheme(resolvedTheme), [resolvedTheme, reduceMotion]);

  const toggleColorMode = () => {
    setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
  };

  const toggleSound = () => {
    const next = haptics.toggle();
    setSoundEnabled(next);
  };

  // `navigate` is used by the global 1/2/3 hotkeys; links handle the rest.
  const navigate = (r: Route) => {
    window.location.hash = `/${r}`;
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
  }, [navigate, resolvedTheme]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider
        maxSnack={4}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        autoHideDuration={3000}
      >
        {/* Upload queue controller lives above the routes so an in-flight
            upload, its File handle and its server slot survive navigation
            (LG-06). Pages only render this state. */}
        <UploadQueueProvider>
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
            route={route}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            soundEnabled={soundEnabled}
            onToggleSound={toggleSound}
          />

          {/* Main Application Container — one page at a time. Bottom padding
              clears the mobile destination bar (62px + safe-area + margin). */}
          <Container
            maxWidth="xl"
            component="main"
            sx={{
              py: { xs: 2, sm: 3, md: 4.5 },
              px: { xs: 1.5, sm: 2.5, md: 4 },
              pb: { xs: 'calc(62px + env(safe-area-inset-bottom) + 32px)', md: 4.5 },
              flexGrow: 1,
            }}
          >
            {route === 'upload' && <UploadPage />}
            {route === 'library' && <LibraryPage />}
            {route === 'docs' && <DocsPage />}
          </Container>

          {/* Mobile destination bar */}
          <MobileNavigation route={route} />

          {/* No footer — the page just ends in the ambient background. The
              privacy notice lives in Settings; the hash routes are all in the
              navbar already. */}

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
        </UploadQueueProvider>
      </SnackbarProvider>
    </ThemeProvider>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AppearanceProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </AppearanceProvider>
    </QueryClientProvider>
  );
};

export default App;
