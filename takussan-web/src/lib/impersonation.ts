/**
 * TCK-600 (ADR-0055) — la session d'impersonation, côté front.
 *
 * Le JETON ne quitte jamais le serveur du front : le route handler `POST /api/impersonation/start`
 * le range dans le cookie httpOnly {@link IMPERSONATION_COOKIE}, et le navigateur n'en reçoit
 * aucune copie — ni corps JSON, ni `localStorage`, ni `sessionStorage` (l'ancienne session vivait
 * en clair dans `localStorage`, lisible par tout script de la page).
 *
 * Le navigateur sait seulement QU'UNE session est ouverte, par le témoin
 * {@link IMPERSONATION_MARKER_COOKIE} (`1`, sans secret) : c'est ce qui fait passer `apiRequest`
 * par le relais same-origin {@link IMPERSONATION_RELAY}, qui ajoute le jeton côté serveur.
 */

export const IMPERSONATION_COOKIE = 'impersonation_token';
export const IMPERSONATION_MARKER_COOKIE = 'impersonation_active';
export const IMPERSONATION_RELAY = '/api/impersonation/proxy';

/** Ce que le navigateur reçoit au démarrage — sans jeton. */
export type ImpersonationDemarree = {
  session_id: number;
  expires_at: string;
  target: { id: number; name: string | null };
};

/** `GET /api/impersonation/current` : ce que la bannière affiche. */
export type ImpersonationCourante = {
  session_id: number;
  impersonator: { id: number | null; name: string | null };
  target: { id: number | null; name: string | null };
  expires_at: string;
  read_only: true;
};

/** Le témoin est-il posé ? Toujours `false` hors navigateur. */
export function relaisImpersonationActif(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .some((morceau) => morceau.trim().startsWith(`${IMPERSONATION_MARKER_COOKIE}=`));
}

/** Le chemin du relais pour un chemin d'API (`/api/…`), ou `null` s'il n'en est pas un. */
export function cheminParLeRelais(path: string): string | null {
  if (!path.startsWith('/api/')) return null;
  return `${IMPERSONATION_RELAY}/${path.slice('/api/'.length)}`;
}

/**
 * Les deux chemins de la console que le proxy générique ne relaie JAMAIS (ADR-0055 §6) : le jeton
 * de démarrage n'atteindrait la page que par lui. Seuls les route handlers dédiés démarrent et
 * terminent.
 */
export function cheminReserveAuxRouteHandlers(path: string): boolean {
  const propre = path.replace(/^\/+|\/+$/g, '');
  return /^users\/[^/]+\/impersonate$/.test(propre) || propre === 'impersonate/stop';
}

type MagasinDeCookies = { get(name: string): { value: string } | undefined };

/**
 * TCK-600 (ADR-0055 §6) — le jeton d'un route handler de l'ESPACE APPLICATIF : celui de la
 * session d'impersonation s'il y en a une, sinon celui de l'utilisateur. Sans cela, un relais de
 * l'espace applicatif lirait — et ÉCRIRAIT — avec le jeton de l'opérateur pendant que la bannière
 * annonce la lecture seule. Les relais de la console lisent `auth_token`, eux, directement.
 */
export function jetonEspaceApplicatif(magasin: MagasinDeCookies): string | undefined {
  return magasin.get(IMPERSONATION_COOKIE)?.value ?? magasin.get('auth_token')?.value;
}

/** Invariant 11 : pendant une session, le profil actif de l'opérateur n'est jamais transmis. */
export function profilActifEspaceApplicatif(magasin: MagasinDeCookies): string | undefined {
  if (magasin.get(IMPERSONATION_COOKIE)?.value) return undefined;
  return magasin.get('active_profile_id')?.value;
}
