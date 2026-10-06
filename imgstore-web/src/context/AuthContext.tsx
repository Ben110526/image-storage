import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UserProfile } from '../types';
import {
  fetchCurrentUser,
  getSessionToken,
  setSessionToken,
  setStoredUserProfile,
  resetApiConfig,
  getApiBaseUrl,
  saveApiConfig,
} from '../api/client';

/** Connection scope (FIX-03): endpoint + identity + generation. Increments on
 * every login/logout/endpoint change so the upload queue can tell "same
 * connection" from "new owner" without ever comparing raw credentials. */
export interface ConnectionScope {
  endpoint: string;
  /** user.id for session auth, 'apikey' for direct-key access, 'anonymous'. */
  identity: string;
  /** Monotonic; any scope change bumps it. */
  generation: number;
}

interface AuthContextType {
  user: UserProfile | null;
  sessionToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Current connection scope — snapshot this into queue items at enqueue. */
  scope: ConnectionScope;
  /** Re-read endpoint/key from storage after Settings saved them, bump the
   * generation and clear cached data of the old scope. */
  refreshConnection: () => void;
  // API Key Dialog state
  apiKeyDialogOpen: boolean;
  apiKeyDialogLoading: boolean;
  apiKeyDialogError: string | null;
  showApiKeyDialog: () => void;
  hideApiKeyDialog: () => void;
  submitApiKey: (key: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessionToken, setToken] = useState<string | null>(() => getSessionToken());
  const [isLoading, setLoading] = useState(true);
  /* Generation lives in state (not a ref) so consumers re-render on scope
   * change; identity/endpoint are derived per render from the same inputs. */
  const [generation, setGeneration] = useState(0);

  // API Key Dialog state
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKeyDialogLoading, setApiKeyDialogLoading] = useState(false);
  const [apiKeyDialogError, setApiKeyDialogError] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    let active = true;
    if (!getSessionToken()) {
      setLoading(false);
      return;
    }
    fetchCurrentUser()
      .then((profile) => {
        if (active) setUser(profile);
      })
      .catch(() => {
        if (active) {
          setSessionToken(null);
          setStoredUserProfile(null);
          setToken(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const showApiKeyDialog = useCallback(() => {
    setApiKeyDialogError(null);
    setApiKeyDialogLoading(false);
    setApiKeyDialogOpen(true);
  }, []);

  const hideApiKeyDialog = useCallback(() => {
    if (!apiKeyDialogLoading) {
      setApiKeyDialogOpen(false);
      setApiKeyDialogError(null);
    }
  }, [apiKeyDialogLoading]);

  const submitApiKey = useCallback(
    async (key: string) => {
      const previous = getSessionToken();
      setApiKeyDialogLoading(true);
      setApiKeyDialogError(null);
      setSessionToken(key);

      try {
        const profile = await fetchCurrentUser();
        const base = getApiBaseUrl();
        saveApiConfig(base, '');
        queryClient.clear();
        setUser(profile);
        setToken(key);
        setStoredUserProfile(profile);
        setGeneration((g) => g + 1);
        // Close dialog on success
        setApiKeyDialogOpen(false);
      } catch (err) {
        // Restore previous token on failure
        setSessionToken(previous);
        const message =
          err instanceof Error
            ? err.message
            : 'Invalid API key. Please check and try again.';
        setApiKeyDialogError(message);
      } finally {
        setApiKeyDialogLoading(false);
      }
    },
    [queryClient]
  );

  const logout = useCallback(async () => {
    const base = getApiBaseUrl();
    setSessionToken(null);
    setStoredUserProfile(null);
    resetApiConfig();
    saveApiConfig(base, '');
    queryClient.clear();
    setUser(null);
    setToken(null);
    setGeneration((g) => g + 1);
  }, [queryClient]);

  /* Settings saved a new endpoint/key: adopt it as a new scope, drop every
   * cache entry of the old scope and let the queue's generation guard stop
   * dispatching items enqueued under the old owner. */
  const refreshConnection = useCallback(() => {
    setToken(getSessionToken());
    queryClient.clear();
    setGeneration((g) => g + 1);
  }, [queryClient]);

  const isAuthenticated = Boolean(user && sessionToken);
  const scope: ConnectionScope = {
    endpoint: getApiBaseUrl(),
    identity: isAuthenticated && user ? user.id : sessionToken ? 'session' : 'anonymous',
    generation,
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        sessionToken,
        isAuthenticated,
        isLoading,
        scope,
        refreshConnection,
        apiKeyDialogOpen,
        apiKeyDialogLoading,
        apiKeyDialogError,
        showApiKeyDialog,
        hideApiKeyDialog,
        submitApiKey,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
