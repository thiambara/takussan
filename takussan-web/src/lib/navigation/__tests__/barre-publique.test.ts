import { describe, expect, it } from 'vitest';
import {
  casesDuPersona,
  estPageDeDecouverte,
  estPageDeLien,
  estSurLeSitePublic,
  hrefDuCompte,
  libellePublic,
  lignesDeMonEspace,
  porteLaBarrePublique,
  sectionsDeMoi,
} from '../barre-publique';
import { isProRouteLocked } from '@/lib/access/pro-features';
import type { User } from '@/types/user';
import { composerMenu } from '../composer-menu';
import { DISPOSITIONS } from '../dispositions';
import type { Persona } from '../personas';
import type { ContexteDeMenu } from '../types';

/**
 * TCK-2493 / TCK-2494 (ADR-0091) — la navigation du site public, lue dans le menu COMPOSÉ du persona
 * (`composerMenu`, la fonction de `/app`), jamais dans une liste à part.
 *
 * Les comptes sont recopiés d'`onglets.test.ts` (pas importés : deux tests qui partagent leurs
 * données se valident l'un l'autre). Les attentes sont la TABLE d'ADR-0091 §2, recopiée.
 */
const TOUTES_LES_PAGES_D_AGENCE = [
  '/app/agency/team', '/app/agency/roles', '/app/agency', '/app/agency/kyc', '/app/agency/billing',
  '/app/agency/finances', '/app/agency/moderation', '/app/agency/moderation/properties',
  '/app/agency/audit', '/app/agency/integrations',
];
const PAGES_DE_L_HOTE = ['/app/agency', '/app/agency/kyc', '/app/agency/billing', '/app/agency/finances', '/app/agency/integrations'];

const COMPTES: Record<Exclude<Persona, 'plateforme'>, ContexteDeMenu> = {
  client: { roles: ['customer'], capacites: null },
  locataire: { roles: ['customer', 'tenant'], capacites: null },
  bailleur: { roles: ['customer', 'owner'], capacites: null },
  agent: { roles: ['customer', 'agent'], capacites: ['properties.create'] },
  'admin-agence': { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: TOUTES_LES_PAGES_D_AGENCE },
  hote: { roles: ['customer', 'agency_admin', 'owner'], capacites: ['properties.create'], cheminsAdmin: PAGES_DE_L_HOTE },
  prestataire: { roles: ['customer', 'service_provider'], capacites: [] },
};

const groupesDe = (persona: keyof typeof COMPTES, ctx: ContexteDeMenu = COMPTES[persona]) => composerMenu(ctx, persona).groupes;
const ids = (entrees: readonly { readonly id: string }[]) => entrees.map((e) => e.id);

describe('ADR-0091 §2 — les cases 2 et 3 de chaque persona (la table de l’ADR)', () => {
  it.each([
    ['client', ['favoris', 'visites']], // Favoris · Visites
    ['locataire', ['paiements', 'maintenance']], // Loyer · Interventions
    ['bailleur', ['mes-biens', 'demandes']], // Mes biens · Demandes
    ['agent', ['demandes', 'visites']], // Demandes · Visites
    ['admin-agence', ['demandes', 'mes-biens']], // Demandes · Biens
    ['hote', ['mes-biens', 'reservations']], // Mes biens · Réservations
    ['prestataire', ['maintenance', 'documents']], // Interventions · Documents
  ] as const)('%s : %j', (persona, attendu) => {
    expect(ids(casesDuPersona(groupesDe(persona), persona))).toEqual(attendu);
  });

  it('jamais le tableau de bord ni la messagerie (case 4) ni la recherche (case 1, Explorer)', () => {
    for (const persona of Object.keys(COMPTES) as (keyof typeof COMPTES)[]) {
      const cases = ids(casesDuPersona(groupesDe(persona), persona));
      expect(cases).toHaveLength(2);
      for (const fixe of ['tableau-de-bord', 'messagerie', 'chercher-bien']) expect(cases, persona).not.toContain(fixe);
    }
  });

  it('une case que le persona n’ouvre pas cède sa place à la destination suivante — jamais un cadenas', () => {
    // Un agent sans visites déclarées ouvrables : la disposition le laisse dans le menu, mais on retire
    // `visites` des onglets déclarés pour simuler une case fermée — la suivante de la disposition vient.
    const persona = 'agent';
    const sansVisites = composerMenu(COMPTES.agent, persona).groupes.map((g) => ({
      ...g,
      entrees: g.entrees.filter((e) => e.id !== 'visites'),
    }));
    const cases = ids(casesDuPersona(sansVisites, persona));
    expect(cases).toHaveLength(2);
    expect(cases[0]).toBe('demandes');
    expect(cases).not.toContain('visites');
    expect(DISPOSITIONS.agent.casesPubliques).toContain('visites');
  });

  it('TCK-2618 — les onglets de `/app` changent, les cases publiques de l’agent, de l’admin et du bailleur non', () => {
    // Prémisse : leurs onglets de `/app` ne portent plus les cases publiques validées (TCK-2493).
    expect(DISPOSITIONS.agent.onglets).not.toContain('visites');
    expect(DISPOSITIONS['admin-agence'].onglets).not.toContain('demandes');
    expect(DISPOSITIONS.bailleur.onglets).not.toContain('demandes');
    expect(ids(casesDuPersona(groupesDe('agent'), 'agent'))).toEqual(['demandes', 'visites']);
    expect(ids(casesDuPersona(groupesDe('admin-agence'), 'admin-agence'))).toEqual(['demandes', 'mes-biens']);
    expect(ids(casesDuPersona(groupesDe('bailleur'), 'bailleur'))).toEqual(['mes-biens', 'demandes']);
  });
});

describe('TCK-2494 — les lignes du menu « Mon espace » (AC2)', () => {
  it('locataire : Loyer, Interventions, Mon bail, Documents, puis Messages', () => {
    const { lignes, messagerie } = lignesDeMonEspace(groupesDe('locataire'), 'locataire');
    expect(ids(lignes).slice(0, 2)).toEqual(['paiements', 'maintenance']);
    expect(ids(lignes)).toEqual(expect.arrayContaining(['paiements', 'maintenance', 'baux', 'documents']));
    expect(messagerie?.id).toBe('messagerie');
  });

  it('agent : Demandes, Visites, Clients, Agenda, Mes biens', () => {
    const { lignes } = lignesDeMonEspace(groupesDe('agent'), 'agent');
    expect(ids(lignes).slice(0, 2)).toEqual(['demandes', 'visites']);
    expect(ids(lignes)).toEqual(expect.arrayContaining(['demandes', 'visites', 'clients', 'calendrier', 'mes-biens']));
  });

  it('au plus six lignes de métier, sans doublon ni messagerie dans les lignes', () => {
    for (const persona of Object.keys(COMPTES) as (keyof typeof COMPTES)[]) {
      const { lignes, suite } = lignesDeMonEspace(groupesDe(persona), persona);
      expect(lignes.length, persona).toBeLessThanOrEqual(6);
      expect(new Set(ids([...lignes, ...suite])).size, persona).toBe(lignes.length + suite.length);
      expect(ids(lignes), persona).not.toContain('messagerie');
    }
  });

  it('jamais une destination que le persona n’ouvre pas : le client n’a ni loyer ni demandes', () => {
    const { lignes } = lignesDeMonEspace(groupesDe('client'), 'client');
    expect(ids(lignes)).not.toContain('paiements');
    expect(ids(lignes)).not.toContain('demandes');
  });
});

describe('ADR-0091 §3 — les sections de « Moi »', () => {
  it('un pro garde Favoris et Recherches (qui quittent sa barre), jamais le tableau de bord', () => {
    for (const persona of ['agent', 'bailleur', 'admin-agence', 'hote', 'prestataire'] as const) {
      const entrees = sectionsDeMoi(groupesDe(persona)).flatMap((s) => ids(s.entrees));
      expect(entrees, persona).toEqual(expect.arrayContaining(['favoris', 'recherches']));
      expect(entrees, persona).not.toContain('tableau-de-bord');
      expect(entrees, persona).not.toContain('chercher-bien');
    }
  });
});

describe('ADR-0091 §4 — une seule couche d’action en bas : où la barre vit', () => {
  it.each([
    ['/fr', true],
    ['/fr/properties', true],
    ['/en/agencies', true],
    ['/fr/agents', true],
    // TCK-2522 / TCK-2523 — les fiches d'agence et de personne ont leur barre d'actions.
    ['/fr/agents/awa-diop', false],
    ['/en/agencies/dakar-immo', false],
    ['/fr/favorites', true],
    ['/fr/account', true],
    // La fiche d'un bien a sa barre d'actions.
    ['/fr/properties/villa-ngor', false],
    ['/wo/properties/villa-ngor/visite', false],
    // TCK-2509 — le comparateur a sa barre « Ajouter un bien · Partager ».
    ['/fr/compare', false],
    ['/en/compare', false],
    // Les tunnels et les pages par lien.
    ['/fr/pay/abc', false],
    ['/fr/claim/abc', false],
    ['/fr/bookings', false],
    ['/fr/share/abc', false],
    ['/fr/search-alerts/confirm', false],
    ['/fr/notifications/unsubscribe', false],
    // Hors du site public.
    ['/app', false],
    ['/publish', false],
    [null, false],
  ] as const)('%s → %s', (chemin, attendu) => {
    expect(porteLaBarrePublique(chemin)).toBe(attendu);
  });

  it('le site public, c’est un chemin préfixé de sa langue', () => {
    expect(estSurLeSitePublic('/fr/properties')).toBe(true);
    expect(estSurLeSitePublic('/app/messages')).toBe(false);
  });
});

describe('TCK-2505 — les pages par lien (coque nue)', () => {
  it.each([
    ['/fr/pay/abc', true],
    ['/fr/claim/abc', true],
    ['/en/share/abc', true],
    ['/fr/search-alerts/confirm', true],
    ['/fr/search-alerts/unsubscribe', true],
    ['/wo/notifications/unsubscribe', true],
    ['/fr/bookings', false],
    ['/fr/properties/villa-ngor', false],
    ['/fr', false],
    ['/pay/abc', false],
    [null, false],
  ] as const)('%s → %s', (chemin, attendu) => {
    expect(estPageDeLien(chemin)).toBe(attendu);
  });
});

describe('TCK-2494 — les pages de découverte gardent la rangée de catégories', () => {
  it.each([
    ['/fr', true],
    ['/en/properties', true],
    ['/fr/properties/villa-ngor', false],
    ['/fr/agencies', false],
    ['/fr/account', false],
    ['/app', false],
  ] as const)('%s → %s', (chemin, attendu) => {
    expect(estPageDeDecouverte(chemin)).toBe(attendu);
  });
});

describe('TCK-568 — la case « Compte » emporte la page quittée', () => {
  it('depuis une recherche : chemin ET filtres en `?depuis=`', () => {
    expect(hrefDuCompte('/fr/properties?contract_type=rent&type=villa')).toBe(
      `/account?depuis=${encodeURIComponent('/fr/properties?contract_type=rent&type=villa')}`,
    );
  });

  it('nue depuis l’accueil, depuis `/account` lui-même et hors du site public', () => {
    expect(hrefDuCompte('/fr')).toBe('/account');
    expect(hrefDuCompte('/fr/account')).toBe('/account');
    expect(hrefDuCompte('/app/messages')).toBe('/account');
    expect(hrefDuCompte(null)).toBe('/account');
  });
});

describe('TCK-2493 / TCK-2494 — « Loyer » : le nom des paiements du LOCATAIRE, et de lui seul', () => {
  it('locataire : « loyer », partout où la destination paraît (barre, Moi, Mon espace)', () => {
    expect(libellePublic('paiements', 'locataire')).toBe('loyer');
  });

  it.each(['bailleur', 'agent', 'admin-agence', 'hote', 'prestataire', 'client'] as const)('%s : le libellé de l’entrée de menu', (persona) => {
    expect(libellePublic('paiements', persona)).toBeNull();
  });

  it('une autre destination du locataire garde son libellé', () => {
    expect(libellePublic('maintenance', 'locataire')).toBeNull();
  });
});

describe('TCK-2493 / TCK-2494 — une entrée cadenassée n’est JAMAIS proposée (revue)', () => {
  // Le cadenas est celui de `/app` (`isProRouteLocked`, posé par `useMenuDeLEspace`) : l'hôte d'une
  // agence `individual` n'ouvre pas la vue d'agence, et l'admin dont l'agence n'est pas encore
  // connue (`/api/me/profiles` en vol : `agencyIsStandard` vaut `undefined`) non plus.
  const verrouilles = (persona: 'hote' | 'admin-agence', agencyIsStandard: boolean | undefined) => {
    const user = { id: 1, roles: COMPTES[persona].roles } as unknown as User;
    return groupesDe(persona).map((g) => ({
      ...g,
      entrees: g.entrees.map((e) => ({ ...e, locked: isProRouteLocked(user, agencyIsStandard, e.href) })),
    }));
  };

  it.each([
    ['hote', false, 'hôte d’agence individual'],
    ['admin-agence', undefined, 'admin, agence pas encore lue'],
  ] as const)('%s (%s) — ni dans « Moi », ni dans « Mon espace » : %s', (persona, standard, _cas) => {
    const groupes = verrouilles(persona, standard);
    const cadenasses = groupes.flatMap((g) => g.entrees).filter((e) => e.locked).map((e) => e.id);
    // Le cas existe : sans entrée cadenassée, ce test ne garderait rien. TCK-2628 — « Vue agence » est devenue
    // l'onglet « Vue d'ensemble » de « Rapports », qui ne se cadenasse pas : reste « Propriétaires ».
    expect(cadenasses).toContain('proprietaires');

    const moi = sectionsDeMoi(groupes).flatMap((sec) => ids(sec.entrees));
    const { lignes, messagerie, suite } = lignesDeMonEspace(groupes, persona);
    const monEspace = ids([...lignes, ...(messagerie ? [messagerie] : []), ...suite]);
    for (const id of cadenasses) {
      expect(moi, `« Moi » propose ${id}, cadenassée`).not.toContain(id);
      expect(monEspace, `« Mon espace » propose ${id}, cadenassée`).not.toContain(id);
    }
  });
});
