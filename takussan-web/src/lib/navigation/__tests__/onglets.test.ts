import { describe, expect, it } from 'vitest';
import { CATALOGUE, type IdDestination } from '../catalogue';
import { composerMenu } from '../composer-menu';
import { DISPOSITIONS } from '../dispositions';
import { ONGLETS_AU_PLUS, ongletsDuMenu } from '../onglets';
import { PERSONAS, type Persona } from '../personas';
import type { ContexteDeMenu } from '../types';

/**
 * TCK-2481 (ADR-0089 §3) — les onglets de la barre mobile, lus dans le menu COMPOSÉ du persona.
 *
 * Les comptes sont RECOPIÉS de `dispositions-validees.test.ts`, pas importés : deux tests qui
 * partagent leurs données se valident l'un l'autre.
 */
const TOUTES_LES_PAGES_D_AGENCE = [
  '/app/agency/team', '/app/agency/roles', '/app/agency', '/app/agency/kyc', '/app/agency/billing',
  '/app/agency/finances', '/app/agency/moderation', '/app/agency/moderation/properties',
  '/app/agency/audit', '/app/agency/integrations',
];
const PAGES_DE_L_HOTE = ['/app/agency', '/app/agency/kyc', '/app/agency/billing', '/app/agency/finances', '/app/agency/integrations'];

const COMPTES: Record<Persona, ContexteDeMenu> = {
  client: { roles: ['customer'], capacites: null },
  locataire: { roles: ['customer', 'tenant'], capacites: null },
  bailleur: { roles: ['customer', 'owner'], capacites: null },
  agent: { roles: ['customer', 'agent'], capacites: ['properties.create'] },
  'admin-agence': { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: TOUTES_LES_PAGES_D_AGENCE },
  hote: { roles: ['customer', 'agency_admin', 'owner'], capacites: ['properties.create'], cheminsAdmin: PAGES_DE_L_HOTE },
  prestataire: { roles: ['customer', 'service_provider'], capacites: [] },
  plateforme: { roles: ['customer', 'super_admin'], capacites: [], cheminsAdmin: TOUTES_LES_PAGES_D_AGENCE },
};

/** `[id, clé de libellé]` de chaque onglet, lus sur le menu composé. */
function lire(persona: Persona, ctx = COMPTES[persona], onglets: readonly IdDestination[] = DISPOSITIONS[persona].onglets) {
  return ongletsDuMenu(composerMenu(ctx, persona).groupes, onglets).map((o) => [o.id, o.labelKey]);
}

describe('TCK-2481 — la garde des onglets', () => {
  const IDS = new Set<string>(CATALOGUE.map((d) => d.id));

  it.each(PERSONAS)('%s : de un à quatre onglets, existants, sans doublon, « Messagerie » comprise', (persona) => {
    const { onglets } = DISPOSITIONS[persona];
    expect(onglets.length).toBeGreaterThan(0);
    expect(onglets.length).toBeLessThanOrEqual(ONGLETS_AU_PLUS);
    for (const id of onglets) expect(IDS.has(id), `${persona} — ${id}`).toBe(true);
    expect(new Set(onglets).size).toBe(onglets.length);
    // Arbitrage 3 : le bouton flottant « Messagerie » quitte `/app` — la barre doit la porter.
    expect(onglets).toContain('messagerie');
  });
});

describe('TCK-2481 — AC1 : les quatre onglets de chaque persona (table du ticket)', () => {
  const ADMIN: [string, string][] = [
    ['tableau-de-bord', 'onglets.accueil'], ['demandes', 'onglets.demandes'], ['mes-biens', 'allProperties'], ['messagerie', 'messaging'],
  ];
  it.each([
    ['client', [['tableau-de-bord', 'onglets.accueil'], ['favoris', 'onglets.favoris'], ['visites', 'onglets.visites'], ['messagerie', 'messaging']]],
    ['locataire', [['tableau-de-bord', 'onglets.accueil'], ['paiements', 'payments'], ['maintenance', 'interventions'], ['messagerie', 'messaging']]],
    ['bailleur', [['tableau-de-bord', 'onglets.accueil'], ['mes-biens', 'myProperties'], ['demandes', 'onglets.demandes'], ['messagerie', 'messaging']]],
    ['agent', [['tableau-de-bord', 'onglets.accueil'], ['demandes', 'onglets.demandes'], ['visites', 'onglets.visites'], ['messagerie', 'messaging']]],
    ['admin-agence', ADMIN],
    ['hote', [['tableau-de-bord', 'onglets.accueil'], ['mes-biens', 'myProperties'], ['reservations', 'onglets.reservations'], ['messagerie', 'messaging']]],
    ['prestataire', [['tableau-de-bord', 'onglets.accueil'], ['maintenance', 'interventions'], ['messagerie', 'messaging'], ['documents', 'documents']]],
    ['plateforme', ADMIN],
  ] as [Persona, [string, string][]][])('%s', (persona, attendus) => {
    expect(lire(persona)).toEqual(attendus);
  });
});

describe('TCK-2481 — un onglet inaccessible cède sa place, jamais cadenassé', () => {
  it('inaccessible : la première destination de la disposition qui n’est pas déjà un onglet, à SA place', () => {
    // `commissions` n'est pas ouverte au client ; sa disposition commence par tableau de bord,
    // messagerie (déjà onglets), puis « Mes favoris ».
    expect(lire('client', COMPTES.client, ['tableau-de-bord', 'commissions', 'visites', 'messagerie']).map(([id]) => id))
      .toEqual(['tableau-de-bord', 'favoris', 'visites', 'messagerie']);
  });

  it('cadenassé : remplacé, jamais rendu', () => {
    const groupes = composerMenu(COMPTES.agent, 'agent').groupes.map((g) => ({
      ...g,
      entrees: g.entrees.map((e) => ({ ...e, locked: e.href === '/app/leads' })),
    }));
    const onglets = ongletsDuMenu(groupes, DISPOSITIONS.agent.onglets);
    expect(onglets.map((o) => o.id)).toEqual(['tableau-de-bord', 'taches', 'visites', 'messagerie']);
    expect(onglets.some((o) => o.locked)).toBe(false);
  });

  it('jamais pris dans « Aussi … » : la destination d’un autre profil de l’espace ne devient pas un onglet', () => {
    // Admin ET bailleur de la même agence : « Paiements » n'est ouverte que par le profil bailleur.
    const ctx: ContexteDeMenu = { roles: ['customer', 'agency_admin', 'owner'], capacites: ['properties.create'], cheminsAdmin: [] };
    expect(lire('admin-agence', ctx, ['tableau-de-bord', 'paiements', 'mes-biens', 'messagerie']).map(([id]) => id))
      .toEqual(['tableau-de-bord', 'vue-agence', 'mes-biens', 'messagerie']);
  });

  it('moins de destinations que d’onglets : un onglet de moins, aucune case vide', () => {
    // TCK-2489 — le tableau de bord du client a quitté la tête pour un groupe à lui.
    const tete = composerMenu(COMPTES.client, 'client').groupes.filter((g) => g.id === 'tete' || g.id === 'tableau-de-bord');
    expect(ongletsDuMenu(tete, ['tableau-de-bord', 'commissions', 'visites', 'messagerie']).map((o) => o.id))
      .toEqual(['tableau-de-bord', 'messagerie']);
  });
});

describe('TCK-2481 × TCK-2480 — une destination d’onglet épinglée reste un onglet, une seule fois', () => {
  it('« Visites » épinglée par le client (groupe « Épinglés ») : toujours son onglet, à sa place, une fois', () => {
    const menu = composerMenu(COMPTES.client, 'client', undefined, { epingles: ['visites'] });
    // Prémisse : l'épingle a bien quitté « Mes démarches » pour « Épinglés », en tête.
    expect(menu.groupes[0].id).toBe('epingles');
    expect(menu.groupes[0].entrees.map((e) => e.id)).toEqual(['visites']);

    const onglets = ongletsDuMenu(menu.groupes, DISPOSITIONS.client.onglets);
    expect(onglets.map((o) => [o.id, o.labelKey])).toEqual([
      ['tableau-de-bord', 'onglets.accueil'], ['favoris', 'onglets.favoris'], ['visites', 'onglets.visites'], ['messagerie', 'messaging'],
    ]);
  });

  it('une entrée présente dans « Épinglés » ET dans son groupe ne remplace pas deux onglets', () => {
    // Forme défensive : si une composition future COPIAIT l'épingle au lieu de la déplacer, la même
    // destination ne doit pas combler deux cases.
    const entrees = composerMenu(COMPTES.client, 'client').groupes.flatMap((g) => g.entrees);
    const par = (id: IdDestination) => entrees.find((e) => e.id === id)!;
    const groupes = [
      { id: 'epingles', entrees: [par('recherches')] },
      { id: 'tete', entrees: [par('tableau-de-bord'), par('recherches'), par('messagerie')] },
    ];
    expect(ongletsDuMenu(groupes, ['tableau-de-bord', 'commissions', 'taches', 'messagerie']).map((o) => o.id))
      .toEqual(['tableau-de-bord', 'recherches', 'messagerie']);
  });
});
