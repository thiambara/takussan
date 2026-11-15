import { Search } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import fr from '@/messages/fr.json';
import { CATALOGUE, estOuverte, type IdDestination } from '../catalogue';
import { composerMenu, entreesDuMenu, type EntreeComposee } from '../composer-menu';
import { parametreDe } from '@/types/search';
import {
  CHEMIN_DES_ANNONCES,
  GROUPES_DE_LA_PALETTE,
  avecLaRechercheDAnnonces,
  chercherDansLaPalette,
  decouperLesMots,
  optionsDeLaPalette,
  resolveurDesRecents,
  type GroupeDeLaPalette,
  type LibellesDeLaPalette,
  type LibellesDesAnnonces,
  type OptionDeLaPalette,
  type SourcesDeLaPalette,
} from '../palette';
import { PERSONAS, type Persona } from '../personas';
import type { ContexteDeMenu } from '../types';

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

const SIDEBAR = fr.nav.sidebar as unknown as Record<string, unknown>;
const ADMIN = fr.nav.admin as unknown as Record<string, string>;
const ACTIONS = SIDEBAR.actions as Record<string, string>;
/** Des synonymes de test : la garde des VRAIS synonymes est `palette-synonymes.test.ts` (tâche 2). */
const SYNONYMES: Partial<Record<IdDestination, string[]>> = { paiements: ['loyer', 'quittance'], clients: ['crm'] };

const LIBELLES: LibellesDeLaPalette = {
  entree: (e) => (e.labelSpace === 'nav.admin' ? ADMIN[e.labelKey]! : (SIDEBAR[e.labelKey] as string)),
  action: (e) => ACTIONS[e.labelKey] ?? (SIDEBAR[e.labelKey] as string),
  carte: () => 'Mettre un bien en location',
  precision: (g) => (g.id === 'aussi' ? 'Aussi' : null),
  synonymes: (id) => SYNONYMES[id] ?? [],
  pastille: (p) => `${p.nombre} ${p.cle}`,
  espace: (p) => `Passer à : ${p.type}`,
  motsEspace: ['espace', 'profil'],
};

function sources(persona: Persona, autres: Partial<SourcesDeLaPalette> = {}): SourcesDeLaPalette {
  const menu = composerMenu(COMPTES[persona], persona);
  return { action: menu.action, carte: menu.carte, groupes: menu.groupes, pastilles: [], espaces: [], recents: [], pathname: '/app', ...autres };
}
const du = (groupe: GroupeDeLaPalette, options: readonly OptionDeLaPalette[]) => options.filter((o) => o.groupe === groupe);
const hrefDe = (o: OptionDeLaPalette) => (o.cible.type === 'lien' ? o.cible.href : null);

describe('TCK-2482 AC3 — la palette ne propose que le menu RENDU', () => {
  it.each(PERSONAS)('%s : « Aller à » = exactement les entrées du menu composé, dans son ordre, carte en dernier', (persona) => {
    const menu = composerMenu(COMPTES[persona], persona);
    const attendus = [...entreesDuMenu(menu).map((e) => e.href), ...(menu.carte ? [menu.carte.href] : [])];
    expect(du('aller-a', optionsDeLaPalette(sources(persona), LIBELLES)).map(hrefDe)).toEqual(attendus);
  });

  it.each(PERSONAS)('%s : aucune destination que le compte ne peut ouvrir, dans aucun groupe', (persona) => {
    const proposes = new Set(optionsDeLaPalette(sources(persona), LIBELLES).map(hrefDe));
    const ouvertes = new Set(CATALOGUE.filter((d) => estOuverte(d, COMPTES[persona])).map((d) => d.href));
    const fermees = CATALOGUE.filter((d) => !ouvertes.has(d.href)).map((d) => d.href);
    expect(fermees.filter((href) => proposes.has(href))).toEqual([]);
  });

  it('une destination rangée sous « Plus » est trouvée : « avis » chez le locataire', () => {
    const menu = composerMenu(COMPTES.locataire, 'locataire');
    expect(menu.groupes.find((g) => g.id === 'plus')!.entrees.map((e) => e.id)).toContain('avis');
    const trouvees = chercherDansLaPalette(optionsDeLaPalette(sources('locataire'), LIBELLES), 'avis');
    expect(trouvees.map((o) => o.libelle)).toContain('Mes avis');
  });

  it('une page d’agence n’est jamais trouvée chez le locataire', () => {
    const trouvees = chercherDansLaPalette(optionsDeLaPalette(sources('locataire'), LIBELLES), 'équipe');
    expect(trouvees).toEqual([]);
  });

  it('une entrée cadenassée n’est jamais proposée', () => {
    // TCK-2628 — « Statistiques » est devenue « Rapports » ; le témoin garde le test d'être vide.
    const s = sources('agent');
    expect(optionsDeLaPalette(s, LIBELLES).map(hrefDe), 'témoin').toContain('/app/reports');
    const groupes = s.groupes.map((g) => ({
      ...g,
      entrees: g.entrees.map((e) => (e.id === 'rapports' ? { ...e, locked: true } : e)),
    }));
    const hrefs = optionsDeLaPalette({ ...s, groupes, recents: ['/app/reports'] }, LIBELLES).map(hrefDe);
    expect(hrefs).not.toContain('/app/reports');
  });

  it('une entrée du complément porte sa précision ; une entrée de « Plus » n’en porte aucune', () => {
    const ctx: ContexteDeMenu = { roles: ['customer', 'agent', 'owner'], capacites: ['properties.create'] };
    const menu = composerMenu(ctx, 'bailleur');
    const options = optionsDeLaPalette(
      { action: menu.action, carte: menu.carte, groupes: menu.groupes, pastilles: [], espaces: [], recents: [], pathname: '/app' },
      LIBELLES,
    );
    expect(options.find((o) => o.cle === 'aller-a:commissions')?.precision).toBe('Aussi');
    expect(options.find((o) => o.cle === 'aller-a:documents')?.precision).toBeUndefined();
  });
});

describe('TCK-2482 — les autres groupes', () => {
  it('l’action ➊ ouvre la liste, avec le libellé de la disposition (« Payer mon loyer »)', () => {
    const options = optionsDeLaPalette(sources('locataire'), LIBELLES);
    expect(options[0]).toMatchObject({ groupe: 'actions', libelle: 'Payer mon loyer', cible: { type: 'lien', href: '/app/payments' } });
  });

  it('un espace suspendu n’a pas d’action ➊ dans la palette non plus', () => {
    const menu = composerMenu({ ...COMPTES.agent, agenceSuspendue: true }, 'agent');
    expect(du('actions', optionsDeLaPalette(sources('agent', { action: menu.action }), LIBELLES))).toEqual([]);
  });

  it('« À traiter » : la page filtrée de la pastille, cherchable par le nom de son entrée', () => {
    const options = optionsDeLaPalette(
      sources('agent', { pastilles: [{ cle: 'pendingVisits', nombre: 3, href: '/app/visits?tab=requested' }] }),
      LIBELLES,
    );
    const pastille = du('a-traiter', options)[0]!;
    expect(hrefDe(pastille)).toBe('/app/visits?tab=requested');
    expect(chercherDansLaPalette(options, 'visites').map((o) => o.cle)).toContain('a-traiter:pendingVisits');
  });

  it('récents : résolus sur le menu du compte, page courante exclue, jamais une page fermée, sans doublon', () => {
    const options = optionsDeLaPalette(
      sources('locataire', {
        pathname: '/app/leases',
        recents: ['/app/agency/team', '/app/payments/12', '/app/leases/3', '/app/payments', '/app'],
      }),
      LIBELLES,
    );
    expect(du('recents', options).map((o) => o.cle)).toEqual(['recents:paiements', 'recents:tableau-de-bord']);
  });

  it('les espaces viennent en dernier et portent leur profil', () => {
    const profil = { id: 'owner:7', type: 'owner', numeric_id: 7, agency_id: 3, status: 'active', created_at: null } as const;
    const options = optionsDeLaPalette(sources('agent', { espaces: [profil] }), LIBELLES);
    expect(options.at(-1)).toMatchObject({ groupe: 'espaces', cible: { type: 'espace', profilId: 'owner:7' } });
  });
});

describe('TCK-2482 — chercherDansLaPalette', () => {
  const opt = (cle: string, groupe: GroupeDeLaPalette, libelle: string, motsCles: string[] = []): OptionDeLaPalette => ({
    cle, groupe, libelle, motsCles, icone: Search, cible: { type: 'lien', href: `/app/${cle}` },
  });

  it('champ vide : tout, dans l’ordre reçu', () => {
    const options = [opt('a', 'actions', 'A'), opt('r', 'recents', 'R'), opt('b', 'aller-a', 'B')];
    expect(chercherDansLaPalette(options, '   ')).toEqual(options);
  });

  it('sans les accents ni la casse : « etats » trouve « États des lieux », « EQUIPE » trouve « Équipe »', () => {
    const options = [opt('edl', 'aller-a', 'États des lieux'), opt('equipe', 'aller-a', 'Équipe'), opt('docs', 'aller-a', 'Documents')];
    expect(chercherDansLaPalette(options, 'etats').map((o) => o.cle)).toEqual(['edl']);
    expect(chercherDansLaPalette(options, 'EQUIPE').map((o) => o.cle)).toEqual(['equipe']);
  });

  it('les synonymes : « loyer » trouve « Paiements »', () => {
    const options = [opt('paiements', 'aller-a', 'Paiements', ['loyer', 'quittance']), opt('baux', 'aller-a', 'Baux', ['bail'])];
    expect(chercherDansLaPalette(options, 'loyer').map((o) => o.cle)).toEqual(['paiements']);
  });

  it('chaque mot doit correspondre : « mes vis » trouve « Mes visites », pas « Mes biens »', () => {
    const options = [opt('biens', 'aller-a', 'Mes biens'), opt('visites', 'aller-a', 'Mes visites')];
    expect(chercherDansLaPalette(options, 'mes vis').map((o) => o.cle)).toEqual(['visites']);
  });

  it('dans un groupe : début du libellé, puis un mot, puis un synonyme, puis l’ordre reçu', () => {
    const options = [
      opt('contenu', 'aller-a', 'Mon calendrier'),
      opt('synonyme', 'aller-a', 'Agenda', ['calendrier partagé']),
      opt('mot', 'aller-a', 'Le calendrier'),
      opt('debut', 'aller-a', 'Calendrier'),
    ];
    expect(chercherDansLaPalette(options, 'cal').map((o) => o.cle)).toEqual(['debut', 'contenu', 'mot', 'synonyme']);
    expect(chercherDansLaPalette(options, 'endrier').map((o) => o.cle)).toEqual(['contenu', 'synonyme', 'mot', 'debut']);
  });

  it('les groupes gardent leur ordre, quelle que soit la pertinence ; « Récents » disparaît à la frappe', () => {
    const options = [
      opt('action', 'actions', 'Payer mon loyer'),
      opt('recent', 'recents', 'Paiements'),
      opt('page', 'aller-a', 'Paiements', ['loyer']),
      opt('espace', 'espaces', 'Passer à : Paiements'),
    ];
    expect(chercherDansLaPalette(options, 'paie').map((o) => o.cle)).toEqual(['page', 'espace']);
    expect(chercherDansLaPalette(options, 'loyer').map((o) => o.cle)).toEqual(['action', 'page']);
  });

  it('decouperLesMots : virgules, blancs, vides retirés', () => {
    expect(decouperLesMots(' loyer, quittance ,, payer ')).toEqual(['loyer', 'quittance', 'payer']);
  });
});

// `EntreeComposee` reste importé pour que `tsc` refuse une forme d'entrée que la palette ne lit plus.
export type _EntreeLue = EntreeComposee;

/**
 * Revue I3 — UNE résolution d'un chemin vers son entrée, partagée par l'écriture des récents (la coque)
 * et leur lecture (`optionsDeLaPalette`) : le plus long préfixe parmi les entrées rendues non
 * cadenassées, `/app` et `/app/agency` comparés à l'égal.
 */
describe('revue I3 — resolveurDesRecents', () => {
  const groupes = composerMenu(COMPTES.locataire, 'locataire').groupes;
  const entreeDe = resolveurDesRecents(groupes);

  it('une fiche se résout sur son entrée ; une page de l’entrée, sur elle-même', () => {
    expect(entreeDe('/app/leases/42')).toBe('/app/leases');
    expect(entreeDe('/app/leases')).toBe('/app/leases');
    expect(entreeDe('/app/payments')).toBe('/app/payments');
  });

  it('/app ne couvre pas ses sous-pages ; un chemin que le menu ne couvre pas ne se résout pas', () => {
    expect(entreeDe('/app')).toBe('/app');
    expect(entreeDe('/app/agency/team')).toBeNull();
    expect(entreeDe(null)).toBeNull();
  });

  it('une entrée cadenassée ne résout rien', () => {
    const cadenas = groupes.map((g) => ({ ...g, entrees: g.entrees.map((e) => ({ ...e, locked: e.href === '/app/leases' })) }));
    expect(resolveurDesRecents(cadenas)('/app/leases/42')).toBeNull();
  });
});

describe('TCK-2489 AC3 — la recherche d’annonces du site public entre dans la palette (ADR-0090 §2)', () => {
  const ANNONCES: LibellesDesAnnonces = {
    generique: 'Chercher un bien sur Takussan',
    avecTexte: (q) => `Chercher « ${q} » parmi les annonces`,
  };
  const resultats = (persona: Persona, requete: string) =>
    avecLaRechercheDAnnonces(chercherDansLaPalette(optionsDeLaPalette(sources(persona), LIBELLES), requete), requete, ANNONCES);

  it('le paramètre est celui de la recherche publique : `q`', () => {
    expect(parametreDe('q')).toBe('q');
    expect(CHEMIN_DES_ANNONCES).toBe('/properties');
  });

  it.each(PERSONAS.filter((p) => p !== 'client' && p !== 'locataire'))(
    '%s : champ vide, « Chercher un bien sur Takussan » juste après les actions, vers /properties (publique)',
    (persona) => {
      const liste = resultats(persona, '');
      const i = liste.findIndex((o) => o.cle === 'actions:annonces');
      expect(i).toBe(du('actions', liste).length - 1);
      expect(liste[i]).toMatchObject({
        groupe: 'actions',
        libelle: 'Chercher un bien sur Takussan',
        cible: { type: 'lien', href: '/properties', publique: true },
      });
      expect(liste.filter((o) => o.groupe === 'annonces')).toEqual([]);
    },
  );

  it.each(['client', 'locataire'] as const)(
    '%s : le menu mène déjà à /properties (« Chercher un bien ») — une destination, une ligne',
    (persona) => {
      const liste = resultats(persona, '');
      expect(liste.filter((o) => hrefDe(o) === '/properties')).toHaveLength(1);
      expect(liste.some((o) => o.cle === 'actions:annonces')).toBe(false);
    },
  );

  it.each(PERSONAS)('%s : avec du texte, « Chercher « … » parmi les annonces » transmet le texte tapé, EN DERNIER', (persona) => {
    const liste = resultats(persona, '  villa Almadies  ');
    const derniere = liste.at(-1)!;
    expect(derniere).toMatchObject({
      cle: 'annonces:texte',
      groupe: 'annonces',
      libelle: 'Chercher « villa Almadies » parmi les annonces',
      cible: { type: 'lien', href: '/properties?q=villa+Almadies', publique: true },
    });
    expect(liste.filter((o) => o.groupe === 'annonces')).toHaveLength(1);
    expect(liste.some((o) => o.cle === 'actions:annonces')).toBe(false);
  });

  it('la page du menu passe avant sous Entrée : « mess » ouvre la messagerie, la recherche suit', () => {
    const liste = resultats('agent', 'mess');
    expect(hrefDe(liste[0]!)).toBe('/app/messages');
    expect(liste.at(-1)!.cle).toBe('annonces:texte');
  });

  it('une saisie qui ne trouve aucune page n’est pas une impasse : la recherche d’annonces seule', () => {
    expect(resultats('bailleur', 'zzqx').map((o) => o.cle)).toEqual(['annonces:texte']);
  });

  it('le texte est encodé, pas collé : « & », « # », « ? » restent dans `q`', () => {
    const href = hrefDe(resultats('agent', 'a&b #c?d').at(-1)!)!;
    expect(new URL(href, 'https://x.test').searchParams.get('q')).toBe('a&b #c?d');
    expect(new URL(href, 'https://x.test').pathname).toBe('/properties');
  });

  it('« Annonces » est le dernier groupe de la palette', () => {
    expect(GROUPES_DE_LA_PALETTE.at(-1)).toBe('annonces');
  });
});
