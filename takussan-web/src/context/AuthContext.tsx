'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  login as apiLogin,
  register as apiRegister,
  isTwoFactorChallenge,
  type LoginPayload,
  type LoginResponse,
  type RegisterPayload,
  type User,
} from '@/lib/auth';
import { apiRequest } from '@/lib/api';
import {
  getIds as getLocalFavoriteIds,
  clear as clearLocalFavorites,
  replace as replaceLocalFavorites,
} from '@/lib/favoritesStore';
import { favoritesQueryKeys, type FavoriteItem } from '@/lib/queries/favorites';
import type { PaginatedResponse } from '@/types/api';

type AuthContextValue = {
  user: User | null;
  /**
   * Auth token (Sanctum). Exposed so client-side helpers like `useApiQuery`
   * can forward it to `Authorization: Bearer ...`. Prefer same-origin Next
   * route handlers for authenticated reads — they already read the HttpOnly
   * cookie server-side — but direct cross-origin calls need this token.
   */
  token: string | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
  /**
   * Authenticate with email+password, persist the auth cookie via
   * `/api/auth/set-token`, and update the in-memory user. Returns the
   * authenticated user on success, or a `{ requires_2fa: true }` challenge
   * when 2FA is enabled — the caller must then re-submit with
   * `two_factor_code` / `recovery_code`.
   */
  login: (payload: LoginPayload) => Promise<LoginResponse & { challenge?: true }>;
  /**
   * Register a new account, persist the auth cookie, and update the
   * in-memory user. Returns the freshly created user.
   */
  register: (payload: RegisterPayload) => Promise<User>;
  /**
   * TCK-509 — ouvre la session CÔTÉ CLIENT à partir d'un jeton que l'API vient d'émettre : pose le
   * cookie httpOnly (`/api/auth/set-token`), vide le cache serveur client, puis expose le jeton et
   * l'utilisateur. Ne navigue pas.
   *
   * ⚠ **Tout chemin qui obtient un jeton passe par ici** — connexion, étape 2FA, inscription,
   * callback OAuth. Le jeton vit à deux endroits : le cookie, et l'état de ce contexte, initialisé
   * UNE fois par le layout racine, que la navigation douce ne remonte pas. Un écran qui poserait le
   * cookie lui-même laisserait le navigateur transmettre le jeton de la session précédente, ou
   * aucun — mesuré au navigateur le 2026-09-10, c'était le cas des trois écrans d'entrée. Gardé
   * par `__tests__/AuthContext.chemin-unique.test.ts`.
   */
  openSession: (token: string, user: User) => Promise<void>;
  /**
   * Revoke the backend token, clear the auth cookies, and drop everything the session left on the
   * client — token, user, React Query cache, local favorites store (TCK-509). Does not navigate —
   * callers decide where to go next (the `useRequireAuth` hook redirects automatically, while
   * Navbar redirects to `/`). **La seule sortie** : le menu de `/app` et la `Navbar` passent par ici.
   */
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialUser,
  initialToken,
}: {
  children: React.ReactNode;
  initialUser?: User | null;
  initialToken?: string | null;
}) {
  const [user, setUser] = useState<User | null>(initialUser ?? null);
  const [token, setToken] = useState<string | null>(initialToken ?? null);
  const [isLoading, setIsLoading] = useState(initialUser === undefined);
  const hasRetriedRef = useRef(false);
  const wasAuthedRef = useRef(false);
  const queryClient = useQueryClient();

  // Sync local (anonymous) favorites into the DB after login. Returns nothing
  // — the seed effect picks up the canonical IDs immediately after.
  const syncLocalFavorites = useCallback(async (authToken: string) => {
    const ids = getLocalFavoriteIds();
    if (ids.length === 0) return;
    await Promise.all(
      ids.map((property_id) =>
        apiRequest('/api/favorites', {
          method: 'POST',
          body: { property_id },
          token: authToken,
        }).catch(() => {
          // Already favorited or transient error — ignore.
        }),
      ),
    );
  }, []);

  // Single source of truth for the favorites store: when the user changes,
  // (a) on auth → fetch /api/favorites and replace the store, (b) on logout
  // → clear the store. The store stays the canonical reactive cache that
  // the navbar popover, every <FavoriteButton>, and the detail page heart
  // all subscribe to.
  useEffect(() => {
    if (!user || !token) {
      if (wasAuthedRef.current) {
        clearLocalFavorites();
        wasAuthedRef.current = false;
      }
      return;
    }
    wasAuthedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest<PaginatedResponse<FavoriteItem>>(
          '/api/favorites?per_page=100',
          { token },
        );
        if (cancelled) return;
        replaceLocalFavorites(res.data.map((f) => f.property_id));
        void queryClient.invalidateQueries({ queryKey: favoritesQueryKeys.all });
      } catch {
        // Best-effort — leave the store as-is on failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, token, queryClient]);

  useEffect(() => {
    if (initialUser !== undefined) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const fetchUser = async () => {
      try {
        const r = await fetch('/api/auth/me', { signal: controller.signal });
        if (cancelled) return;
        if (r.ok) {
          const u = await r.json();
          if (!cancelled) setUser(u);
        } else {
          if (!cancelled) setUser(null);
          // If we got 401 and this is first load, try once more after delay
          // This handles race conditions where cookie isn't ready yet
          if (r.status === 401 && !hasRetriedRef.current) {
            hasRetriedRef.current = true;
            retryTimer = setTimeout(() => {
              fetch('/api/auth/me', { signal: controller.signal })
                .then((r2) => (r2.ok ? r2.json() : null))
                .then((u) => {
                  if (cancelled) return;
                  if (u) setUser(u);
                  else {
                    // Second try failed, logout to clean state
                    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
                  }
                })
                .catch(() => {
                  if (!cancelled) setUser(null);
                });
            }, 500);
          }
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchUser();

    return () => {
      cancelled = true;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [initialUser]);

  const handleSetUser = useCallback((u: User | null) => setUser(u), []);

  const refreshUser = useCallback(async () => {
    setIsLoading(true);
    try {
      const r = await fetch('/api/auth/me');
      if (r.ok) {
        setUser(await r.json());
      } else {
        setUser(null);
        if (r.status === 401) {
          fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
        }
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const persistToken = useCallback(async (next: string) => {
    await fetch('/api/auth/set-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: next }),
    });
  }, []);

  const openSession = useCallback(
    async (next: string, nextUser: User) => {
      await persistToken(next);
      // Push anon favourites BEFORE seeding so the seed effect sees them.
      await syncLocalFavorites(next);
      // Rien de ce qui a été lu sous l'identité précédente — ou sans identité — ne sert la
      // nouvelle : les clés de requête ne portent pas l'identité, et une réponse encore fraîche
      // (5 min de `staleTime`) serait rendue telle quelle. Vidé AVANT de poser le jeton : les
      // composants montés reconstruisent leurs requêtes au rendu qui suit, sous le nouveau jeton.
      queryClient.clear();
      setToken(next);
      setUser(nextUser);
    },
    [persistToken, syncLocalFavorites, queryClient],
  );

  const login = useCallback(
    async (payload: LoginPayload) => {
      const res = await apiLogin(payload);
      if (isTwoFactorChallenge(res)) {
        // Do not persist anything — the caller renders the 2FA step and
        // will re-invoke login() with `two_factor_code` or `recovery_code`.
        return res;
      }
      await openSession(res.token, res.user);
      return res;
    },
    [openSession],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const { token: next, user: u } = await apiRegister(payload);
      await openSession(next, u);
      return u;
    },
    [openSession],
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Even if the network call fails, drop the in-memory session.
    }
    // La règle d'`openSession`, dans l'autre sens : le compte suivant n'hérite d'aucune réponse
    // mise en cache sous celui-ci. Les favoris locaux, eux, sont vidés par l'effet d'amorçage
    // ci-dessus dès que `user` repasse à `null` — c'est apprendre la déconnexion qui manquait.
    queryClient.clear();
    setToken(null);
    setUser(null);
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        setUser: handleSetUser,
        refreshUser,
        login,
        register,
        openSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const noop = () => {};
const noopAsync = async () => {};
const noopThrow = async () => {
  throw new Error('AuthProvider is missing. Wrap the app tree in <AuthProvider>.');
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  return (
    ctx ?? {
      user: null,
      token: null,
      isLoading: false,
      setUser: noop,
      refreshUser: noopAsync,
      login: noopThrow as AuthContextValue['login'],
      register: noopThrow as AuthContextValue['register'],
      openSession: noopThrow as AuthContextValue['openSession'],
      logout: noopAsync,
    }
  );
}
