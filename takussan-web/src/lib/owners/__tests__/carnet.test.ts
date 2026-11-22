import { describe, expect, it } from 'vitest';

import { lireLeCarnet, parametresDuCarnet, triEffectif } from '../carnet';

describe('TCK-2641 — l’état du carnet dans l’URL', () => {
  it('lit la recherche, la vue et la page ; une valeur inconnue vaut le défaut', () => {
    expect(lireLeCarnet({ q: '  sene ', vue: 'reste', page: '3' })).toEqual({ recherche: 'sene', vue: 'reste', page: 3, parPage: 20, tri: null });
    expect(lireLeCarnet({ vue: 'autre', page: '0' })).toEqual({ recherche: '', vue: 'tous', page: 1, parPage: 20, tri: null });
    expect(lireLeCarnet({ vue: ['invitations', 'reste'], page: 'x' })).toEqual({ recherche: '', vue: 'invitations', page: 1, parPage: 20, tri: null });
  });

  it('chaque vue a son filtre ; le tri suit le reste à verser pour qui lit le relevé, le nom sinon', () => {
    const tous = { recherche: '', vue: 'tous', page: 1, parPage: 20 } as const;
    expect(parametresDuCarnet(7, tous, true)).toEqual({ agencyId: 7, page: 1, perPage: 20, sort: '-remaining_to_pay' });
    expect(parametresDuCarnet(7, tous, false).sort).toBe('name');
    expect(parametresDuCarnet(7, { ...tous, vue: 'reste' }, true)).toMatchObject({ hasRemaining: true });
    expect(parametresDuCarnet(7, { ...tous, vue: 'invitations' }, true)).toMatchObject({ status: 'draft' });
    expect(parametresDuCarnet(7, { ...tous, recherche: 'sene' }, true, 1)).toMatchObject({ search: 'sene', perPage: 1 });
  });

  it('TCK-2815 — la densité de l’adresse : 10, 20 ou 50 partent tels quels, toute autre valeur rend 20', () => {
    expect(lireLeCarnet({ per_page: '50' }).parPage).toBe(50);
    expect(lireLeCarnet({ per_page: ['10', '50'] }).parPage).toBe(10);
    for (const valeur of ['37', 'abc', '5000', '-10', '0']) expect(lireLeCarnet({ per_page: valeur }).parPage).toBe(20);
    expect(parametresDuCarnet(7, lireLeCarnet({ per_page: '50', page: '2' }), true)).toMatchObject({ perPage: 50, page: 2 });
  });

  // TCK-2910 — « Filtres et tri » : le tri de l'URL part à l'API (`sort`), parmi les seuls tris qu'elle
  // accepte ; un tri d'argent n'est offert qu'au lecteur du relevé.
  it('TCK-2910 — le tri de l’adresse part à l’API, les tris d’argent au seul lecteur du relevé', () => {
    expect(lireLeCarnet({ tri: 'versement' }).tri).toBe('versement');
    expect(lireLeCarnet({ tri: 'prix' }).tri).toBeNull();
    const etat = (tri: string) => lireLeCarnet({ tri });
    expect(parametresDuCarnet(7, etat('nom'), true).sort).toBe('name');
    expect(parametresDuCarnet(7, etat('reste'), true).sort).toBe('-remaining_to_pay');
    expect(parametresDuCarnet(7, etat('versement'), true).sort).toBe('-last_payout_at');
    // Sans lecture de l'argent, un tri d'argent de l'URL retombe sur le nom.
    expect(parametresDuCarnet(7, etat('versement'), false).sort).toBe('name');
    expect(triEffectif(etat('reste'), false)).toBe('nom');
    expect(triEffectif(lireLeCarnet({}), true)).toBe('reste');
  });
});
