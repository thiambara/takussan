import type { IdDestination } from './catalogue';
import type { ModeDemarrer } from './demarrer';
import type { Persona } from './personas';
import type { NavCounterKey } from './types';

/**
 * TCK-2478 (ADR-0089 §3) — la disposition du menu de chaque persona, validée par le porteur le
 * 2026-11-05 (table de TCK-2478). Ce fichier ORDONNE, il n'accorde rien : chaque entrée n'est rendue
 * que si le catalogue l'ouvre au compte, et une destination ouverte que rien ne place tombe sous
 * « Plus ».
 *
 * `Record<Persona, …>` est EXHAUSTIF : un persona ajouté sans disposition casse `tsc`.
 */
export interface GroupeDeDisposition {
  readonly id: string;
  /** Clé sous `nav.sidebar.groupes`, ou `null` : groupe sans titre. */
  readonly titre: string | null;
  readonly entrees: readonly IdDestination[];
  readonly replie?: true;
}

export interface Disposition {
  readonly action: readonly IdDestination[];
  readonly libelleAction?: string;
  readonly carte?: IdDestination;
  readonly groupes: readonly GroupeDeDisposition[];
  readonly plus: readonly IdDestination[];
  readonly libelles?: Partial<Record<IdDestination, string>>;
  /**
   * TCK-2479 (ADR-0089 §5) — les compteurs qui montent dans la bande « À traiter », DANS CET ORDRE.
   * Liste blanche : un compteur absent garde son badge au menu, mais n'est pas « à traiter » pour ce
   * persona. Obligatoire : un persona sans priorités se décide, il ne s'oublie pas.
   */
  readonly priorites: readonly NavCounterKey[];
  /** TCK-2479 — le groupe « Démarrer » : les étapes d'une agence (`espace`) ou d'un bailleur. */
  readonly demarrer?: ModeDemarrer;
  /**
   * TCK-2481 (ADR-0089 §3) — les onglets de la barre mobile (sous `md`), DANS CET ORDRE, suivis de
   * « Menu ». Quatre au plus ; « Messagerie » toujours (le bouton flottant quitte `/app`). Un onglet
   * que le menu du persona ne rend pas cède sa place à la destination suivante de cette disposition
   * (`ongletsDuMenu`). Obligatoire : les onglets d'un persona se décident, ils ne s'oublient pas.
   */
  readonly onglets: readonly IdDestination[];
}

const PUBLIER: readonly IdDestination[] = ['publier-bien', 'proposer-bien'];

/**
 * TCK-2489 (ADR-0090 §4) — la place du « Tableau de bord » est une DONNÉE de chaque disposition,
 * écrite en toutes lettres ci-dessous, et éprouvée par persona (`dispositions-validees.test.ts`) :
 *
 * - `admin-agence` : première entrée de sa tête (inchangé) ;
 * - toute autre persona : un groupe sans titre à lui, APRÈS LE DEUXIÈME GROUPE TITRÉ — après le
 *   dernier s'il y en a moins de deux ;
 * - une persona sans groupe titré (prestataire) : quatrième ligne de sa tête.
 *
 * Un hôte, un bailleur, un agent, un client trouvent d'abord ce qui fait leur métier. La page
 * d'arrivée `/app` et les onglets mobiles (`onglets`) ne changent pas.
 */
const TABLEAU_DE_BORD: GroupeDeDisposition = { id: 'tableau-de-bord', titre: null, entrees: ['tableau-de-bord'] };

/**
 * L'admin d'agence et la plateforme partagent le menu (TCK-2478) ; TCK-2479 les sépare sur la bande
 * « À traiter » et « Démarrer », que chacun reçoit dans `DISPOSITIONS`.
 */
const ACTIVITE_ADMIN: GroupeDeDisposition = {
  id: 'activite',
  titre: 'activite',
  entrees: ['demandes', 'visites', 'reservations', 'calendrier'],
};
const PORTEFEUILLE_ADMIN: GroupeDeDisposition = {
  id: 'portefeuille',
  titre: 'portefeuille',
  entrees: ['mes-biens', 'proprietaires', 'clients', 'baux', 'entrees-en-attente'],
};

/** Les groupes de l'admin APRÈS « Activité » et « Portefeuille » ; la tête et le tableau de bord diffèrent (TCK-2489). */
const BASE_ADMIN: Omit<Disposition, 'priorites' | 'demarrer'> = {
  action: PUBLIER,
  groupes: [
    { id: 'finances', titre: 'finances', entrees: ['agence-finances', 'commissions', 'credits', 'agence-facturation'] },
    {
      id: 'agence',
      titre: 'agence',
      replie: true,
      entrees: [
        'agence-equipe', 'agence-roles', 'agence-fiche', 'agence-kyc',
        'agence-moderation-avis', 'agence-moderation-biens', 'agence-journal', 'agence-integrations',
      ],
    },
    { id: 'pilotage', titre: 'pilotage', replie: true, entrees: ['statistiques', 'kpis', 'alertes', 'exports'] },
  ],
  plus: ['maintenance', 'carnet-prestataires', 'etats-des-lieux', 'documents', 'avis'],
  libelles: { 'mes-biens': 'allProperties' },
  onglets: ['tableau-de-bord', 'demandes', 'mes-biens', 'messagerie'],
};

export const DISPOSITIONS: Record<Persona, Disposition> = {
  client: {
    action: ['chercher-bien'],
    carte: 'publier-annonce',
    groupes: [
      { id: 'tete', titre: null, entrees: ['messagerie'] },
      { id: 'mes-recherches', titre: 'mesRecherches', entrees: ['favoris', 'recherches'] },
      { id: 'mes-demarches', titre: 'mesDemarches', entrees: ['visites', 'reservations'] },
      TABLEAU_DE_BORD,
    ],
    plus: ['documents', 'avis', 'statistiques'],
    onglets: ['tableau-de-bord', 'favoris', 'visites', 'messagerie'],
    priorites: ['unreadMessages'],
  },
  locataire: {
    action: ['paiements'],
    libelleAction: 'payRent',
    carte: 'publier-annonce',
    groupes: [
      { id: 'tete', titre: null, entrees: ['messagerie'] },
      { id: 'mon-logement', titre: 'monLogement', entrees: ['baux', 'paiements', 'maintenance', 'etats-des-lieux', 'documents'] },
      {
        id: 'mes-recherches',
        titre: 'mesRecherches',
        replie: true,
        entrees: ['chercher-bien', 'favoris', 'recherches', 'visites', 'reservations'],
      },
      TABLEAU_DE_BORD,
    ],
    plus: ['avis', 'statistiques'],
    libelles: { baux: 'myLease', maintenance: 'interventions' },
    onglets: ['tableau-de-bord', 'paiements', 'maintenance', 'messagerie'],
    priorites: ['unreadMessages'],
  },
  bailleur: {
    action: PUBLIER,
    groupes: [
      { id: 'tete', titre: null, entrees: ['messagerie'] },
      { id: 'mon-patrimoine', titre: 'monPatrimoine', entrees: ['mes-biens', 'baux', 'paiements', 'etats-des-lieux'] },
      { id: 'activite', titre: 'activite', entrees: ['demandes', 'visites', 'reservations', 'calendrier', 'maintenance'] },
      TABLEAU_DE_BORD,
    ],
    plus: ['clients', 'avis', 'documents', 'statistiques', 'exports', 'favoris', 'recherches'],
    libelles: { maintenance: 'interventions' },
    onglets: ['tableau-de-bord', 'mes-biens', 'demandes', 'messagerie'],
    priorites: ['unreadMessages', 'unhandledLeads', 'pendingVisits'],
    demarrer: 'bailleur',
  },
  agent: {
    action: PUBLIER,
    groupes: [
      { id: 'tete', titre: null, entrees: ['messagerie', 'taches'] },
      { id: 'prospection', titre: 'prospection', entrees: ['demandes', 'clients', 'visites', 'calendrier'] },
      { id: 'catalogue', titre: 'catalogue', entrees: ['mes-biens', 'reservations'] },
      TABLEAU_DE_BORD,
      { id: 'gestion', titre: 'gestion', entrees: ['baux', 'entrees-en-attente', 'etats-des-lieux', 'maintenance', 'commissions'] },
    ],
    plus: ['avis', 'documents', 'statistiques', 'exports', 'favoris', 'recherches'],
    libelles: { maintenance: 'interventions' },
    onglets: ['tableau-de-bord', 'demandes', 'visites', 'messagerie'],
    priorites: ['unhandledLeads', 'pendingVisits', 'unreadMessages'],
  },
  'admin-agence': {
    ...BASE_ADMIN,
    // TCK-2489 — la seule persona dont le tableau de bord ouvre le menu.
    groupes: [
      { id: 'tete', titre: null, entrees: ['tableau-de-bord', 'vue-agence', 'messagerie'] },
      ACTIVITE_ADMIN,
      PORTEFEUILLE_ADMIN,
      ...BASE_ADMIN.groupes,
    ],
    priorites: ['unhandledLeads', 'pendingVisits', 'unreadMessages', 'propertyModeration', 'reviewModeration'],
    demarrer: 'espace',
  },
  hote: {
    action: PUBLIER,
    groupes: [
      { id: 'tete', titre: null, entrees: ['messagerie'] },
      { id: 'mes-biens', titre: 'mesBiens', entrees: ['mes-biens', 'reservations', 'visites', 'calendrier', 'demandes'] },
      { id: 'mes-locations', titre: 'mesLocations', entrees: ['baux', 'agence-finances', 'etats-des-lieux', 'maintenance', 'carnet-prestataires'] },
      TABLEAU_DE_BORD,
      { id: 'mon-espace', titre: 'monEspace', entrees: ['agence-fiche', 'agence-kyc', 'agence-facturation', 'credits', 'agence-integrations'] },
    ],
    plus: ['clients', 'statistiques', 'exports', 'kpis', 'alertes', 'avis', 'documents'],
    libelles: { maintenance: 'interventions', paiements: 'payments', 'agence-facturation': 'payouts' },
    onglets: ['tableau-de-bord', 'mes-biens', 'reservations', 'messagerie'],
    priorites: ['unreadMessages', 'unhandledLeads', 'pendingVisits'],
    demarrer: 'espace',
  },
  prestataire: {
    action: [],
    groupes: [{ id: 'tete', titre: null, entrees: ['maintenance', 'messagerie', 'documents', 'tableau-de-bord'] }],
    plus: [],
    onglets: ['tableau-de-bord', 'maintenance', 'messagerie', 'documents'],
    priorites: ['unreadMessages'],
  },
  plateforme: {
    ...BASE_ADMIN,
    groupes: [
      { id: 'tete', titre: null, entrees: ['vue-agence', 'messagerie'] },
      ACTIVITE_ADMIN,
      PORTEFEUILLE_ADMIN,
      TABLEAU_DE_BORD,
      ...BASE_ADMIN.groupes,
    ],
    priorites: ['propertyModeration', 'reviewModeration', 'unhandledLeads', 'pendingVisits', 'unreadMessages'],
  },
};
