import { describe, expect, it } from 'vitest';
import { USER_ROLES, type UserRole } from '@/types/user';
import { PAGES_ADMIN } from '@/lib/access/pages-admin';
import { CATALOGUE, estOuverte } from '../catalogue';
import { composerMenu, entreesDuMenu } from '../composer-menu';
import type { Persona } from '../personas';
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

/**
 * TCK-649 (ADR-0064 §2) — repris d'`AppSidebar.acces-admin.test.tsx` (supprimé par TCK-2478 avec
 * `avecSectionAgence`) : une entrée par page À MENU que le profil peut ouvrir, rien d'autre, rien
 * sinon. Sa propriété d'ORDRE (« après les entrées de travail ») n'est plus une règle : la
 * disposition du persona place les pages d'agence (`dispositions-validees.test.ts`, groupes
 * « Finances », « Agence », « Mon espace »).
 */
describe('TCK-2478 — la section d’agence se dérive toujours de la table (ex-`avecSectionAgence`)', () => {
  const PAGES_D_AGENCE = CATALOGUE.filter((d) => d.href.startsWith('/app/agency'));

  it('chaque page à menu porte le libellé et l’icône de la table, sous `nav.admin`', () => {
    for (const page of PAGES_ADMIN.filter((p) => p.menu !== null)) {
      const d = CATALOGUE.find((x) => x.href === page.chemin);
      expect([d?.cle, d?.icone, d?.espace], page.chemin).toEqual([page.menu!.cle, page.menu!.icone, 'nav.admin']);
    }
  });

  it('une page sans entrée de menu (le rapprochement) n’en reçoit pas, même accessible', () => {
    const sansMenu = PAGES_ADMIN.filter((p) => p.menu === null).map((p) => p.chemin as string);
    expect(sansMenu).toContain('/app/agency/finances/reconciliation');
    const ctx: ContexteDeMenu = { roles: ['agency_admin'], capacites: [], cheminsAdmin: sansMenu };
    // Ouvertes au profil par la table, et pourtant aucune destination d'agence ne s'allume.
    expect(CATALOGUE.filter((d) => estOuverte(d, ctx) && d.href.startsWith('/app/agency'))).toEqual([]);
    expect(PAGES_D_AGENCE.filter((d) => sansMenu.includes(d.href))).toEqual([]);
  });

  it('aucune page accessible : aucune page d’agence au menu, quel que soit le rôle — la table décide', () => {
    const comptes: [Persona, UserRole[]][] = [
      ['admin-agence', ['customer', 'agency_admin']],
      ['plateforme', ['customer', 'super_admin']],
      ['agent', ['customer', 'agent']],
      ['bailleur', ['customer', 'owner']],
    ];
    for (const [persona, roles] of comptes) {
      const menu = composerMenu({ roles, capacites: ['properties.create'], cheminsAdmin: [] }, persona);
      const hrefs = [...entreesDuMenu(menu), ...(menu.action ? [menu.action] : [])].map((e) => e.href);
      expect(hrefs.filter((h) => h.startsWith('/app/agency')), persona).toEqual([]);
    }
  });

  it('seules les deux files de modération portent un compteur', () => {
    expect(PAGES_D_AGENCE.filter((d) => 'compteur' in d).map((d) => [d.href, (d as { compteur?: string }).compteur])).toEqual([
      ['/app/agency/moderation', 'reviewModeration'],
      ['/app/agency/moderation/properties', 'propertyModeration'],
    ]);
  });
});

/**
 * TCK-587 (ADR-0031 §3) — repris d'`AppSidebar.proposition.test.ts` (supprimé par TCK-2478 avec
 * `buildNavItems`), mêmes comptes, mêmes attentes : le bailleur hors personnel PROPOSE un bien à son
 * agence ; il ne le publie pas. Même route (`/app/properties/new`), autre promesse : le serveur
 * impose brouillon + privé et prévient les admins. L'hôte d'une agence individuelle en est
 * l'administrateur et garde « Publier un bien ».
 *
 * L'entrée de création est désormais l'ACTION PRINCIPALE du persona (`composer-menu.ts`) ; le
 * catalogue reste son seul juge : on lit ici la destination OUVERTE de cet `href`.
 */
function entreeDeCreation(roles: UserRole[], capacites: readonly string[] | null = ['properties.create']) {
  return CATALOGUE.find((d) => d.href === '/app/properties/new' && estOuverte(d, { roles, capacites }));
}

describe('proposer plutôt que publier (TCK-587) — jugé par le catalogue', () => {
  it('le bailleur seul reçoit « Proposer un bien à mon agence »', () => {
    expect(entreeDeCreation(['owner', 'customer'])?.cle).toBe('proposeProperty');
  });

  it.each([
    [['agent', 'customer']],
    [['agency_admin', 'customer']],
    [['owner', 'agent', 'customer']],
  ] as UserRole[][][])('le personnel %j garde « Publier un bien »', (roles) => {
    expect(entreeDeCreation(roles)?.cle).toBe('publishProperty');
  });

  it('un client sans profil n’a aucune entrée de création', () => {
    expect(entreeDeCreation(['customer'])).toBeUndefined();
  });

  // P152.03 — le personnel se juge par `properties.create`, comme `PropertyPolicy::create`.
  it('un agent sans properties.create n’a aucune entrée de création', () => {
    expect(entreeDeCreation(['agent', 'customer'], ['team.invite'])).toBeUndefined();
  });

  it('un agent aussi bailleur, sans properties.create, « Propose », comme createsProposal', () => {
    expect(entreeDeCreation(['owner', 'agent', 'customer'], ['crm.view_all'])?.cle).toBe('proposeProperty');
  });

  it('tant que les capacités ne sont pas lues, le personnel n’a aucune entrée', () => {
    expect(entreeDeCreation(['agent', 'customer'], null)).toBeUndefined();
    expect(entreeDeCreation(['owner', 'agent', 'customer'], null)).toBeUndefined();
  });

  it('le bailleur hors personnel propose sans lecture des capacités', () => {
    expect(entreeDeCreation(['owner', 'customer'], null)?.cle).toBe('proposeProperty');
  });

  it('le super-admin publie sans lecture des capacités', () => {
    expect(entreeDeCreation(['super_admin', 'customer'], [])?.cle).toBe('publishProperty');
  });
});
