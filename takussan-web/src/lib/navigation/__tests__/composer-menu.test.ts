import { describe, expect, it } from 'vitest';
import { USER_ROLES, type UserRole } from '@/types/user';
import { CATALOGUE, estOuverte, type IdDestination } from '../catalogue';
import { avecTitres, cheminOuvert, composerMenu, entreesDuMenu } from '../composer-menu';
import { DISPOSITIONS, type Disposition } from '../dispositions';
import { destinationsMasquees, PERSONAS_DU_PERSONNEL } from '../modules';
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
    const disposition: Disposition = { action: [], groupes: [{ id: 'tete', titre: null, entrees: ['tableau-de-bord'] }], plus: [], priorites: [], onglets: [] };
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
    const disposition: Disposition = { action: [], groupes: [{ id: 'tete', titre: null, entrees: ['disparue' as IdDestination] }], plus: [], priorites: [], onglets: [] };
    expect(() => composerMenu({ roles: ['customer'], capacites: null }, 'client', disposition)).not.toThrow();
  });
});

describe('TCK-2483 — les modules masqués par l’agence', () => {
  const TOUS = ['commissions', 'inventories', 'provider_book', 'calendar', 'credits', 'analytics'];
  const ids = (menu: ReturnType<typeof composerMenu>) => [
    ...entreesDuMenu(menu).map((e) => e.id),
    ...(menu.action ? [menu.action.id] : []),
    ...(menu.carte ? [menu.carte.id] : []),
  ];
  const groupe = (menu: ReturnType<typeof composerMenu>, id: string) =>
    menu.groupes.find((g) => g.id === id)?.entrees.map((e) => e.id) ?? [];

  it('AC3 — l’agent ne voit plus ce que l’agence masque — ni groupe, ni « Plus », ni « Aussi »', () => {
    const ctx: ContexteDeMenu = {
      roles: ['customer', 'agent', 'agency_admin'],
      capacites: ['properties.create'],
      cheminsAdmin: [],
      masquees: destinationsMasquees(['commissions', 'inventories', 'analytics']),
    };
    const sans = ids(composerMenu({ ...ctx, masquees: undefined }, 'agent'));
    const rendus = ids(composerMenu(ctx, 'agent'));
    for (const id of ['commissions', 'etats-des-lieux'] as const) {
      expect(sans, `témoin : ${id} est rendu sans masque`).toContain(id);
      expect(rendus, id).not.toContain(id);
    }
    expect(rendus).toContain('calendrier');
    // TCK-2628 — `analytics` ne retire plus d'entrée : Exports, Alertes et Indicateurs sont des onglets de
    // « Rapports », que le module retire de la barre d'onglets. « Rapports » reste (la vue d'ensemble).
    expect(rendus).toContain('rapports');
  });

  it('l’admin aussi : il voit le menu de son équipe', () => {
    const ctx: ContexteDeMenu = { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: [], masquees: destinationsMasquees(['credits']) };
    expect(ids(composerMenu({ ...ctx, masquees: undefined }, 'admin-agence'))).toContain('credits');
    expect(ids(composerMenu(ctx, 'admin-agence'))).not.toContain('credits');
  });

  it.each([
    ['bailleur', ['customer', 'owner'], 'mon-patrimoine'],
    ['locataire', ['customer', 'tenant'], 'mon-logement'],
  ] as const)('AC4 — %s garde ses états des lieux dans « %s »', (persona, roles, idGroupe) => {
    const ctx: ContexteDeMenu = { roles: [...roles], capacites: [], cheminsAdmin: [], masquees: destinationsMasquees(['inventories']) };
    expect(groupe(composerMenu(ctx, persona), idGroupe)).toContain('etats-des-lieux');
  });

  it('AC4 — le bailleur qui est aussi admin : « Aussi administrateur » perd les modules masqués, pas le reste', () => {
    const ctx: ContexteDeMenu = {
      roles: ['customer', 'agency_admin', 'owner'],
      capacites: ['properties.create'],
      cheminsAdmin: [],
      masquees: destinationsMasquees(['commissions', 'credits']),
    };
    expect(groupe(composerMenu({ ...ctx, masquees: undefined }, 'bailleur'), 'aussi'), 'témoin').toEqual(
      expect.arrayContaining(['commissions', 'credits']),
    );
    const aussi = groupe(composerMenu(ctx, 'bailleur'), 'aussi');
    expect(aussi).not.toContain('commissions');
    expect(aussi).not.toContain('credits');
    // TCK-2628 — « Vue agence » est devenue « Rapports », que le bailleur porte déjà dans sa disposition.
    expect(aussi).toContain('proprietaires');
  });

  it('une épingle (TCK-2480) vers une destination masquée est ignorée au rendu', () => {
    const ctx: ContexteDeMenu = { roles: ['customer', 'agent'], capacites: ['properties.create'], cheminsAdmin: [], masquees: destinationsMasquees(['commissions']) };
    const menu = composerMenu(ctx, 'agent', undefined, { epingles: ['commissions', 'baux'] });
    expect(menu.epingles).toEqual(['baux']);
    expect(ids(menu)).not.toContain('commissions');
  });

  it('les groupes de la disposition (source des onglets, TCK-2481) perdent aussi la destination masquée', () => {
    const ctx: ContexteDeMenu = { roles: ['customer', 'agent'], capacites: ['properties.create'], cheminsAdmin: [], masquees: destinationsMasquees(['calendar']) };
    expect(composerMenu(ctx, 'agent').groupes.flatMap((g) => g.entrees.map((e) => e.id))).not.toContain('calendrier');
  });

  // Amendement §6 — la page masquée reste servie : « Démarrer » (`cheminOuvert`) mime les gardes des
  // PAGES, qui ne lisent pas `hidden_modules`.
  it('cheminOuvert ignore le masque : la page reste servie', () => {
    const ctx: ContexteDeMenu = { roles: ['customer', 'agent'], capacites: ['properties.create'], cheminsAdmin: [], masquees: destinationsMasquees(TOUS) };
    expect(cheminOuvert(ctx, '/app/commissions')).toBe(true);
    expect(cheminOuvert(ctx, '/app/calendar')).toBe(true);
  });

  // AC5 — l'invariant « rien n'est perdu », tous modules masqués : ce que la règle de l'amendement
  // ouvre, ni plus ni moins. Le persona non-personnel se juge SANS masque ; l'espace, AVEC.
  it.each(PERSONAS)('AC5 — %s : rien n’est perdu, tous modules masqués', (persona) => {
    const masquees = destinationsMasquees(TOUS);
    for (const base of contextes()) {
      const ctx: ContexteDeMenu = { ...base, masquees };
      const menu = composerMenu(ctx, persona);
      const ctxPersona: ContexteDeMenu = {
        ...ctx,
        roles: rolesDuPersona(ctx.roles, persona),
        rolesDeLEspace: ctx.roles,
        masquees: PERSONAS_DU_PERSONNEL.has(persona) ? masquees : new Set(),
      };
      const rendus = new Set([...entreesDuMenu(menu).map((e) => e.href), ...(menu.carte ? [menu.carte.href] : [])]);
      if (menu.action) rendus.add(menu.action.href);
      const attendus = new Set(
        CATALOGUE.filter((d) => estOuverte(d, ctx) || estOuverte(d, d.surLEspace ? ctx : ctxPersona)).map((d) => d.href),
      );
      expect(rendus, `${persona} / ${ctx.roles.join('+')}`).toEqual(attendus);
    }
  });

  it('PERSONAS_DU_PERSONNEL : l’agent et l’admin d’agence, et eux seuls', () => {
    expect([...PERSONAS_DU_PERSONNEL].sort()).toEqual(['admin-agence', 'agent']);
  });
});
