import type { UserProfile } from '../types';
import {
  fetchCurrentUser,
  getSessionToken,
  setSessionToken,
  setStoredUserProfile,
} from '../api/client';

/* R1 — connection re-verification state machine, extracted from AuthContext
 * so it is testable without a React renderer. A connection save must NEVER
 * carry the previous authenticated identity across to the new endpoint:
 *
 *   save → invalidate old identity (clear user + stored profile)
 *        → verifying (caller shows isLoading)
 *        → authenticated(new profile)   [returns 'authenticated']
 *        |  anonymous (no credential)   [returns 'anonymous']
 *        |  needs-auth (401/403: credential rejected — stored credential
 *        |     cleared so stale queue items cannot keep sending it)
 *        |                              [returns 'needs-auth']
 *        |  error (network/other: credential KEPT for the next attempt,
 *        |     but NOT authenticated)    [returns 'error']
 *
 * The function never throws — verification failure is a state, not a
 * rejection. The caller (AuthContext.refreshConnection) mirrors these
 * transitions into React state and bumps the connection generation. */

export type RefreshOutcome =
  | 'authenticated' // new endpoint accepted the credential; profile returned
  | 'anonymous'     // no credential stored on the new connection
  | 'needs-auth'    // credential rejected (401/403) and has been cleared
  | 'error';        // network/other failure; credential kept, NOT authenticated

export interface RefreshResult {
  outcome: RefreshOutcome;
  /** Present only when outcome === 'authenticated'. */
  profile?: UserProfile;
}

export async function reverifyConnection(): Promise<RefreshResult> {
  const token = getSessionToken();

  // Invalidate the old identity FIRST — regardless of what happens next the
  // previous profile is no longer valid for the new connection.
  setStoredUserProfile(null);

  if (!token) {
    setSessionToken(null);
    return { outcome: 'anonymous' };
  }

  try {
    const profile = await fetchCurrentUser();
    setStoredUserProfile(profile);
    return { outcome: 'authenticated', profile };
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === 401 || status === 403) {
      // Credential rejected by the new endpoint — drop it everywhere so the
      // app lands in needs-auth and stale queue items cannot keep sending it.
      setSessionToken(null);
      setStoredUserProfile(null);
      return { outcome: 'needs-auth' };
    }
    // Network/other errors keep the stored credential for the next attempt
    // but the session is NOT authenticated until verification succeeds.
    return { outcome: 'error' };
  }
}
