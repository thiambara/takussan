import type { Persona } from '@/lib/navigation/personas';
import type { DashboardMeNextPayment, DashboardMeRole } from '@/lib/queries/dashboard-me';

/**
 * TCK-2622 — « Ce mois » de l'accueil : les chiffres de `GET /api/dashboard/me` (les tuiles de
 * l'ancien `DashboardMeKpis`), CHACUN un lien vers la liste qu'il compte, avec ses unités.
 *
 * Fonction pure : le composant (`CeMois`) ne fait que formater et poser les liens qu'elle rend.
 *
 * **Persona, et non rôle de la vue.** `/dashboard/me` sert la vue `tenant` à TOUT compte qui n'a pas
 * d'autre profil (TCK-595) : un client avec une fiche mais sans bail la reçoit aussi. Choisir les
 * chiffres sur `role === 'tenant'` lui donnait « Baux actifs 0 » vers `/app/leases` — le défaut des
 * raccourcis faux du client. Les chiffres du locataire ne se rendent qu'au persona `locataire`.
 *
 * **Les KPI personnalisés de l'agence** (TCK-2373, `kpi_configs`) remplacent les chiffres par défaut
 * de l'admin quand l'agence en a activé, dans leur ordre, avec leur libellé et leur format. Leurs
 * valeurs sont celles de `/dashboard/me` (même résumé, `KpiResolver::flatten`) : une métrique absente
 * de la réponse (chiffres consolidés sans `reports.view_agency`, TCK-595) n'est pas rendue, jamais à
 * zéro.
 */

export type FormeDuChiffre = 'nombre' | 'montant' | 'pourcent';

/** Le contexte sous la valeur : une clé de `accueil.ceMois.contextes`, et ce qu'elle cite. */
export interface ContexteDuChiffre {
  readonly cle: 'echeances' | 'biensLoues' | 'louesLibres' | 'surAttendus' | 'leJour';
  readonly n?: number;
  readonly libres?: number;
  readonly montant?: number;
  readonly jour?: string;
}

export interface ChiffreDuMois {
  /** Identifiant stable : la clé de libellé (`accueil.ceMois.libelles.<cle>`) ou `kpi:<metrique>`. */
  readonly cle: string;
  /** Le libellé saisi par l'agence (KPI personnalisé) ; sinon, le composant traduit `cle`. */
  readonly libelle?: string;
  readonly valeur: number | null;
  readonly forme: FormeDuChiffre;
  readonly contexte?: ContexteDuChiffre;
  readonly ton?: 'danger';
  readonly href: string;
}

/** Un KPI configuré par l'agence (`GET /api/kpi-configs`, activés, dans l'ordre). */
export interface KpiDeLAgence {
  readonly metric: string;
  readonly label: string;
  readonly format: 'number' | 'percent' | 'currency';
}

interface Entrees {
  readonly persona: Persona;
  readonly role: DashboardMeRole;
  readonly metrics: Record<string, unknown>;
  /** Les KPI activés de l'agence ; vide sans configuration. */
  readonly kpis?: readonly KpiDeLAgence[];
  /**
   * L'agence est `standard` : l'admin y a « Argent » (`/app/agency/finances`, ADR-0100). Ailleurs
   * (hôte, `kind` illisible), l'argent reste sous `/app/payments`.
   */
  readonly agenceStandard: boolean;
}

/** « 2 à 4 chiffres » (TCK-2622) : au-delà, la liste complète vit dans « Rapports ». */
export const CHIFFRES_AU_PLUS = 4;

const nombre = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Les listes que comptent les chiffres. Chaque paramètre est LU par la page qu'il vise. */
export const LISTES = {
  biens: '/app/properties',
  biensOccupes: '/app/properties?mode=gestion&occupancy=occupied',
  biensVacants: '/app/properties?mode=gestion&occupancy=vacant',
  bauxActifs: '/app/leases?status=active',
  baux: '/app/leases',
  argent: '/app/agency/finances',
  impayesDeLAgence: '/app/agency/finances?tab=impayes',
  encaissements: '/app/payments?status=paid',
  enRetard: '/app/payments?status=late',
  paiements: '/app/payments',
  documents: '/app/documents',
  clients: '/app/customers',
  equipe: '/app/agency/team',
  reservations: '/app/bookings?status=pending',
  interventions: '/app/maintenance',
  commissions: '/app/commissions',
  rapport: '/app/reports',
} as const;

function chiffresDeLAgence(m: Record<string, unknown>, standard: boolean): ChiffreDuMois[] {
  const liste: ChiffreDuMois[] = [];
  // TCK-595 (verif-595 M1) — les chiffres consolidés n'arrivent que sous `reports.view_agency` : sans
  // la clé, le chiffre n'est pas rendu (un « — » laisserait croire à une donnée absente).
  if ('revenue_month' in m) {
    liste.push({ cle: 'encaisse', valeur: nombre(m.revenue_month), forme: 'montant', href: standard ? LISTES.argent : LISTES.encaissements });
  }
  if ('overdue_amount' in m) {
    const n = nombre(m.overdue_count) ?? 0;
    liste.push({
      cle: 'impayes',
      valeur: nombre(m.overdue_amount),
      forme: 'montant',
      contexte: { cle: 'echeances', n },
      ...(n > 0 ? { ton: 'danger' as const } : {}),
      href: standard ? LISTES.impayesDeLAgence : LISTES.enRetard,
    });
  }
  liste.push({
    cle: 'occupation',
    valeur: nombre(m.occupancy_rate_percent),
    forme: 'pourcent',
    contexte: { cle: 'biensLoues', n: nombre(m.properties_rented) ?? 0 },
    href: LISTES.biensOccupes,
  });
  liste.push({ cle: 'bauxActifs', valeur: nombre(m.leases_active), forme: 'nombre', href: LISTES.bauxActifs });
  liste.push({ cle: 'biens', valeur: nombre(m.properties_total), forme: 'nombre', href: LISTES.biens });
  return liste.slice(0, CHIFFRES_AU_PLUS);
}

/** La liste que compte chaque métrique configurable (`KpiConfig::allowedMetrics`). */
function listeDeLaMetrique(metrique: string, standard: boolean): string {
  switch (metrique) {
    case 'properties_total':
      return LISTES.biens;
    case 'properties_rented':
    case 'occupancy_rate_percent':
      return LISTES.biensOccupes;
    case 'properties_available':
      return LISTES.biensVacants;
    case 'leases_active':
      return LISTES.bauxActifs;
    case 'customers_count':
      return LISTES.clients;
    case 'members_count':
      // L'hôte (agence `individual`) n'a pas d'équipe (TCK-777) : le rapport.
      return standard ? LISTES.equipe : LISTES.rapport;
    case 'bookings_pending':
      return LISTES.reservations;
    case 'maintenance_open':
      return LISTES.interventions;
    case 'revenue_month':
      return standard ? LISTES.argent : LISTES.encaissements;
    case 'commission_month':
      return LISTES.commissions;
    case 'overdue_count':
    case 'overdue_amount':
    case 'unpaid_rate_percent':
      return standard ? LISTES.impayesDeLAgence : LISTES.enRetard;
    default:
      return LISTES.rapport;
  }
}

const FORMES: Readonly<Record<KpiDeLAgence['format'], FormeDuChiffre>> = { number: 'nombre', percent: 'pourcent', currency: 'montant' };

function chiffresConfigures(m: Record<string, unknown>, kpis: readonly KpiDeLAgence[], standard: boolean): ChiffreDuMois[] {
  return kpis
    .filter((k) => k.metric in m)
    .slice(0, CHIFFRES_AU_PLUS)
    .map((k) => ({
      cle: `kpi:${k.metric}`,
      libelle: k.label,
      valeur: nombre(m[k.metric]),
      forme: FORMES[k.format] ?? 'nombre',
      href: listeDeLaMetrique(k.metric, standard),
    }));
}

function chiffresDuBailleur(m: Record<string, unknown>): ChiffreDuMois[] {
  const n = nombre(m.overdue_count) ?? 0;
  return [
    {
      cle: 'biens',
      valeur: nombre(m.portfolio_total),
      forme: 'nombre',
      contexte: { cle: 'louesLibres', n: nombre(m.portfolio_rented) ?? 0, libres: nombre(m.portfolio_available) ?? 0 },
      href: LISTES.biens,
    },
    { cle: 'bauxActifs', valeur: nombre(m.leases_active), forme: 'nombre', href: LISTES.bauxActifs },
    {
      cle: 'encaisse',
      valeur: nombre(m.cashflow_month),
      forme: 'montant',
      ...(nombre(m.expected_monthly) ? { contexte: { cle: 'surAttendus' as const, montant: nombre(m.expected_monthly) ?? 0 } } : {}),
      href: LISTES.encaissements,
    },
    {
      cle: 'enRetard',
      valeur: nombre(m.overdue_amount),
      forme: 'montant',
      contexte: { cle: 'echeances', n },
      ...(n > 0 ? { ton: 'danger' as const } : {}),
      href: LISTES.enRetard,
    },
  ];
}

function chiffresDuLocataire(m: Record<string, unknown>): ChiffreDuMois[] {
  const prochaine = (m.next_payment ?? null) as DashboardMeNextPayment | null;
  const n = nombre(m.overdue_count) ?? 0;
  return [
    { cle: 'bauxActifs', valeur: nombre(m.leases_active), forme: 'nombre', href: LISTES.baux },
    {
      cle: 'prochaineEcheance',
      valeur: prochaine ? nombre(prochaine.amount) : null,
      forme: 'montant',
      ...(prochaine?.due_date ? { contexte: { cle: 'leJour' as const, jour: prochaine.due_date } } : {}),
      href: LISTES.paiements,
    },
    {
      cle: 'enRetard',
      valeur: nombre(m.overdue_amount),
      forme: 'montant',
      contexte: { cle: 'echeances', n },
      ...(n > 0 ? { ton: 'danger' as const } : {}),
      href: LISTES.paiements,
    },
    { cle: 'documentsRecents', valeur: Array.isArray(m.recent_documents) ? m.recent_documents.length : null, forme: 'nombre', href: LISTES.documents },
  ];
}

export function chiffresDuMois({ persona, role, metrics, kpis = [], agenceStandard }: Entrees): ChiffreDuMois[] {
  switch (role) {
    case 'agency_admin': {
      const configures = chiffresConfigures(metrics, kpis, agenceStandard);
      return configures.length > 0 ? configures : chiffresDeLAgence(metrics, agenceStandard);
    }
    case 'owner':
      return chiffresDuBailleur(metrics);
    case 'tenant':
      return persona === 'locataire' ? chiffresDuLocataire(metrics) : [];
    default:
      // L'agent : sa journée porte ses chiffres (`MesChiffres`, TCK-2596).
      return [];
  }
}

/** « Voir le rapport du mois » : l'admin et le bailleur ont un rapport ; le locataire, non. */
export function rapportDuMois(role: DashboardMeRole): string | null {
  return role === 'agency_admin' || role === 'owner' ? LISTES.rapport : null;
}
