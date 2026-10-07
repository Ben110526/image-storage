import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  CloudQueue as CloudIcon,
  Logout as LogoutIcon,
  FolderSpecial as FolderIcon,
  VerifiedUser as VerifiedIcon,
  MoreHoriz as MoreIcon,
  LightMode as LightIcon,
  DarkMode as DarkIcon,
  SettingsBrightness as SystemIcon,
  VolumeUp as SoundOnIcon,
  VolumeOff as SoundOffIcon,
  Keyboard as KeyboardIcon,
  Settings as SettingsIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { useHealth } from '../hooks/useImages';
import { useAuth } from '../context/AuthContext';
import { useAppearance, type ThemePreference } from '../context/AppearanceContext';
import { getAppScene } from '../design/optics/GlassScene';
import { useGlassPane } from '../design/optics/useGlassPane';
import { haptics } from '../lib/haptics';
import type { Route } from '../lib/router';

/* Navbar — plan §5.1: floating sticky glass pill, 64px desktop. Logo left,
 * three destinations center, account + "Tùy chọn" overflow right. Theme,
 * sound and shortcuts live inside the overflow menu; account/connect always
 * has a visible entry point. Health is a small dot + label, never confused
 * with auth state. Mobile keeps header lean — destinations live in the
 * bottom MobileNavigation bar. */

interface NavbarProps {
  route: Route;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

const NAV_ITEMS: { route: Route; label: string; hint: string }[] = [
  { route: 'upload', label: 'Upload', hint: 'Tải file lên [1]' },
  { route: 'library', label: 'Library', hint: 'Thư viện media [2]' },
  { route: 'docs', label: 'API Docs', hint: 'Tài liệu REST API [3]' },
];

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Sáng', icon: <LightIcon fontSize="small" /> },
  { value: 'dark', label: 'Tối', icon: <DarkIcon fontSize="small" /> },
  { value: 'system', label: 'Hệ thống', icon: <SystemIcon fontSize="small" /> },
];

export const Navbar: React.FC<NavbarProps> = ({
  route,
  onOpenSettings,
  onOpenShortcuts,
  soundEnabled,
  onToggleSound,
}) => {
  const { data: health, isError, isLoading: healthLoading } = useHealth();
  const { user, isAuthenticated, isLoading: authLoading, showApiKeyDialog, logout } = useAuth();
  const { pref, setTheme } = useAppearance();

  /* V2-03 — the navbar is the first real optical pane: real refraction of the
   * app-owned GlassScene backdrop (canvas displacement, no CSS blur). Falls
   * back to the CSS material under reduced transparency. */
  const navbarRef = useGlassPane<HTMLElement>('navbar', 'pill', getAppScene());

  /* V2-06 — the account + overflow menus are MUI portal surfaces: they mount
   * with a grow/fade transition whose transform never fires scroll/resize, so
   * trackMotion re-renders the displaced scene until the paper settles (plan
   * §8.6: menus get a medium optical pane at their true portal position). */
  const userMenuRef = useGlassPane<HTMLDivElement>('navbar-menu-user', 'panel', getAppScene(), {
    trackMotion: true,
  });
  const utilMenuRef = useGlassPane<HTMLDivElement>('navbar-menu-util', 'panel', getAppScene(), {
    trackMotion: true,
  });

  const [userAnchor, setUserAnchor] = useState<null | HTMLElement>(null);
  const [utilAnchor, setUtilAnchor] = useState<null | HTMLElement>(null);

  const handleLogout = async () => {
    haptics.playDelete();
    setUserAnchor(null);
    await logout();
  };

  return (
    <Box
      ref={navbarRef}
      component="header"
      className="navbar-glass glass-regular"
      sx={{
        position: 'sticky',
        top: 12,
        isolation: 'isolate',
        mx: { xs: 1.5, sm: 3, md: 4 },
        mt: 1.5,
        height: { xs: 52, md: 64 },
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        px: { xs: 1.5, sm: 2.5 },
        zIndex: (theme) => theme.zIndex.appBar,
      }}
    >
      {/* Brand */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
        <Box
          aria-hidden
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            borderRadius: '10px',
            border: '1px solid',
            borderColor: 'primary.main',
            color: 'primary.main',
            flexShrink: 0,
          }}
        >
          <CloudIcon sx={{ fontSize: 20 }} />
        </Box>
        <Typography
          component="span"
          sx={{
            fontWeight: 700,
            fontSize: '1.125rem',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap',
          }}
        >
          ImgStore
        </Typography>
      </Box>

      {/* Destinations (desktop) */}
      <Box
        component="nav"
        aria-label="Trang"
        sx={{
          display: { xs: 'none', md: 'flex' },
          alignItems: 'center',
          gap: 0.5,
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = route === item.route;
          return (
            <Tooltip key={item.route} title={item.hint}>
              <Box
                component="a"
                href={`#/${item.route}`}
                aria-current={active ? 'page' : undefined}
                className="pressable"
                onClick={() => haptics.playTick()}
                sx={{
                  textDecoration: 'none',
                  borderRadius: 'var(--radius-full)',
                  px: 2,
                  py: 0.9,
                  fontSize: '0.9375rem',
                  fontWeight: active ? 600 : 500,
                  whiteSpace: 'nowrap',
                  color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
                  transition:
                    'background-color var(--duration-normal) var(--ease-standard), color var(--duration-fast) var(--ease-standard)',
                  '@media (hover: hover) and (pointer: fine)': {
                    '&:hover': {
                      color: 'var(--color-text-primary)',
                      backgroundColor: active
                        ? 'var(--color-accent-soft)'
                        : 'var(--color-content-secondary)',
                    },
                  },
                }}
              >
                {item.label}
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {/* Right: health dot, account/connect, overflow */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* Health — dot + small label; never conflated with auth. */}
        <Tooltip
          title={
            healthLoading
              ? 'Đang kiểm tra kết nối…'
              : isError
                ? 'Không kết nối được máy chủ'
                : health
                  ? 'Dịch vụ hoạt động bình thường'
                  : ''
          }
        >
          <Box
            role="status"
            aria-label={
              healthLoading ? 'Đang kiểm tra kết nối' : isError ? 'Máy chủ offline' : 'Máy chủ online'
            }
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1,
              py: 0.5,
              borderRadius: 'var(--radius-full)',
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: healthLoading
                  ? 'var(--color-text-tertiary)'
                  : isError
                    ? 'var(--color-destructive)'
                    : 'var(--color-success)',
              }}
            />
            <Typography
              variant="caption"
              sx={{
                color: 'var(--color-text-secondary)',
                display: { xs: 'none', lg: 'block' },
                fontWeight: 500,
              }}
            >
              {healthLoading ? '…' : isError ? 'Offline' : 'Online'}
            </Typography>
          </Box>
        </Tooltip>

        {/* Account / Connect */}
        {!isAuthenticated ? (
          <Button
            variant="contained"
            size="small"
            onClick={() => {
              haptics.playClick();
              showApiKeyDialog();
            }}
            disabled={authLoading}
            className="pressable"
            sx={{
              borderRadius: 'var(--radius-full)',
              px: 2,
              whiteSpace: 'nowrap',
            }}
          >
            Kết nối
          </Button>
        ) : (
          <>
            <Tooltip title="Tài khoản">
              <IconButton
                aria-label="Mở menu tài khoản"
                onClick={(e) => {
                  haptics.playClick();
                  setUserAnchor(e.currentTarget);
                }}
                size="small"
                sx={{ p: 0.25 }}
              >
                <Avatar
                  src={user?.picture}
                  alt={user?.name || user?.email || 'Người dùng'}
                  sx={{ width: 32, height: 32, fontSize: '0.8rem', bgcolor: 'var(--color-accent)' }}
                >
                  {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
                </Avatar>
              </IconButton>
            </Tooltip>

            <Menu
              anchorEl={userAnchor}
              open={Boolean(userAnchor)}
              onClose={() => setUserAnchor(null)}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              slotProps={{
                paper: {
                  ref: userMenuRef,
                  className: 'glass-elevated',
                  sx: { mt: 1, minWidth: 240 },
                },
              }}
            >
              <Box sx={{ px: 2, py: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                  {user?.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {user?.email}
                </Typography>
              </Box>
              <Divider />
              <MenuItem disabled>
                <ListItemIcon>
                  <FolderIcon fontSize="small" sx={{ color: 'var(--color-accent)' }} />
                </ListItemIcon>
                <ListItemText
                  primary="Storage Folder"
                  secondary="Shared ImgStore Storage"
                />
              </MenuItem>
              <MenuItem disabled>
                <ListItemIcon>
                  <VerifiedIcon fontSize="small" sx={{ color: 'var(--color-success)' }} />
                </ListItemIcon>
                <ListItemText
                  primary="OAuth Scope"
                  secondary="cloud storage (Scoped Access)"
                />
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" color="error" />
                </ListItemIcon>
                <ListItemText primary="Đăng xuất" />
              </MenuItem>
            </Menu>
          </>
        )}

        {/* Overflow — Tùy chọn */}
        <Tooltip title="Tùy chọn">
          <IconButton
            aria-label="Mở menu tùy chọn"
            onClick={(e) => {
              haptics.playClick();
              setUtilAnchor(e.currentTarget);
            }}
            size="small"
          >
            <MoreIcon />
          </IconButton>
        </Tooltip>

        <Menu
          anchorEl={utilAnchor}
          open={Boolean(utilAnchor)}
          onClose={() => setUtilAnchor(null)}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          slotProps={{
            paper: {
              ref: utilMenuRef,
              className: 'glass-elevated',
              sx: { mt: 1, minWidth: 220 },
            },
          }}
        >
          {THEME_OPTIONS.map((opt) => (
            <MenuItem
              key={opt.value}
              selected={pref.theme === opt.value}
              onClick={() => {
                haptics.playTick();
                setTheme(opt.value);
              }}
            >
              <ListItemIcon>{opt.icon}</ListItemIcon>
              <ListItemText primary={opt.label} />
              {pref.theme === opt.value && (
                <CheckIcon fontSize="small" sx={{ ml: 1, color: 'var(--color-accent)' }} />
              )}
            </MenuItem>
          ))}
          <Divider />
          <MenuItem
            onClick={() => {
              onToggleSound();
              haptics.playClick();
            }}
          >
            <ListItemIcon>
              {soundEnabled ? <SoundOnIcon fontSize="small" /> : <SoundOffIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText primary={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'} />
          </MenuItem>
          <MenuItem
            onClick={() => {
              haptics.playClick();
              setUtilAnchor(null);
              onOpenShortcuts();
            }}
            sx={{ display: { xs: 'none', sm: 'flex' } }}
          >
            <ListItemIcon>
              <KeyboardIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Phím tắt" />
          </MenuItem>
          <MenuItem
            onClick={() => {
              haptics.playClick();
              setUtilAnchor(null);
              onOpenSettings();
            }}
          >
            <ListItemIcon>
              <SettingsIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Cài đặt" />
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  );
};
