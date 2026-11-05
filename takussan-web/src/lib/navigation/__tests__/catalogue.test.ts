import { describe, expect, it } from 'vitest';
import { USER_ROLES, type UserRole } from '@/types/user';
import { CATALOGUE } from '../catalogue';
import type { ContexteDeMenu } from '../types';

/** Tous les sous-ensembles de rôles, chacun sous trois états des capacités. */
function contextes(): ContexteDeMenu[] {
  const sortie: ContexteDeMenu[] = [];
  for (let masque = 0; masque < 1 << USER_ROLES.length; masque++) {
    const roles = USER_ROLES.filter((_, i) => masque & (1 << i)) as UserRole[];
    for (const capacites of [null, [], ['properties.create']]) sortie.push({ roles, capacites });
  }
  return sortie;
}

describe('TCK-2477 — le catalogue des destinations', () => {
  it('chaque identifiant est unique', () => {
    const ids = CATALOGUE.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('compte les 29 destinations du menu de dev 0b7deae44', () => {
    expect(CATALOGUE).toHaveLength(29);
  });

  it('deux destinations d’un même href ne sont jamais accessibles ensemble', () => {
    for (const ctx of contextes()) {
      const hrefs = CATALOGUE.filter((d) => d.accessible(ctx)).map((d) => d.href);
      expect(new Set(hrefs).size, `${ctx.roles.join('+')} / ${JSON.stringify(ctx.capacites)}`).toBe(hrefs.length);
    }
  });

  it('le socle — tableau de bord, messagerie, documents — est ouvert à tout compte', () => {
    for (const id of ['tableau-de-bord', 'messagerie', 'documents']) {
      const d = CATALOGUE.find((x) => x.id === id);
      expect(d?.accessible({ roles: [], capacites: null }), id).toBe(true);
    }
  });
});
