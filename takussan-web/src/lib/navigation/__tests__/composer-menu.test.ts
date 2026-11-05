import { describe, expect, it } from 'vitest';
import { USER_ROLES, type UserRole } from '@/types/user';
import { CATALOGUE, type IdDestination } from '../catalogue';
import { composerMenu, menuDuPersona } from '../composer-menu';
import { DISPOSITIONS, type Disposition } from '../dispositions';
import { PERSONAS } from '../personas';
import type { ContexteDeMenu } from '../types';

const IDS = new Set<string>(CATALOGUE.map((d) => d.id));

function contextes(): ContexteDeMenu[] {
  const sortie: ContexteDeMenu[] = [];
  for (let masque = 0; masque < 1 << USER_ROLES.length; masque++) {
    const roles = USER_ROLES.filter((_, i) => masque & (1 << i)) as UserRole[];
    for (const capacites of [null, ['properties.create']]) sortie.push({ roles, capacites });
  }
  return sortie;
}

describe('TCK-2477 — les dispositions', () => {
  it.each(PERSONAS)('%s : tout identifiant cité existe au catalogue', (persona) => {
    for (const groupe of DISPOSITIONS[persona].groupes) {
      for (const id of groupe.entrees) expect(IDS.has(id), `${persona} — ${id}`).toBe(true);
    }
  });

  // Propre au LOT 1 (miroir du menu de dev) : rien ne tombe sous « Plus ». TCK-2478 retire ce test.
  it.each(PERSONAS)('%s : le miroir place chaque destination du catalogue', (persona) => {
    const places = new Set(DISPOSITIONS[persona].groupes.flatMap((g) => g.entrees));
    expect([...IDS].filter((id) => !places.has(id as IdDestination))).toEqual([]);
  });
});

describe('TCK-2477 — composerMenu (ADR-0089 §4)', () => {
  it.each(PERSONAS)('%s : aucune destination accessible n’est perdue, aucune n’est doublée', (persona) => {
    for (const ctx of contextes()) {
      const rendus = menuDuPersona(ctx, persona).map((e) => e.href);
      const attendus = new Set(CATALOGUE.filter((d) => d.accessible(ctx)).map((d) => d.href));
      expect(new Set(rendus), `${persona} / ${ctx.roles.join('+')}`).toEqual(attendus);
      expect(rendus).toHaveLength(attendus.size);
    }
  });

  it('une destination accessible que la disposition ne place pas tombe sous « Plus »', () => {
    const disposition: Disposition = { groupes: [{ id: 'primary', entrees: ['tableau-de-bord'] }] };
    const menu = composerMenu({ roles: ['customer'], capacites: null }, disposition);
    expect(menu[0]).toMatchObject({ href: '/app', section: 'primary' });
    expect(menu.find((e) => e.href === '/app/messages')?.section).toBe('plus');
  });

  it('un identifiant inconnu est ignoré', () => {
    const disposition: Disposition = {
      groupes: [{ id: 'primary', entrees: ['tableau-de-bord', 'disparue' as IdDestination] }],
    };
    expect(() => composerMenu({ roles: ['customer'], capacites: null }, disposition)).not.toThrow();
  });

  it('une destination inaccessible n’est jamais rendue', () => {
    const menu = menuDuPersona({ roles: ['customer'], capacites: null }, 'client');
    expect(menu.map((e) => e.href)).not.toContain('/app/commissions');
  });

  it('le libellé et la mise en avant suivent le compte (« Proposer » chez le bailleur)', () => {
    const menu = menuDuPersona({ roles: ['customer', 'owner'], capacites: null }, 'bailleur');
    expect(menu.find((e) => e.href === '/app/properties/new')).toMatchObject({
      labelKey: 'proposeProperty',
      emphasized: true,
    });
  });
});
