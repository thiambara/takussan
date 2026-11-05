import type { IdDestination } from './catalogue';
import type { Persona } from './personas';

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
}

const PUBLIER: readonly IdDestination[] = ['publier-bien', 'proposer-bien'];

const ADMIN_AGENCE: Disposition = {
  action: PUBLIER,
  groupes: [
    { id: 'tete', titre: null, entrees: ['tableau-de-bord', 'vue-agence', 'messagerie'] },
    { id: 'activite', titre: 'activite', entrees: ['demandes', 'visites', 'reservations', 'calendrier'] },
    { id: 'portefeuille', titre: 'portefeuille', entrees: ['mes-biens', 'proprietaires', 'clients', 'baux', 'entrees-en-attente'] },
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
};

export const DISPOSITIONS: Record<Persona, Disposition> = {
  client: {
    action: ['chercher-bien'],
    carte: 'publier-annonce',
    groupes: [
      { id: 'tete', titre: null, entrees: ['tableau-de-bord', 'messagerie'] },
      { id: 'mes-recherches', titre: 'mesRecherches', entrees: ['favoris', 'recherches'] },
      { id: 'mes-demarches', titre: 'mesDemarches', entrees: ['visites', 'reservations'] },
    ],
    plus: ['documents', 'avis', 'statistiques'],
  },
  locataire: {
    action: ['paiements'],
    libelleAction: 'payRent',
    carte: 'publier-annonce',
    groupes: [
      { id: 'tete', titre: null, entrees: ['tableau-de-bord', 'messagerie'] },
      { id: 'mon-logement', titre: 'monLogement', entrees: ['baux', 'paiements', 'maintenance', 'etats-des-lieux', 'documents'] },
      {
        id: 'mes-recherches',
        titre: 'mesRecherches',
        replie: true,
        entrees: ['chercher-bien', 'favoris', 'recherches', 'visites', 'reservations'],
      },
    ],
    plus: ['avis', 'statistiques'],
    libelles: { baux: 'myLease', maintenance: 'interventions' },
  },
  bailleur: {
    action: PUBLIER,
    groupes: [
      { id: 'tete', titre: null, entrees: ['tableau-de-bord', 'messagerie'] },
      { id: 'mon-patrimoine', titre: 'monPatrimoine', entrees: ['mes-biens', 'baux', 'paiements', 'etats-des-lieux'] },
      { id: 'activite', titre: 'activite', entrees: ['demandes', 'visites', 'reservations', 'calendrier', 'maintenance'] },
    ],
    plus: ['clients', 'avis', 'documents', 'statistiques', 'exports', 'favoris', 'recherches'],
    libelles: { maintenance: 'interventions' },
  },
  agent: {
    action: PUBLIER,
    groupes: [
      { id: 'tete', titre: null, entrees: ['tableau-de-bord', 'messagerie', 'taches'] },
      { id: 'prospection', titre: 'prospection', entrees: ['demandes', 'clients', 'visites', 'calendrier'] },
      { id: 'catalogue', titre: 'catalogue', entrees: ['mes-biens', 'reservations'] },
      { id: 'gestion', titre: 'gestion', entrees: ['baux', 'entrees-en-attente', 'etats-des-lieux', 'maintenance', 'commissions'] },
    ],
    plus: ['avis', 'documents', 'statistiques', 'exports', 'favoris', 'recherches'],
    libelles: { maintenance: 'interventions' },
  },
  'admin-agence': ADMIN_AGENCE,
  hote: {
    action: PUBLIER,
    groupes: [
      { id: 'tete', titre: null, entrees: ['tableau-de-bord', 'messagerie'] },
      { id: 'mes-biens', titre: 'mesBiens', entrees: ['mes-biens', 'reservations', 'visites', 'calendrier', 'demandes'] },
      { id: 'mes-locations', titre: 'mesLocations', entrees: ['baux', 'agence-finances', 'etats-des-lieux', 'maintenance', 'carnet-prestataires'] },
      { id: 'mon-espace', titre: 'monEspace', entrees: ['agence-fiche', 'agence-kyc', 'agence-facturation', 'credits', 'agence-integrations'] },
    ],
    plus: ['clients', 'statistiques', 'exports', 'kpis', 'alertes', 'avis', 'documents'],
    libelles: { maintenance: 'interventions', paiements: 'payments', 'agence-facturation': 'payouts' },
  },
  prestataire: {
    action: [],
    groupes: [{ id: 'tete', titre: null, entrees: ['tableau-de-bord', 'maintenance', 'messagerie', 'documents'] }],
    plus: [],
  },
  plateforme: ADMIN_AGENCE,
};
