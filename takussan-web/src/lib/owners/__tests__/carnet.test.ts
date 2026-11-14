import { describe, expect, it } from 'vitest';

import { lireLeCarnet, parametresDuCarnet } from '../carnet';

describe('TCK-2641 — l’état du carnet dans l’URL', () => {
  it('lit la recherche, la vue et la page ; une valeur inconnue vaut le défaut', () => {
    expect(lireLeCarnet({ q: '  sene ', vue: 'reste', page: '3' })).toEqual({ recherche: 'sene', vue: 'reste', page: 3, parPage: 20 });
    expect(lireLeCarnet({ vue: 'autre', page: '0' })).toEqual({ recherche: '', vue: 'tous', page: 1, parPage: 20 });
    expect(lireLeCarnet({ vue: ['invitations', 'reste'], page: 'x' })).toEqual({ recherche: '', vue: 'invitations', page: 1, parPage: 20 });
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
});
