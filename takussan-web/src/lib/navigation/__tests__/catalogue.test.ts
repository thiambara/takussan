import { describe, expect, it } from 'vitest';
import { USER_ROLES, type UserRole } from '@/types/user';
import { PAGES_ADMIN } from '@/lib/access/pages-admin';
import { CATALOGUE, estOuverte } from '../catalogue';
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

  it('compte les 41 destinations (les 29 de dev 0b7deae44, « Mes tâches », « Chercher un bien », 10 pages d’agence)', () => {
    expect(CATALOGUE).toHaveLength(41);
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

describe('TCK-2478 — les pages d’agence entrent au catalogue, jugées par la table', () => {
  it('chaque page de PAGES_ADMIN qui a une place au menu a sa destination', () => {
    const hrefs = new Set(CATALOGUE.map((d) => d.href));
    const manquantes = PAGES_ADMIN.filter((p) => p.menu !== null && !hrefs.has(p.chemin)).map((p) => p.chemin);
    expect(manquantes).toEqual([]);
  });

  it('une page d’agence n’est ouverte que si `cheminsAdmin` la contient', () => {
    const equipe = CATALOGUE.find((d) => d.href === '/app/agency/team')!;
    expect(estOuverte(equipe, { roles: ['agency_admin'], capacites: [], cheminsAdmin: [] })).toBe(false);
    expect(estOuverte(equipe, { roles: ['agency_admin'], capacites: [], cheminsAdmin: ['/app/agency/team'] })).toBe(true);
  });

  it('espace suspendu : aucune entrée d’écriture', () => {
    const ctx = { roles: ['agency_admin'] as UserRole[], capacites: ['properties.create'], agenceSuspendue: true };
    expect(CATALOGUE.filter((d) => estOuverte(d, ctx)).map((d) => d.id)).not.toContain('publier-bien');
    expect(CATALOGUE.filter((d) => estOuverte(d, { ...ctx, agenceSuspendue: false })).map((d) => d.id)).toContain('publier-bien');
  });
});
