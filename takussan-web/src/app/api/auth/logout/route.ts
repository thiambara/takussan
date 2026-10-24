import { enTetesServeurAmont, urlApiServeur } from '@/lib/api';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { logout } from '@/lib/auth';
import { DELAI_DECONNEXION_API_MS } from '@/lib/delais-deconnexion';
import { IMPERSONATION_COOKIE } from '@/lib/impersonation';
import { effacerLaSession } from '@/lib/impersonation-serveur';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (token) {
    // TCK-1481 (P113.05) — une seule échéance pour les deux appels : sur une API figée, le relais
    // attendait `impersonate/stop` sans borne, puis `auth/logout` jusqu'à 30 s, avant d'effacer
    // quoi que ce soit. Passé `DELAI_DECONNEXION_API_MS`, il efface quand même (décision du
    // porteur, 2026-10-22). Un minuteur plutôt qu'`AbortSignal.timeout` : le test le pilote.
    const echeance = new AbortController();
    const minuteur = setTimeout(() => echeance.abort(), DELAI_DECONNEXION_API_MS);
    const borne = <T,>(appel: Promise<T>): Promise<T | null> =>
      Promise.race([
        appel.catch(() => null),
        new Promise<null>((resoudre) => {
          if (echeance.signal.aborted) resoudre(null);
          else echeance.signal.addEventListener('abort', () => resoudre(null), { once: true });
        }),
      ]);
    // TCK-600 (ADR-0055 §6) — la déconnexion de l'opérateur ferme aussi sa session d'impersonation.
    if (cookieStore.get(IMPERSONATION_COOKIE)?.value) {
      await borne(
        fetch(urlApiServeur('/admin/impersonate/stop'), {
          method: 'POST',
          headers: { ...(await enTetesServeurAmont()), Accept: 'application/json', Authorization: `Bearer ${token}` },
          signal: echeance.signal,
        }),
      );
    }
    // Jeton déjà expiré côté API, ou API muette : on efface les cookies quand même.
    await borne(logout(token, echeance.signal));
    clearTimeout(minuteur);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(AUTH_COOKIE_NAME);
  // TCK-509 (AC6) — le profil actif est lié à la session qui se ferme. Seul `set-token` l'effaçait,
  // à la connexion SUIVANTE : entre les deux, le résolveur recevait un profil sans propriétaire.
  response.cookies.delete(ACTIVE_PROFILE_COOKIE);
  effacerLaSession(response);
  return response;
}
