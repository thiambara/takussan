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
  //
  // ⚠ Le `digest` est ESSENTIEL, et il manquait. Next ne marque son erreur de redirection que
  // par cette propriété — jamais par le message. Sans elle, le laissez-passer de
  // `server-guards.ts` (`digest.startsWith('NEXT_REDIRECT')`) n'était jamais exercé par la
  // suite : le cas « corps 200 sans data » ne passait que parce que `classer()` rendait
  // incidemment « bug » pour l'erreur du mock et la relançait — exactement la coïncidence sur
  // laquelle le commentaire du code dit ne pas vouloir compter. Élargir `classer()` aurait
  // avalé la redirection, en laissant ce test vert.
  //
  // *Un mock qui ne porte pas le marqueur du vrai laisse le code qui le lit sans témoin.*
  const e = new Error(`NEXT_REDIRECT:${url}`) as Error & { digest?: string };
  e.digest = `NEXT_REDIRECT;replace;${url};307;`;
  throw e;
});
const getToken = vi.fn<() => Promise<string | undefined>>();
const fetchAgency = vi.fn();

vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }));
vi.mock('@/lib/session', () => ({ getToken: () => getToken() }));
vi.mock('@/lib/queries/agencies', () => ({
  fetchAgency: (...a: unknown[]) => fetchAgency(...a),
}));

const { ensureStandardAgencyOrRedirect, resolveAgencyOrNull } = await import('../server-guards');
const { ApiError } = await import('@/lib/api');

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
    // Une ROUTE distincte, pas `/app` : `/app` veut dire « non », celle-ci dit « je n'ai pas pu
    // demander ». La distinction ne repose sur aucune sérialisation d'erreur — Next expurge les
    // messages des Server Components en production, ce qui avait rendu la version précédente
    // (un marqueur dans `error.message`) inopérante là où elle comptait.
    expect(await refus(utilisateur(7))).toBe('/app/verification-indisponible');
  });

  it('renvoie aussi sur une panne RÉSEAU — l’absence de réponse n’est pas une réponse', async () => {
    getToken.mockResolvedValue('tok');
    fetchAgency.mockRejectedValue(new TypeError('fetch failed'));
    expect(await refus(utilisateur(7))).toBe('/app/verification-indisponible');
  });

  it('reconnaît une panne réseau par `cause.code`, pas par des mots du message', async () => {
    getToken.mockResolvedValue('tok');
    const e = new TypeError('Failed to fetch') as TypeError & { cause?: { code: string } };
    e.cause = { code: 'ECONNREFUSED' };
    fetchAgency.mockRejectedValue(e);
    expect(await refus(utilisateur(7))).toBe('/app/verification-indisponible');
  });

  it('un bug dont le message CONTIENT « timeout » reste un bug', async () => {
    // Le motif précédent cherchait /…|timeout/i dans n'importe quel message : un
    // `TypeError: Cannot read properties of undefined (reading 'timeout')` — bug ordinaire —
    // devenait une invitation à réessayer, sans `digest`, sans pile, et sans issue.
    getToken.mockResolvedValue('tok');
    const bug = new TypeError("Cannot read properties of undefined (reading 'timeout')");
    fetchAgency.mockRejectedValue(bug);
    await expect(ensureStandardAgencyOrRedirect(utilisateur(7))).rejects.toThrow(bug);
  });

  it('explique sur un 400 — un champ invalide ne dit RIEN du forfait', async () => {
    // Le cas concret : `AGENCY_ADMIN_FIELDS` demande `fields[agencies]=…,kind`. Si `kind`
    // quittait `Agency::$queryFields`, spatie lèverait `InvalidFieldQuery` → 400, et la version
    // précédente évinçait TOUS les `agency_admin` des neuf surfaces pro sans un mot —
    // indiscernablement d'un déclassement. Un 4xx est une réponse, mais seuls 401 et 403 sont
    // des réponses SUR LE DROIT de cet utilisateur.
    getToken.mockResolvedValue('tok');
    fetchAgency.mockRejectedValue(new ApiError(400, { message: 'Invalid field kind' }));
    expect(await refus(utilisateur(7))).toBe('/app/verification-indisponible');
  });

  it('RELANCE un bug — il ne se déguise pas en « réessayez dans un instant »', async () => {
    // Trois issues, pas deux. Une erreur qui n'est pas une `ApiError` est une erreur de
    // PROGRAMMATION : la router vers la page « nous n'avons pas pu joindre le serveur »
    // produirait une impasse permanente sous un diagnostic faux — aucune tentative n'y change
    // rien, et le `digest` qui aurait permis de la diagnostiquer n'existe jamais.
    getToken.mockResolvedValue('tok');
    const bug = new TypeError("Cannot read properties of undefined (reading 'kind')");
    fetchAgency.mockRejectedValue(bug);
    await expect(ensureStandardAgencyOrRedirect(utilisateur(7))).rejects.toThrow(bug);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('refuse en silence sur 404 — « invisible pour vous » est une réponse', async () => {
    // `AgencyController::show` fait `abort_unless(canViewAgency(), 404)`. C'est définitif :
    // l'envoyer sur la page « je n'ai pas pu demander » ne lui donnerait jamais de réponse.
    getToken.mockResolvedValue('tok');
    fetchAgency.mockRejectedValue(new ApiError(404, { message: 'Not Found' }));
    expect(await refus(utilisateur(7))).toBe('/app');
  });

  it('explique sur un corps 200 SANS `data` — un corps illisible n’est pas un refus', async () => {
    // `fetchAgency` rend `res.data`, qui vaut `undefined` sans lever. Le cas tombait dans le
    // `!agency` muet alors qu'un commentaire le rangeait parmi ceux qui s'expliquent.
    getToken.mockResolvedValue('tok');
    fetchAgency.mockResolvedValue(undefined);
    expect(await refus(utilisateur(7))).toBe('/app/verification-indisponible');
  });

  it('refuse en silence sur 401 — la session, pas le forfait', async () => {
    getToken.mockResolvedValue('tok');
    fetchAgency.mockRejectedValue(new ApiError(401, { message: 'Unauthenticated' }));
    expect(await refus(utilisateur(7))).toBe('/app');
  });

  it('refuse quand le jeton est absent — la décision ne se saute pas', async () => {
    // LE cas qui a survécu à trois revues. Avec `if (!token) return;`, la fonction rendait
    // `undefined` sans avoir rien décidé, et les cinq routes /admin/* s'affichaient.
    getToken.mockResolvedValue(undefined);
    fetchAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    expect(await refus(utilisateur(7))).toBe('/app');
    expect(fetchAgency).not.toHaveBeenCalled();
  });

  it('AFFICHAGE : un bug rend `null`, il ne fait pas tomber la page', async () => {
    // Le contrat du paramètre `usage` : « faire tomber toute la page en erreur pour un cadenas
    // serait pire que le cadenas ». Le `throw` du verdict « bug » était placé AVANT ce test, si
    // bien qu'un corps non-JSON — `apiRequest` rend alors `null`, et `res.data` lève un
    // `TypeError` — faisait rejeter `app/layout.tsx` et `admin/layout.tsx` : toute la coquille
    // `/app/*` et `/admin/*` basculait sur la frontière d'erreur, là où l'ancien code perdait
    // seulement un cadenas.
    fetchAgency.mockRejectedValue(new TypeError("Cannot read properties of null (reading 'data')"));
    await expect(resolveAgencyOrNull('tok', 7, 'test', 'affichage')).resolves.toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('DÉCISION : le même bug remonte — deux contrats, deux sorties', async () => {
    const bug = new TypeError("Cannot read properties of null (reading 'data')");
    fetchAgency.mockRejectedValue(bug);
    await expect(resolveAgencyOrNull('tok', 7, 'test', 'decision')).rejects.toThrow(bug);
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
