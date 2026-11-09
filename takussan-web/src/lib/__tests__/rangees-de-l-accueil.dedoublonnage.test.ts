/**
 * TCK-2495 — aucun bien dans deux rangées de l'accueil, et la rangée VEDETTE ne perd jamais une carte :
 * l'API y compte une impression par bien servi (ADR-0061 §10).
 */
import { describe, it, expect } from 'vitest';

import { rangeesSansDoublon } from '@/lib/rangees-de-l-accueil';

const biens = (...ids: number[]) => ids.map((id) => ({ id }));
const ids = (liste: readonly { id: number }[]) => liste.map((b) => b.id);

describe('rangeesSansDoublon', () => {
  it('la vedette garde tous ses biens ; la rangée locale, puis les nouveautés, perdent les leurs', () => {
    const r = rangeesSansDoublon({
      near: biens(1, 2, 3),
      featured: biens(2, 4),
      latest: biens(3, 4, 5),
    });
    expect(ids(r.featured)).toEqual([2, 4]);
    expect(ids(r.near)).toEqual([1, 3]);
    expect(ids(r.latest)).toEqual([5]);
  });

  it('aucun identifiant n’apparaît deux fois dans la page, même répété dans une seule rangée', () => {
    const r = rangeesSansDoublon({ near: biens(7, 7, 8), featured: biens(8, 9), latest: biens(9, 7, 10) });
    const tous = [...ids(r.near), ...ids(r.featured), ...ids(r.latest)];
    expect(new Set(tous).size).toBe(tous.length);
    expect(ids(r.featured)).toEqual([8, 9]);
  });

  it('l’ordre de chaque rangée est conservé', () => {
    const r = rangeesSansDoublon({ near: biens(30, 10, 20), featured: [], latest: biens(5, 4) });
    expect(ids(r.near)).toEqual([30, 10, 20]);
    expect(ids(r.latest)).toEqual([5, 4]);
  });
});
