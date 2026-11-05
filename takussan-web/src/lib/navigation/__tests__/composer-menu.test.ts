import { describe, expect, it } from 'vitest';
import { USER_ROLES, type UserRole } from '@/types/user';
import { CATALOGUE, estOuverte, type IdDestination } from '../catalogue';
import { avecTitres, composerMenu, entreesDuMenu } from '../composer-menu';
import { DISPOSITIONS, type Disposition } from '../dispositions';
import { PERSONAS, rolesDuPersona } from '../personas';
import type { ContexteDeMenu } from '../types';

const IDS = new Set<string>(CATALOGUE.map((d) => d.id));

function contextes(): ContexteDeMenu[] {
  const sortie: ContexteDeMenu[] = [];
  for (let masque = 0; masque < 1 << USER_ROLES.length; masque++) {
    const roles = USER_ROLES.filter((_, i) => masque & (1 << i)) as UserRole[];
    for (const capacites of [null, ['properties.create']]) sortie.push({ roles, capacites, cheminsAdmin: [] });
  }
  return sortie;
}

describe('TCK-2478 — les dispositions', () => {
  it.each(PERSONAS)('%s : tout identifiant cité existe au catalogue', (persona) => {
    const d = DISPOSITIONS[persona];
    const cites = [...d.action, ...(d.carte ? [d.carte] : []), ...d.plus, ...d.groupes.flatMap((g) => g.entrees)];
    for (const id of cites) expect(IDS.has(id), `${persona} — ${id}`).toBe(true);
  });

  it.each(PERSONAS)('%s : aucun identifiant n’est cité deux fois dans les groupes et « Plus »', (persona) => {
    const d = DISPOSITIONS[persona];
    const cites = [...d.plus, ...d.groupes.flatMap((g) => g.entrees)];
    expect(new Set(cites).size).toBe(cites.length);
  });
});

describe('TCK-2478 — composerMenu (ADR-0089 §4)', () => {
  // ADR-0089 §2, §4 — ce que le persona ouvre (jugé sur SES rôles), plus ce que seul un autre profil
  // de l'espace ouvre (le complément). Pas l'union seule : `isCustomerOnly` n'est pas monotone.
  // Revue de TCK-2478 (I2) — sauf les destinations `surLEspace` (créer un bien), jugées sur l'union
  // des deux côtés, comme leur page : le bailleur d'un espace admin+bailleur, capacités non lues, ne
  // « propose » plus (la page, sur l'union, publierait une fois les capacités lues).
  it.each(PERSONAS)('%s : rien n’est perdu — persona d’un côté, complément de l’autre', (persona) => {
    for (const ctx of contextes()) {
      const menu = composerMenu(ctx, persona);
      const ctxPersona = { ...ctx, roles: rolesDuPersona(ctx.roles, persona), rolesDeLEspace: ctx.roles };
      const rendus = new Set([...entreesDuMenu(menu).map((e) => e.href), ...(menu.carte ? [menu.carte.href] : [])]);
      const attendus = new Set(
        CATALOGUE.filter((d) => estOuverte(d, ctx) || estOuverte(d, d.surLEspace ? ctx : ctxPersona)).map((d) => d.href),
      );
      // L'action seule peut porter un href que rien d'autre ne porte (« Proposer un bien »).
      if (menu.action) rendus.add(menu.action.href);
      expect(rendus, `${persona} / ${ctx.roles.join('+')}`).toEqual(attendus);
    }
  });

  it('une destination ouverte que la disposition ne place pas tombe sous « Plus », replié', () => {
    const disposition: Disposition = { action: [], groupes: [{ id: 'tete', titre: null, entrees: ['tableau-de-bord'] }], plus: [], priorites: [] };
    const menu = composerMenu({ roles: ['customer'], capacites: null }, 'client', disposition);
    const plus = menu.groupes.find((g) => g.id === 'plus');
    expect(plus?.replie).toBe(true);
    expect(plus?.entrees.map((e) => e.href)).toContain('/app/messages');
  });

  it('le complément « Aussi bailleur » ne porte que ce que seul le profil bailleur ouvre', () => {
    const ctx: ContexteDeMenu = { roles: ['customer', 'agency_admin', 'owner'], capacites: ['properties.create'], cheminsAdmin: [] };
    const aussi = composerMenu(ctx, 'admin-agence').groupes.find((g) => g.id === 'aussi');
    expect(aussi).toMatchObject({ titre: 'aussi', titreValeurs: { profil: 'owner' }, replie: true });
    const attendus = CATALOGUE.filter(
      (d) => estOuverte(d, ctx) && !estOuverte(d, { ...ctx, roles: rolesDuPersona(ctx.roles, 'admin-agence') }),
    ).map((d) => d.id);
    expect(aussi?.entrees.map((e) => e.id)).toEqual(attendus);
    expect(attendus).toContain('paiements');
  });

  /**
   * Revue de TCK-2478 (I1) — `cheminsAdmin` est calculé sur l'union de l'espace : seul, il rangeait
   * les pages d'agence sous « Plus » du persona non admin, et le reste de l'admin sous « Aussi ».
   */
  describe('les pages d’agence reviennent au profil d’admin (revue, I1)', () => {
    const PAGES = CATALOGUE.filter((d) => d.href.startsWith('/app/agency')).map((d) => d.href);
    const groupe = (menu: ReturnType<typeof composerMenu>, id: string) =>
      menu.groupes.find((g) => g.id === id)?.entrees.map((e) => e.href) ?? [];

    it.each([
      ['bailleur', ['customer', 'agency_admin', 'owner']],
      ['agent', ['customer', 'agency_admin', 'agent']],
    ] as const)('persona %s d’un espace où il est aussi admin : les 10 pages sous « Aussi », aucune sous « Plus »', (persona, roles) => {
      const menu = composerMenu({ roles: [...roles], capacites: ['properties.create'], cheminsAdmin: PAGES }, persona);
      expect(PAGES).toHaveLength(10);
      expect(groupe(menu, 'aussi').filter((h) => h.startsWith('/app/agency'))).toEqual(PAGES);
      expect(entreesDuMenu(menu).filter((e) => e.groupe !== 'aussi' && e.href.startsWith('/app/agency'))).toEqual([]);
    });

    // TCK-1412 — sans profil d'admin dans l'espace, seule SA délégation ouvre la page : elle reste au persona.
    it('l’agent délégué (aucun admin dans l’espace) garde « Équipe » au menu', () => {
      const menu = composerMenu({ roles: ['customer', 'agent'], capacites: ['team.invite'], cheminsAdmin: ['/app/agency/team'] }, 'agent');
      expect(groupe(menu, 'plus')).toContain('/app/agency/team');
      expect(groupe(menu, 'aussi')).toEqual([]);
    });
  });

  /**
   * Revue de TCK-2478 (I2) — `/app/properties/new` choisit son mode sur l'UNION (`modeDeCreationDeBien`) :
   * jugée sur le persona, l'action disait « Proposer » à un bailleur que la page laissait publier, et
   * « Publier un bien » revenait sous « Aussi administrateur » vers la même URL.
   */
  describe('créer un bien se juge sur l’espace, comme la page (revue, I2)', () => {
    const NOUVEAU = '/app/properties/new';

    it('admin + bailleur, profil actif bailleur : « Publier un bien », et aucune autre entrée vers la page', () => {
      const menu = composerMenu({ roles: ['customer', 'agency_admin', 'owner'], capacites: ['properties.create'], cheminsAdmin: [] }, 'bailleur');
      expect([menu.action?.id, menu.action?.labelKey]).toEqual(['publier-bien', 'publishProperty']);
      expect(entreesDuMenu(menu).filter((e) => e.href === NOUVEAU)).toEqual([]);
    });

    it('le bailleur seul propose toujours', () => {
      const menu = composerMenu({ roles: ['customer', 'owner'], capacites: null }, 'bailleur');
      expect(menu.action?.id).toBe('proposer-bien');
    });

    it.each(PERSONAS)('%s : aucune destination de création dans « Aussi … »', (persona) => {
      for (const ctx of contextes()) {
        const aussi = composerMenu(ctx, persona).groupes.find((g) => g.id === 'aussi');
        expect(aussi?.entrees.filter((e) => e.href === NOUVEAU) ?? [], `${persona} / ${ctx.roles.join('+')}`).toEqual([]);
      }
    });
  });

  it('espace suspendu : ni action principale ni entrée d’écriture', () => {
    const ctx: ContexteDeMenu = { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: [], agenceSuspendue: true };
    const menu = composerMenu(ctx, 'admin-agence');
    expect(menu.action).toBeNull();
    expect(entreesDuMenu(menu).map((e) => e.id)).not.toContain('publier-bien');
  });

  // Revue de TCK-2478 (I3) — le layout lit désormais la suspension pour le bailleur aussi.
  it('espace suspendu, bailleur : pas de « Proposer un bien »', () => {
    const menu = composerMenu({ roles: ['customer', 'owner'], capacites: null, agenceSuspendue: true }, 'bailleur');
    expect(menu.action).toBeNull();
    expect(composerMenu({ roles: ['customer', 'owner'], capacites: null }, 'bailleur').action?.id).toBe('proposer-bien');
  });

  it('l’action principale prend la première destination ouverte de sa liste', () => {
    const menu = composerMenu({ roles: ['customer', 'agent'], capacites: [] }, 'agent');
    expect(menu.action).toBeNull(); // ni « Publier » (sans properties.create) ni « Proposer » (pas bailleur)
  });

  it('les titres ne paraissent que si un groupe titré porte deux entrées ou plus (TCK-377)', () => {
    const g = (id: string, titre: string | null, n: number) => ({ id, titre, replie: false, entrees: Array.from({ length: n }) as never[] });
    expect(avecTitres([g('tete', null, 4)])).toBe(false);
    expect(avecTitres([g('tete', null, 4), g('activite', 'activite', 1)])).toBe(false);
    expect(avecTitres([g('tete', null, 2), g('activite', 'activite', 2)])).toBe(true);
  });

  it('« Plus » et « Aussi … » sont des divulgations : ils ne font paraître aucun titre (TCK-2478, AC5)', () => {
    const g = (id: string, titre: string | null, n: number) => ({ id, titre, replie: true, entrees: Array.from({ length: n }) as never[] });
    // Le vrai prestataire : une tête sans titre de 4 entrées, et un « Plus » de 6 (plancher `customer`).
    expect(avecTitres([g('tete', null, 4), g('plus', 'plus', 6)])).toBe(false);
    expect(avecTitres([g('tete', null, 4), g('plus', 'plus', 6), g('aussi', 'aussi', 3)])).toBe(false);
    // Une vraie section titrée garde ses titres, « Plus » ou non.
    expect(avecTitres([g('tete', null, 2), g('activite', 'activite', 2), g('plus', 'plus', 2)])).toBe(true);
  });

  it('le prestataire réel n’a aucun titre de section (AC5)', () => {
    const menu = composerMenu({ roles: ['customer', 'service_provider'], capacites: [] }, 'prestataire');
    expect(menu.action).toBeNull();
    expect(avecTitres(menu.groupes)).toBe(false);
  });

  it('un identifiant inconnu est ignoré', () => {
    const disposition: Disposition = { action: [], groupes: [{ id: 'tete', titre: null, entrees: ['disparue' as IdDestination] }], plus: [], priorites: [] };
    expect(() => composerMenu({ roles: ['customer'], capacites: null }, 'client', disposition)).not.toThrow();
  });
});
