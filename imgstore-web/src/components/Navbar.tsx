import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Container,
  Typography,
  IconButton,
  Box,
  Chip,
  Tooltip,
  Button,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  useTheme,
} from '@mui/material';
import {
  Brightness4 as DarkIcon,
  Brightness7 as LightIcon,
  Settings as SettingsIcon,
  CloudQueue as CloudIcon,
  CheckCircle as HealthyIcon,
  ErrorOutlined as ErrorIcon,
  VolumeUp as SoundOnIcon,
  VolumeOff as SoundOffIcon,
  Keyboard as KeyboardIcon,
  Logout as LogoutIcon,
  FolderSpecial as FolderIcon,
  VerifiedUser as VerifiedIcon,
} from '@mui/icons-material';
import { useHealth } from '../hooks/useImages';
import { useAuth } from '../context/AuthContext';
import { haptics } from '../lib/haptics';
import type { Route } from '../lib/router';

interface NavbarProps {
  colorMode: 'light' | 'dark';
  onToggleColorMode: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  route: Route;
  onNavigate: (route: Route) => void;
}

const NAV_ITEMS: { route: Route; label: string; hint: string }[] = [
  { route: 'upload', label: 'upload', hint: 'Upload images [1]' },
  { route: 'library', label: 'library', hint: 'Media library & folders [2]' },
  { route: 'docs', label: 'api docs', hint: 'REST API reference [3]' },
];

export const Navbar: React.FC<NavbarProps> = ({
  colorMode,
  onToggleColorMode,
  onOpenSettings,
  onOpenShortcuts,
  soundEnabled,
  onToggleSound,
  route,
  onNavigate,
}) => {
  const theme = useTheme();
  const { data: health, isError, isLoading: healthLoading } = useHealth();
  const { user, isAuthenticated, isLoading: authLoading, showApiKeyDialog, logout } = useAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => {
    haptics.playClick();
    setAnchorEl(event.currentTarget);
  };

  const handleCloseUserMenu = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    haptics.playDelete();
    handleCloseUserMenu();
    await logout();
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backgroundColor: theme.palette.background.default,
        borderBottom: `1px solid ${theme.palette.divider}`,
        color: theme.palette.text.primary,
        zIndex: 1100,
        boxShadow: 'none',
      }}
    >
      <Container maxWidth="xl" disableGutters sx={{ px: { xs: 1.5, sm: 3, md: 4 } }}>
        <Toolbar disableGutters sx={{ justifyContent: 'space-between', minHeight: { xs: 56, sm: 64 } }}>
          {/* Brand identity */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 38,
                height: 38,
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: 'primary.main',
                color: 'primary.main',
                backgroundColor: 'transparent',
              }}
            >
              <CloudIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography
                  variant="h6"
                  sx={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 700,
                    fontSize: '1.25rem',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.1,
                  }}
                >
                  ImgStore
                </Typography>
              </Box>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.72rem',
                  display: { xs: 'none', sm: 'block' },
                }}
              >
                Shared Image Storage
              </Typography>
            </Box>

            {/* Primary page nav — terminal tab strip */}
            <Box
              component="nav"
              aria-label="Pages"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.25,
                ml: { xs: 1, sm: 2.5 },
                pl: { xs: 1, sm: 2.5 },
                borderLeft: '1px solid',
                borderColor: 'divider',
              }}
            >
              {NAV_ITEMS.map(item => {
                const active = route === item.route;
                return (
                  <Tooltip key={item.route} title={item.hint}>
                    <Box
                      component="button"
                      onClick={() => {
                        haptics.playTick();
                        onNavigate(item.route);
                      }}
                      aria-current={active ? 'page' : undefined}
                      sx={{
                        border: 'none',
                        borderRadius: 1,
                        px: { xs: 0.9, sm: 1.4 },
                        py: 0.55,
                        cursor: 'pointer',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.8rem',
                        fontWeight: active ? 700 : 500,
                        whiteSpace: 'nowrap',
                        color: active
                          ? '#10b981'
                          : theme.palette.text.secondary,
                        backgroundColor: active
                          ? colorMode === 'dark'
                            ? 'rgba(16, 185, 129, 0.12)'
                            : 'rgba(5, 150, 105, 0.1)'
                          : 'transparent',
                        boxShadow: active ? 'inset 0 -2px 0 0 #10b981' : 'none',
                        transition: 'background-color 150ms, color 150ms',
                        '&:hover': {
                          color: theme.palette.text.primary,
                          backgroundColor:
                            colorMode === 'dark'
                              ? 'rgba(255, 255, 255, 0.06)'
                              : 'rgba(0, 0, 0, 0.05)',
                        },
                      }}
                    >
                      ./{item.label}
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          </Box>

          {/* Action icons, API Key & Status */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Health Status Beacon */}
            {!healthLoading && !isError && health && (
              <Tooltip title="Service Operational & Ready">
                <Chip
                  icon={
                    <HealthyIcon
                      sx={{
                        fontSize: '14px !important',
                        color: '#10b981 !important',
                      }}
                    />
                  }
                  label="Active"
                  size="small"
                  variant="outlined"
                  sx={{
                    display: { xs: 'none', lg: 'inline-flex' },
                    height: 26,
                    fontSize: '0.75rem',
                    fontFamily: 'JetBrains Mono, monospace',
                    borderColor: 'rgba(16, 185, 129, 0.4)',
                    color: '#10b981',
                  }}
                />
              </Tooltip>
            )}

            {isError && (
              <Tooltip title="Backend Unreachable. Check API Connection Settings.">
                <Chip
                  icon={<ErrorIcon sx={{ fontSize: '14px !important' }} />}
                  label="Offline"
                  size="small"
                  color="error"
                  variant="outlined"
                  sx={{
                    display: { xs: 'none', lg: 'inline-flex' },
                    height: 26,
                    fontSize: '0.75rem',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                />
              </Tooltip>
            )}

            {/* API Key Authentication */}
            {!isAuthenticated ? (
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  haptics.playClick();
                  showApiKeyDialog();
                }}
                disabled={authLoading}
                startIcon={<span aria-hidden="true">⌘</span>}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 2,
                  px: 1.75,
                  py: 0.6,
                  fontSize: '0.82rem',
                  borderColor: colorMode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                  color: 'text.primary',
                  backgroundColor:
                    colorMode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                  '&:hover': {
                    backgroundColor:
                      colorMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                    borderColor: '#34d399',
                  },
                }}
              >
                Connect with API key
              </Button>
            ) : (
              <>
                <Box
                  onClick={handleOpenUserMenu}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    cursor: 'pointer',
                    py: 0.5,
                    px: 1,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    backgroundColor:
                      colorMode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    '&:hover': {
                      borderColor: '#34d399',
                      backgroundColor:
                        colorMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                    },
                  }}
                >
                  <Avatar
                    src={user?.picture}
                    alt={user?.name || user?.email}
                    sx={{ width: 28, height: 28, fontSize: '0.8rem', bgcolor: '#34d399' }}
                  >
                    {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
                  </Avatar>
                  <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'left' }}>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        display: 'block',
                        lineHeight: 1.2,
                        maxWidth: 130,
                      }}
                      noWrap
                    >
                      {user?.name || user?.email?.split('@')[0]}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.68rem',
                        color: 'text.secondary',
                        fontFamily: 'JetBrains Mono, monospace',
                      }}
                    >
                      Storage Connected
                    </Typography>
                  </Box>
                </Box>

                <Menu
                  anchorEl={anchorEl}
                  open={Boolean(anchorEl)}
                  onClose={handleCloseUserMenu}
                  transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                  anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                  slotProps={{
                    paper: {
                      sx: {
                        mt: 1,
                        minWidth: 240,
                        borderRadius: 2,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                        border: '1px solid',
                        borderColor: 'divider',
                        backgroundImage: 'none',
                      },
                    },
                  }}
                >
                  <Box sx={{ px: 2, py: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                      {user?.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'JetBrains Mono, monospace' }} noWrap>
                      {user?.email}
                    </Typography>
                  </Box>
                  <Divider />
                  <MenuItem disabled>
                    <ListItemIcon>
                      <FolderIcon fontSize="small" sx={{ color: '#34d399' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={<Typography sx={{ fontSize: '0.85rem' }}>Storage Folder</Typography>}
                      secondary={
                        <Typography sx={{ fontSize: '0.72rem', fontFamily: 'JetBrains Mono, monospace', color: 'text.secondary' }}>
                          Shared ImgStore Storage
                        </Typography>
                      }
                    />
                  </MenuItem>
                  <MenuItem disabled>
                    <ListItemIcon>
                      <VerifiedIcon fontSize="small" sx={{ color: '#10b981' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={<Typography sx={{ fontSize: '0.85rem' }}>OAuth Scope</Typography>}
                      secondary={
                        <Typography sx={{ fontSize: '0.72rem', fontFamily: 'JetBrains Mono, monospace', color: 'text.secondary' }}>
                          cloud storage (Scoped Access)
                        </Typography>
                      }
                    />
                  </MenuItem>
                  <Divider />
                  <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                    <ListItemIcon>
                      <LogoutIcon fontSize="small" color="error" />
                    </ListItemIcon>
                    <ListItemText
                      primary={<Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>Sign Out</Typography>}
                    />
                  </MenuItem>
                </Menu>
              </>
            )}

            {/* Sound Acoustic Haptics Toggle */}
            <Tooltip title={soundEnabled ? 'Acoustic Sound: On [M]' : 'Acoustic Sound: Muted [M]'}>
              <IconButton
                onClick={() => {
                  onToggleSound();
                  haptics.playClick();
                }}
                color="inherit"
                size="small"
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  p: 0.8,
                }}
              >
                {soundEnabled ? (
                  <SoundOnIcon fontSize="small" sx={{ color: '#10b981' }} />
                ) : (
                  <SoundOffIcon fontSize="small" color="action" />
                )}
              </IconButton>
            </Tooltip>

            {/* Keyboard Shortcuts Dialog */}
            <Tooltip title="Keyboard Shortcuts [?]">
              <IconButton
                onClick={() => {
                  haptics.playClick();
                  onOpenShortcuts();
                }}
                color="inherit"
                size="small"
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  p: 0.8,
                  display: { xs: 'none', sm: 'inline-flex' },
                }}
              >
                <KeyboardIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* Theme toggle button */}
            <Tooltip title={`Switch to ${colorMode === 'dark' ? 'Light' : 'Dark'} Mode [T]`}>
              <IconButton
                onClick={() => {
                  haptics.playTick();
                  onToggleColorMode();
                }}
                color="inherit"
                size="small"
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  p: 0.8,
                }}
              >
                {colorMode === 'dark' ? (
                  <LightIcon fontSize="small" sx={{ color: '#fbbf24' }} />
                ) : (
                  <DarkIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>

            {/* Settings button */}
            <Tooltip title="API Connection Settings">
              <IconButton
                onClick={() => {
                  haptics.playClick();
                  onOpenSettings();
                }}
                color="inherit"
                size="small"
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  p: 0.8,
                }}
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
};
