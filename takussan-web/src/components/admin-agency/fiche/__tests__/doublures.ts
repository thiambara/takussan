import { useSyncExternalStore } from 'react';
import { vi } from 'vitest';

/**
 * TCK-2670 — les doublures communes aux tests de la fiche de l'agence. Chaque fichier de test les
 * branche par `vi.mock('…', async () => (await import('./doublures')).X)` : `vi.mock` est remonté
 * au-dessus des imports, sa fabrique ne peut lire qu'un module importé dans son corps.
 *
 * Des objets à IDENTITÉ STABLE, comme les vrais hooks : un objet neuf à chaque appel casserait le
 * cache du React Compiler (TCK-564 E-repair-1).
 *
 * Ce module n'importe PAS la fiche : il est chargé par les fabriques des `vi.mock`, avant elle.
 */

// jsdom n'a pas `scrollIntoView` : la jauge y mène son champ.
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

export const ROUTEUR = { refresh: vi.fn(), back: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };

/*
 * `useSearchParams` suit `history.pushState`, comme celui de Next (qui s'y branche depuis 14.1) : la
 * fiche change de section sans routeur, et c'est ce que le test doit voir.
 */
const ECOUTEURS = new Set<() => void>();
const pushStateNatif = window.history.pushState.bind(window.history);
window.history.pushState = (...args: Parameters<History['pushState']>) => {
  pushStateNatif(...args);
  ECOUTEURS.forEach((f) => f());
};
function abonner(f: () => void) {
  ECOUTEURS.add(f);
  window.addEventListener('popstate', f);
  return () => {
    ECOUTEURS.delete(f);
    window.removeEventListener('popstate', f);
  };
}
let derniere = { search: '', params: new URLSearchParams() };
function lireLesParametres() {
  if (window.location.search !== derniere.search) {
    derniere = { search: window.location.search, params: new URLSearchParams(window.location.search) };
  }
  return derniere.params;
}

export const navigation = {
  useRouter: () => ROUTEUR,
  useSearchParams: () => useSyncExternalStore(abonner, lireLesParametres, lireLesParametres),
  usePathname: () => useSyncExternalStore(abonner, () => window.location.pathname, () => window.location.pathname),
  redirect: vi.fn(),
  notFound: vi.fn(),
};

export const ACTIONS = {
  updateAgencyAction: vi.fn(),
  uploadAgencyLogoAction: vi.fn(),
  confirmPayoutThresholdAction: vi.fn(),
  regenerateAgencyWatermarksAction: vi.fn(),
};

export const MOI = { current: { user: { id: 11 } as { id: number } | null, token: 'jeton' } };
export const auth = { useAuth: () => MOI.current };

export const CAN = { current: { can: false, isLoading: false } };
export const can = { useCan: () => CAN.current };

/** Le dossier de vérification (`GET /api/agencies/{id}/kyc`) : `null` = aucun dossier ouvert. */
export const KYC = { fetchAgencyKyc: vi.fn() };
/** L'état du second facteur de l'équipe (`GET /api/admin-users`). */
export const EQUIPE = { fetchDoubleFacteurDeLEquipe: vi.fn() };
/** Le compte de la file de modération : la clé réelle, la lecture doublée. */
export const MODERATION = { compte: vi.fn() };
export const fileDeModeration = {
  propertyModerationCountQueryOptions: () => ({
    queryKey: ['property-moderation', 'pending-count'],
    queryFn: () => MODERATION.compte(),
  }),
};
/** `apiRequest` : la vitrine cherche les biens publics de l'agence par lui (`useApiQuery`). */
export const API = { apiRequest: vi.fn() };

/** Remet les doublures à leur réponse par défaut : une agence sans dossier, une équipe à jour. */
export function reinitialiserLesDoublures() {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/app/agency');
  MOI.current = { user: { id: 11 }, token: 'jeton' };
  CAN.current = { can: false, isLoading: false };
  KYC.fetchAgencyKyc.mockResolvedValue({ data: null });
  EQUIPE.fetchDoubleFacteurDeLEquipe.mockResolvedValue({ sans: 0, lus: 3, total: 3 });
  MODERATION.compte.mockResolvedValue(0);
  API.apiRequest.mockResolvedValue({ data: [], meta: { total: 0 } });
  ACTIONS.regenerateAgencyWatermarksAction.mockResolvedValue({ ok: true, data: { queued: 0 } });
}
