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

  it('refuse quand l’API échoue — on ne SAIT pas, donc on refuse', async () => {
    getToken.mockResolvedValue('tok');
    fetchAgency.mockRejectedValue(new Error('502'));
    expect(await refus(utilisateur(7))).toBe('/app');
    expect(fetchAgency).toHaveBeenCalledTimes(1);
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
