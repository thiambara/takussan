import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGES_RECENTES_MAX, clePagesRecentes, lirePagesRecentes, retenirPage } from '../pages-recentes';

/**
 * TCK-2482 (A8) — les pages de `/app` ouvertes sur CET appareil, pour la palette : par compte, au plus
 * huit chemins, le plus récent en tête, sans doublon ; rien hors de `/app` ; un stockage qui lève (navigation
 * privée, quota) ne casse rien. Rien ne part au serveur.
 */
describe('pages récentes (TCK-2482)', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('la plus récente en tête, sans doublon', () => {
    retenirPage(1, '/app/payments');
    retenirPage(1, '/app/leases/3');
    retenirPage(1, '/app/payments');
    expect(lirePagesRecentes(1)).toEqual(['/app/payments', '/app/leases/3']);
  });

  it(`au plus ${PAGES_RECENTES_MAX}`, () => {
    for (let i = 0; i < PAGES_RECENTES_MAX + 3; i++) retenirPage(1, `/app/leases/${i}`);
    const lues = lirePagesRecentes(1);
    expect(lues).toHaveLength(PAGES_RECENTES_MAX);
    expect(lues[0]).toBe(`/app/leases/${PAGES_RECENTES_MAX + 2}`);
  });

  it('seules les pages de /app sont retenues', () => {
    retenirPage(1, '/properties');
    retenirPage(1, '/application');
    retenirPage(1, '/app');
    expect(lirePagesRecentes(1)).toEqual(['/app']);
  });

  it('par compte : un autre compte du même appareil ne les lit pas', () => {
    retenirPage(1, '/app/payments');
    expect(lirePagesRecentes(2)).toEqual([]);
    expect(clePagesRecentes(1)).not.toBe(clePagesRecentes(2));
  });

  it('une valeur illisible ou d’une autre forme ne casse rien', () => {
    window.localStorage.setItem(clePagesRecentes(1), '{pas du json');
    expect(lirePagesRecentes(1)).toEqual([]);
    window.localStorage.setItem(clePagesRecentes(1), JSON.stringify([1, null, '/ailleurs', '/app/visits']));
    expect(lirePagesRecentes(1)).toEqual(['/app/visits']);
  });

  it('revue I3 — dédoublonnées À L’ÉCRITURE par entrée du menu : huit fiches d’une section n’effacent pas les autres', () => {
    const entreeDe = (c: string) =>
      c.startsWith('/app/leases') ? '/app/leases' : ['/app/payments', '/app/messages'].includes(c) ? c : null;
    retenirPage(1, '/app/payments', entreeDe);
    retenirPage(1, '/app/messages', entreeDe);
    for (let i = 1; i <= 8; i++) retenirPage(1, `/app/leases/${i}`, entreeDe);
    expect(lirePagesRecentes(1)).toEqual(['/app/leases/8', '/app/messages', '/app/payments']);
  });

  it('revue I3 — un chemin qu’aucune entrée ne couvre reste brut, et n’écarte que lui-même', () => {
    const entreeDe = (c: string) => (c.startsWith('/app/leases') ? '/app/leases' : null);
    retenirPage(1, '/app/ailleurs/1', entreeDe);
    retenirPage(1, '/app/leases/1', entreeDe);
    retenirPage(1, '/app/ailleurs/2', entreeDe);
    retenirPage(1, '/app/leases/2', entreeDe);
    expect(lirePagesRecentes(1)).toEqual(['/app/leases/2', '/app/ailleurs/2', '/app/ailleurs/1']);
  });

  it('un stockage qui lève ne casse rien', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(() => retenirPage(1, '/app/payments')).not.toThrow();
    expect(lirePagesRecentes(1)).toEqual([]);
  });
});
