'use client';

import { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
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
import { DELAI_DECONNEXION_MS } from '@/lib/delais-deconnexion';
import { apiRequest } from '@/lib/api';
import { poserProfilActifNavigateur } from '@/lib/profil-actif-navigateur';
import {
  getIds as getLocalFavoriteIds,
  clear as clearLocalFavorites,
  replace as replaceLocalFavorites,
  chargerAuPremierAbonne,
} from '@/lib/favoritesStore';
import { favoritesQueryKeys, fetchAllFavoritePropertyIds } from '@/lib/queries/favorites';

type AuthContextValue = {
  user: User | null;
  /**
   * Auth token (Sanctum). Exposed so client-side helpers like `useApiQuery`
   * can forward it to `Authorization: Bearer ...`. Prefer same-origin Next
   * route handlers for authenticated reads — they already read the HttpOnly
   * cookie server-side — but direct cross-origin calls need this token.
   */
  token: string | null;
  /**
   * TCK-2050 (P174.01) — le profil actif, que `apiRequest` pose en `X-Active-Profile-Hint` sur
   * tout appel authentifié du navigateur : le cookie `active_profile_id` du front n'atteint pas
   * l'API, qui est sur une autre origine. Reçu du layout racine, mis à jour par
   * `useSwitchActiveProfile` ; oublié à l'ouverture et à la fermeture d'une session, comme le
   * cookie (`set-token`, `logout`).
   */
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
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
  openSession: (token: string, user: User, expiresAt?: string) => Promise<void>;
  /**
   * Revoke the backend token, clear the auth cookies, and drop everything the session left on the
   * client — token, user, React Query cache, local favorites store (TCK-509). Does not navigate —
   * callers decide where to go next (the Navbar redirects to `/`). **La seule sortie** : le menu de `/app` et la `Navbar` passent par ici.
   */
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialUser,
  initialToken,
  initialActiveProfileId,
}: {
  children: React.ReactNode;
  initialUser?: User | null;
  initialToken?: string | null;
  initialActiveProfileId?: string | null;
}) {
  const [user, setUser] = useState<User | null>(initialUser ?? null);
  const [token, setToken] = useState<string | null>(initialToken ?? null);
  // TCK-2158 (P202.01) — le layout racine relit `/api/auth/me` à chaque rendu serveur
  // (`router.refresh()`, action serveur) : ce qu'il rend de NEUF fait foi, comme pour le profil
  // actif ci-dessous. Un utilisateur non nul se pose ; un jeton neuf se pose ; le compte ne se vide
  // que si le jeton disparaît aussi. Un `null` sous un jeton présent (échec ou délai de `/me`, cf.
  // `DELAI_ME_RACINE_MS`) garde le compte, comme TCK-1992. Tant que les propriétés ne changent
  // pas, ce que le client a posé (`setUser`, `openSession`, `logout`) reste.
  const [compteDuLayout, setCompteDuLayout] = useState({
    user: initialUser ?? null,
    token: initialToken ?? null,
  });
  if ((initialUser ?? null) !== compteDuLayout.user || (initialToken ?? null) !== compteDuLayout.token) {
    const nouvelUtilisateur = initialUser ?? null;
    const nouveauJeton = initialToken ?? null;
    setCompteDuLayout({ user: nouvelUtilisateur, token: nouveauJeton });
    if (nouveauJeton !== compteDuLayout.token) setToken(nouveauJeton);
    if (nouvelUtilisateur !== null) setUser(nouvelUtilisateur);
    else if (nouveauJeton === null) setUser(null);
  }
  // TCK-2050 (P174.01) — écrit dans le module que lit `apiRequest` dès le premier rendu, avant que
  // les requêtes des enfants partent (elles partent à l'abonnement, après le rendu).
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(() => {
    poserProfilActifNavigateur(initialActiveProfileId);
    return initialActiveProfileId ?? null;
  });
  // Le layout racine se rend de nouveau sur `router.refresh()` et après une action serveur qui
  // pose le cookie (les parcours d'accueil) : la valeur qu'il lit fait alors foi.
  const [profilDuLayout, setProfilDuLayout] = useState<string | null>(initialActiveProfileId ?? null);
  if ((initialActiveProfileId ?? null) !== profilDuLayout) {
    setProfilDuLayout(initialActiveProfileId ?? null);
    setActiveProfileIdState(initialActiveProfileId ?? null);
  }
  useLayoutEffect(() => {
    poserProfilActifNavigateur(activeProfileId);
  }, [activeProfileId]);
  const setActiveProfileId = useCallback((id: string | null) => {
    poserProfilActifNavigateur(id);
    setActiveProfileIdState(id);
  }, []);
  // TCK-1992 (P172.06) — plus de lecture initiale de `/api/auth/me` par le navigateur : le seul
  // monteur, la mise en page racine, passe toujours `initialUser` (`null` ou un utilisateur), et
  // cette lecture morte portait la même déconnexion sur 401 que `refreshUser`.
  const [isLoading, setIsLoading] = useState(false);
  // TCK-1992 (P172.03) — rang de la dernière demande de `refreshUser` : seule sa réponse
  // s'applique. `logout` l'avance aussi, pour qu'une relecture en vol ne remette pas un compte.
  const rangDemandeRef = useRef(0);
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
  // (a) on auth → fetch /api/favorites (at the store's first subscriber) and replace the store, (b) on logout
  // → clear the store. The store stays the canonical reactive cache that
  // the navbar popover, every <FavoriteButton>, and the detail page heart
  // all subscribe to.
  // TCK-1764 (P172.04) — l'effet dépend du compte et de son agence, pas de l'objet `user`, que
  // chaque `refreshUser()` remplace : la liste ne dépend que d'eux (`FavoriteController::index`,
  // `staffAgencyId()`), et relire tous les favoris pour le même compte ne rendait rien de neuf.
  const userId = user?.id ?? null;
  const userAgencyId = user?.agency_id ?? null;
  useEffect(() => {
    if (userId === null || !token) {
      if (wasAuthedRef.current) {
        clearLocalFavorites();
        wasAuthedRef.current = false;
      }
      return;
    }
    wasAuthedRef.current = true;

    // TCK-1826 (P136.05) — lus au premier abonné du magasin (cœur, compteur), pas au montage.
    let cancelled = false;
    const retirer = chargerAuPremierAbonne(() => {
      void (async () => {
        try {
          const ids = await fetchAllFavoritePropertyIds(token);
          if (cancelled) return;
          replaceLocalFavorites(ids);
          void queryClient.invalidateQueries({ queryKey: favoritesQueryKeys.all });
        } catch {
          // Best-effort — leave the store as-is on failure.
        }
      })();
    });
    return () => {
      cancelled = true;
      retirer();
    };
  }, [userId, userAgencyId, token, queryClient]);

  const handleSetUser = useCallback((u: User | null) => setUser(u), []);

  const refreshUser = useCallback(async () => {
    const rang = ++rangDemandeRef.current;
    const derniere = () => rang === rangDemandeRef.current;
    setIsLoading(true);
    try {
      const r = await fetch('/api/auth/me');
      if (!derniere()) return;
      if (r.ok) {
        const u = await r.json();
        if (derniere()) setUser(u);
      } else if (r.status === 401) {
        // TCK-1992 (P172.01) — seul un 401 dit la session morte. Toute autre erreur (API en
        // panne, lente, limitée, refus de second facteur) garde l'utilisateur en place.
        setUser(null);
        fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      }
    } catch {
      // Relais injoignable : rien ne dit que la session est close, l'utilisateur reste.
    } finally {
      if (derniere()) setIsLoading(false);
    }
  }, []);

  // TCK-589 — `expires_at` voyage avec le jeton : le cookie ne lui survit jamais.
  const persistToken = useCallback(async (next: string, expiresAt?: string) => {
    await fetch('/api/auth/set-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: next, expires_at: expiresAt }),
    });
  }, []);

  const openSession = useCallback(
    async (next: string, nextUser: User, expiresAt?: string) => {
      await persistToken(next, expiresAt);
      // Push anon favourites BEFORE seeding so the seed effect sees them.
      await syncLocalFavorites(next);
      // Rien de ce qui a été lu sous l'identité précédente — ou sans identité — ne sert la
      // nouvelle : les clés de requête ne portent pas l'identité, et une réponse encore fraîche
      // (5 min de `staleTime`) serait rendue telle quelle. Vidé AVANT de poser le jeton : les
      // composants montés reconstruisent leurs requêtes au rendu qui suit, sous le nouveau jeton.
      queryClient.clear();
      // `set-token` vient d'effacer le cookie de profil actif : la nouvelle session n'en a aucun.
      setActiveProfileId(null);
      setToken(next);
      setUser(nextUser);
    },
    [persistToken, syncLocalFavorites, queryClient, setActiveProfileId],
  );

  const login = useCallback(
    async (payload: LoginPayload) => {
      const res = await apiLogin(payload);
      if (isTwoFactorChallenge(res)) {
        // Do not persist anything — the caller renders the 2FA step and
        // will re-invoke login() with `two_factor_code` or `recovery_code`.
        return res;
      }
      await openSession(res.token, res.user, res.expires_at);
      return res;
    },
    [openSession],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const { token: next, user: u, expires_at: expiresAt } = await apiRegister(payload);
      await openSession(next, u, expiresAt);
      return u;
    },
    [openSession],
  );

  const logout = useCallback(async () => {
    // TCK-1992 (P172.03) — toute relecture encore en vol est périmée.
    rangDemandeRef.current += 1;
    // TCK-1481 (P113.05) — l'attente du relais est bornée : sur une API figée, « Se déconnecter »
    // ne produisait rien de visible et la session restait ouverte dans l'onglet. Passé
    // `DELAI_DECONNEXION_MS`, l'état local se vide quand même (décision du porteur, 2026-10-22).
    const echeance = new AbortController();
    const minuteur = setTimeout(() => echeance.abort(), DELAI_DECONNEXION_MS);
    try {
      await fetch('/api/auth/logout', { method: 'POST', signal: echeance.signal });
    } catch {
      // Even if the network call fails, drop the in-memory session.
    } finally {
      clearTimeout(minuteur);
    }
    // La règle d'`openSession`, dans l'autre sens : le compte suivant n'hérite d'aucune réponse
    // mise en cache sous celui-ci. Les favoris locaux, eux, sont vidés par l'effet d'amorçage
    // ci-dessus dès que `user` repasse à `null` — c'est apprendre la déconnexion qui manquait.
    queryClient.clear();
    setActiveProfileId(null);
    setToken(null);
    setUser(null);
    setIsLoading(false);
  }, [queryClient, setActiveProfileId]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        activeProfileId,
        setActiveProfileId,
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
      activeProfileId: null,
      setActiveProfileId: noop,
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
