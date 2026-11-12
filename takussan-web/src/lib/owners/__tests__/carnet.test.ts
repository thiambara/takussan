import { describe, expect, it } from 'vitest';

import { lireLeCarnet, parametresDuCarnet } from '../carnet';

describe('TCK-2641 — l’état du carnet dans l’URL', () => {
  it('lit la recherche, la vue et la page ; une valeur inconnue vaut le défaut', () => {
    expect(lireLeCarnet({ q: '  sene ', vue: 'reste', page: '3' })).toEqual({ recherche: 'sene', vue: 'reste', page: 3 });
    expect(lireLeCarnet({ vue: 'autre', page: '0' })).toEqual({ recherche: '', vue: 'tous', page: 1 });
    expect(lireLeCarnet({ vue: ['invitations', 'reste'], page: 'x' })).toEqual({ recherche: '', vue: 'invitations', page: 1 });
  });

  it('chaque vue a son filtre ; le tri suit le reste à verser pour qui lit le relevé, le nom sinon', () => {
    const tous = { recherche: '', vue: 'tous', page: 1 } as const;
    expect(parametresDuCarnet(7, tous, true)).toEqual({ agencyId: 7, page: 1, perPage: 20, sort: '-remaining_to_pay' });
    expect(parametresDuCarnet(7, tous, false).sort).toBe('name');
    expect(parametresDuCarnet(7, { ...tous, vue: 'reste' }, true)).toMatchObject({ hasRemaining: true });
    expect(parametresDuCarnet(7, { ...tous, vue: 'invitations' }, true)).toMatchObject({ status: 'draft' });
    expect(parametresDuCarnet(7, { ...tous, recherche: 'sene' }, true, 1)).toMatchObject({ search: 'sene', perPage: 1 });
  });
});
