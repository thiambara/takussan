import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Le garde Standard-only, éprouvé PAR EXÉCUTION.
 *
 * Pourquoi ce fichier existe : le même défaut — « l'écran réservé s'affiche quand on ne sait
 * pas » — est passé au travers de TROIS revues de code successives, chaque fois d'un cran plus
 * haut, et chaque fois `scripts/check-pro-routes.mjs` a certifié le résultat vert :
 *
 *   1. le test écrit `if (agency && …)` — il ne refuse que si l'agence est résolue ;
 *   2. corrigé dans les pages, pas dans le helper partagé qui garde cinq routes ;
 *   3. corrigé dans le helper… au-dessous d'un `if (!token) return;` qui SAUTE la décision.
 *
 * Une garde syntaxique apprend à reconnaître la forme qu'on vient de corriger, jamais la
 * suivante : elle mesure une ressemblance, pas une propriété. Ces cinq cas exécutent la
 * fonction et regardent ce qu'elle FAIT. C'est la seule chose qui aurait attrapé les trois.
 *
 * @see takussan-web/src/lib/access/server-guards.ts
 * @see scripts/check-pro-routes.mjs (la garde syntaxique, qui reste utile en complément)
 */

const redirect = vi.fn((url: string) => {
  // `next/navigation` interrompt le rendu en levant : le reproduire évite qu'un `redirect`
  // suivi de code mort passe pour un refus alors qu'il n'en est pas un.
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const getToken = vi.fn<() => Promise<string | undefined>>();
const fetchAgency = vi.fn();

vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }));
vi.mock('@/lib/session', () => ({ getToken: () => getToken() }));
vi.mock('@/lib/queries/agencies', () => ({
  fetchAgency: (...a: unknown[]) => fetchAgency(...a),
}));

const { ensureStandardAgencyOrRedirect } = await import('../server-guards');
const { ApiError } = await import('@/lib/api');
const { MARQUEUR_AGENCE } = await import('../errors');

const utilisateur = (agencyId: number | null) =>
  ({ id: 1, agency_id: agencyId, roles: ['agency_admin'] }) as never;

/** Exécute la garde et rend l'URL de refus, ou `null` si elle a laissé passer. */
async function refus(user: ReturnType<typeof utilisateur>): Promise<string | null> {
  try {
    await ensureStandardAgencyOrRedirect(user);
    return null;
  } catch (e) {
    const m = /^NEXT_REDIRECT:(.*)$/.exec((e as Error).message);
    if (!m) throw e;
    return m[1];
  }
}

describe('ensureStandardAgencyOrRedirect', () => {
  beforeEach(() => {
    redirect.mockClear();
    getToken.mockReset();
    fetchAgency.mockReset();
  });

  it('laisse passer une agence `standard`', async () => {
    getToken.mockResolvedValue('tok');
    fetchAgency.mockResolvedValue({ id: 7, kind: 'standard' });
    expect(await refus(utilisateur(7))).toBeNull();
  });

  it('refuse une agence `individual`', async () => {
    getToken.mockResolvedValue('tok');
    fetchAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    expect(await refus(utilisateur(7))).toBe('/app');
  });

  it('refuse quand l’API RÉPOND non (403) — on sait, donc on refuse en silence', async () => {
    getToken.mockResolvedValue('tok');
    fetchAgency.mockRejectedValue(new ApiError(403, { message: 'Forbidden' }));
    expect(await refus(utilisateur(7))).toBe('/app');
    expect(fetchAgency).toHaveBeenCalledTimes(1);
  });

  it('LÈVE quand la panne est transitoire (5xx) — l’accès est refusé, mais pas en silence', async () => {
    // L'accès n'est pas accordé pour autant : lever fait rendre `(dashboard)/error.tsx`, qui dit
    // « on n'a pas pu vérifier ». Sans cela, un `agency_admin` d'une agence `standard` frappé par
    // une panne de trente secondes voyait la console disparaître sans un mot — indiscernable d'un
    // déclassement de forfait.
    getToken.mockResolvedValue('tok');
    fetchAgency.mockRejectedValue(new ApiError(503, { message: 'Service Unavailable' }));
    // L'erreur relancée porte le MARQUEUR : c'est lui qui permet à `(dashboard)/error.tsx` de
    // distinguer ce cas de tous les autres qu'elle attrape, et de ne pas expliquer un bug de
    // rendu par les accès de l'agence.
    await expect(ensureStandardAgencyOrRedirect(utilisateur(7))).rejects.toThrow(MARQUEUR_AGENCE);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('LÈVE aussi sur une erreur réseau — l’absence de réponse n’est pas une réponse', async () => {
    getToken.mockResolvedValue('tok');
    fetchAgency.mockRejectedValue(new TypeError('fetch failed'));
    await expect(ensureStandardAgencyOrRedirect(utilisateur(7))).rejects.toThrow(MARQUEUR_AGENCE);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('refuse quand le jeton est absent — la décision ne se saute pas', async () => {
    // LE cas qui a survécu à trois revues. Avec `if (!token) return;`, la fonction rendait
    // `undefined` sans avoir rien décidé, et les cinq routes /admin/* s'affichaient.
    getToken.mockResolvedValue(undefined);
    fetchAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    expect(await refus(utilisateur(7))).toBe('/app');
    expect(fetchAgency).not.toHaveBeenCalled();
  });

  it('laisse passer sans `agency_id` — seule sortie sans décision, et elle est voulue', async () => {
    // Un super-admin hors contexte de tenant n'a pas d'agence dont juger le `kind` ; la
    // console transverse ne dépend d'aucune. C'est documenté dans le docblock du helper.
    getToken.mockResolvedValue('tok');
    expect(await refus(utilisateur(null))).toBeNull();
    expect(getToken).not.toHaveBeenCalled();
    expect(fetchAgency).not.toHaveBeenCalled();
  });
});
