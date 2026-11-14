import { variationDuDernierMois } from './graduations';

/**
 * TCK-2628 (L2) — les chiffres de la vue d'ensemble de « Rapports », par persona : CHACUN un lien vers la
 * liste qu'il compte, avec son contexte (maquette `INDICATEURS`, `TUILES_AGENT`, `TUILES_BAILLEUR`).
 *
 * Fonction pure : la vue ne fait que formater et poser les liens. Un contexte que l'API ne sert pas n'est
 * pas inventé (« 4 à renouveler d'ici 30 j », « seuil d'alerte : 10 % », « +5 cette semaine » de la
 * maquette) : la tuile se rend sans, et la fiche de fidélité le dit (écart de donnée, ADR-0106 § 2).
 */
/** TCK-2801 — `biens` : un compte de biens dit avec son nom (« 69 biens », le portefeuille de la maquette). */
export type FormeDuChiffre = 'nombre' | 'montant' | 'pourcent' | 'biens';

export type ContexteDuChiffre =
  | { readonly cle: 'variation'; readonly pourcent: number; readonly mois: string }
  | { readonly cle: 'echeances'; readonly n: number }
  | { readonly cle: 'loues'; readonly occupes: number; readonly eligibles: number }
  | { readonly cle: 'publies'; readonly total: number }
  | { readonly cle: 'surAttendus'; readonly montant: number }
  | { readonly cle: 'cetteAnnee'; readonly montant: number }
  | { readonly cle: 'bauxCetteAnnee'; readonly n: number }
  | { readonly cle: 'septJours' }
  | { readonly cle: 'seuil'; readonly valeur: number }
  | { readonly cle: 'portefeuille'; readonly loues: number; readonly libres: number; readonly autres: number };

export interface ChiffreDuRapport {
  /** La clé du libellé (`rapports.chiffres.libelles.<cle>`), ou `kpi:<metrique>` d'un KPI de l'agence. */
  readonly cle: string;
  /** Le libellé saisi par l'agence (KPI personnalisé) ; sinon la vue traduit `cle`. */
  readonly libelle?: string;
  readonly valeur: number | null;
  readonly forme: FormeDuChiffre;
  readonly contexte?: ContexteDuChiffre;
  readonly ton?: 'danger' | 'succes';
  /** La liste qu'il compte ; absent quand cette persona ne l'ouvre pas : la tuile se rend sans lien. */
  readonly href?: string;
}

/**
 * Les listes de « Rapports » ou d'administration que la persona ouvre (`ongletOuvert`, `accesAdmin`) :
 * un chiffre ne mène jamais à une page qui la renverrait (l'hôte n'a pas l'onglet Impayés, un rôle
 * d'admin personnalisé peut ne pas avoir l'équipe).
 */
export interface ListesOuvertes {
  readonly impayes: boolean;
  readonly equipe: boolean;
}

const TOUT_OUVERT: ListesOuvertes = { impayes: true, equipe: true };

/** TCK-2801 — le seuil de l'alerte ACTIVE de chaque métrique (la première rendue), lu de `/api/threshold-alerts`. */
export type SeuilsDesAlertes = Readonly<Partial<Record<string, number>>>;

/**
 * TCK-2801 (fiche TCK-2628, O6) — « seuil d'alerte : 10 % » sous « Taux d'impayés » : un sous-texte que l'API
 * SERT, puisque l'agence a posé la règle. Une alerte désactivée ne dit rien ; un seuil illisible non plus.
 */
export function seuilsDesAlertes(
  alertes: readonly { readonly metric: string; readonly threshold: number | string; readonly is_enabled: boolean }[],
): SeuilsDesAlertes {
  const seuils: Partial<Record<string, number>> = {};
  for (const a of alertes) {
    const seuil = Number(a.threshold);
    if (a.is_enabled && Number.isFinite(seuil) && seuils[a.metric] === undefined) seuils[a.metric] = seuil;
  }
  return seuils;
}

/** Les listes que comptent les chiffres ; chaque paramètre est LU par la page qu'il vise. */
export const LISTES_DES_CHIFFRES = {
  // `/app/payments` mène l'admin à « Argent » en gardant `status` (`aiguillerVersLArgent`), et sert
  // la liste des paiements à tout autre compte : un seul lien juste pour tous.
  encaissements: '/app/payments?status=paid',
  impayes: '/app/reports/unpaid',
  enRetard: '/app/payments?status=late',
  biens: '/app/properties',
  // « Publiés » = au catalogue public (`Property::public()`, TCK-1115) : la pastille « En ligne ».
  biensPublies: '/app/properties?mode=annonces&listing=online',
  biensOccupes: '/app/properties?mode=gestion&occupancy=occupied',
  bauxActifs: '/app/leases?status=active',
  commissions: '/app/reports/commissions',
  bauxSignes: '/app/leases?status=active',
  visites: '/app/visits',
  pipeline: '/app/reports/pipeline',
  equipe: '/app/reports/team',
} as const;

const nombre = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * La variation du dernier mois d'une série `AAAA-MM` sur le précédent — seulement si ce dernier mois est
 * CLOS. Les séries finissent sur le mois en cours (`monthlyTimeseries` : 11 mois clos et l'actuel) : le
 * 3 novembre, comparer trois jours de novembre à tout octobre afficherait « −90 % » en rouge, un faux.
 * Le mois en cours est donc retiré avant de comparer ; `mois` est celui qu'on compare, `precedent` sa base.
 */
export function variationDuMoisClos(
  mois: readonly string[] | undefined,
  valeurs: readonly (number | null)[] | undefined,
  moisEnCours: string | null,
): { readonly pourcent: number; readonly mois: string; readonly precedent: string } | null {
  if (!mois || !valeurs) return null;
  const fin = mois.at(-1) === moisEnCours ? mois.length - 1 : mois.length;
  if (fin < 2) return null;
  const pourcent = variationDuDernierMois(valeurs.slice(0, fin));
  return pourcent === null ? null : { pourcent, mois: mois[fin - 1], precedent: mois[fin - 2] };
}

/** Sur la tuile du mois : une variation seulement quand la série ne finit pas sur un mois en cours. */
function variation(mois: readonly string[] | undefined, valeurs: readonly (number | null)[] | undefined, moisEnCours: string | null): ContexteDuChiffre | undefined {
  if (!mois || mois.at(-1) === moisEnCours) return undefined;
  const v = variationDuMoisClos(mois, valeurs, null);
  return v ? { cle: 'variation', pourcent: v.pourcent, mois: v.precedent } : undefined;
}

/** L'occupation dit sa base (AC4, TCK-2626) : sans `eligible_count`, pas de contexte plutôt qu'un faux. */
function baseDOccupation(o: { readonly eligible_count?: number | null; readonly occupied_count?: number | null } | undefined): ContexteDuChiffre | undefined {
  const eligibles = nombre(o?.eligible_count);
  const occupes = nombre(o?.occupied_count);
  return eligibles === null || occupes === null ? undefined : { cle: 'loues', occupes, eligibles };
}

export interface ResumeDAgence {
  readonly properties: { readonly total: number; readonly published: number };
  readonly leases: { readonly active: number };
  readonly finance: {
    readonly revenue_month: number;
    readonly overdue_count: number;
    readonly overdue_amount: number;
    readonly unpaid_rate_percent: number | null;
  };
  readonly occupancy: { readonly rate_percent: number | null; readonly eligible_count?: number | null; readonly occupied_count?: number | null };
  readonly kpis?: readonly { readonly metric: string; readonly label: string; readonly format: 'number' | 'percent' | 'currency'; readonly value: number | null }[];
}

/**
 * L'admin : six chiffres (Encaissé, Impayés, Occupation, Baux actifs, Biens publiés, Taux d'impayés) ; les
 * KPI personnalisés de l'agence (TCK-2373) les remplacent quand elle en a activé, dans leur ordre, avec
 * leur libellé — comme l'ancienne vue d'agence (`AgencyKpis`).
 */
export function chiffresDeLAgence(
  resume: ResumeDAgence,
  series?: { readonly months: readonly string[]; readonly revenue: readonly number[] },
  {
    moisEnCours = null,
    ouvertes = TOUT_OUVERT,
    seuils = {},
  }: { readonly moisEnCours?: string | null; readonly ouvertes?: ListesOuvertes; readonly seuils?: SeuilsDesAlertes } = {},
): ChiffreDuRapport[] {
  const impayes = ouvertes.impayes ? LISTES_DES_CHIFFRES.impayes : LISTES_DES_CHIFFRES.enRetard;
  const configures = resume.kpis ?? [];
  if (configures.length > 0) {
    const FORMES = { number: 'nombre', percent: 'pourcent', currency: 'montant' } as const;
    return configures.map((k) => ({
      cle: `kpi:${k.metric}`,
      libelle: k.label,
      valeur: nombre(k.value),
      forme: FORMES[k.format] ?? 'nombre',
      // TCK-2801 — le seuil suit « Taux d'impayés » aussi quand l'agence a choisi ses chiffres (relevé du 2026-11-14).
      ...(k.metric === 'unpaid_rate_percent' && seuils.unpaid_rate_percent !== undefined
        ? { contexte: { cle: 'seuil' as const, valeur: seuils.unpaid_rate_percent } }
        : {}),
      ...lien(hrefDeLaMetrique(k.metric, ouvertes)),
    }));
  }
  const f = resume.finance;
  const v = variation(series?.months, series?.revenue, moisEnCours);
  return [
    {
      cle: 'encaisse',
      valeur: nombre(f.revenue_month),
      forme: 'montant',
      ...(v ? { contexte: v } : {}),
      ...(v?.cle === 'variation' && v.pourcent !== 0 ? { ton: v.pourcent > 0 ? ('succes' as const) : ('danger' as const) } : {}),
      href: LISTES_DES_CHIFFRES.encaissements,
    },
    {
      cle: 'impayes',
      valeur: nombre(f.overdue_amount),
      forme: 'montant',
      contexte: { cle: 'echeances', n: f.overdue_count },
      ...(f.overdue_count > 0 ? { ton: 'danger' as const } : {}),
      href: impayes,
    },
    {
      cle: 'occupation',
      valeur: nombre(resume.occupancy.rate_percent),
      forme: 'pourcent',
      ...(baseDOccupation(resume.occupancy) ? { contexte: baseDOccupation(resume.occupancy) } : {}),
      href: LISTES_DES_CHIFFRES.biensOccupes,
    },
    { cle: 'bauxActifs', valeur: nombre(resume.leases.active), forme: 'nombre', href: LISTES_DES_CHIFFRES.bauxActifs },
    {
      cle: 'biensPublies',
      valeur: nombre(resume.properties.published),
      forme: 'nombre',
      contexte: { cle: 'publies', total: resume.properties.total },
      href: LISTES_DES_CHIFFRES.biensPublies,
    },
    {
      cle: 'tauxImpayes',
      valeur: nombre(f.unpaid_rate_percent),
      forme: 'pourcent',
      ...(seuils.unpaid_rate_percent !== undefined ? { contexte: { cle: 'seuil' as const, valeur: seuils.unpaid_rate_percent } } : {}),
      href: impayes,
    },
  ];
}

const lien = (href: string | null): { readonly href?: string } => (href ? { href } : {});

/** La liste que compte chaque métrique configurable (`KpiConfig::allowedMetrics`) ; `null` : aucune ouverte. */
function hrefDeLaMetrique(metrique: string, ouvertes: ListesOuvertes): string | null {
  switch (metrique) {
    case 'properties_total':
      return LISTES_DES_CHIFFRES.biens;
    case 'properties_rented':
    case 'occupancy_rate_percent':
      return LISTES_DES_CHIFFRES.biensOccupes;
    case 'leases_active':
      return LISTES_DES_CHIFFRES.bauxActifs;
    case 'revenue_month':
      return LISTES_DES_CHIFFRES.encaissements;
    case 'commission_month':
      return '/app/commissions';
    case 'overdue_count':
    case 'overdue_amount':
    case 'unpaid_rate_percent':
      return ouvertes.impayes ? LISTES_DES_CHIFFRES.impayes : LISTES_DES_CHIFFRES.enRetard;
    case 'customers_count':
      return '/app/customers';
    case 'members_count':
      return ouvertes.equipe ? LISTES_DES_CHIFFRES.equipe : null;
    case 'bookings_pending':
      return '/app/bookings?status=pending';
    case 'maintenance_open':
      return '/app/maintenance';
    default:
      return '/app/reports';
  }
}

export interface ResumeDeLAgent {
  readonly finance?: { readonly commissions_month?: number; readonly commissions_year?: number };
  readonly visits?: { readonly upcoming_7d?: number };
  readonly pipeline?: Readonly<Record<string, number>>;
}

/**
 * L'agent : Commissions, Baux signés, Visites, Prospects. « Baux signés » se lit sur la série (le dernier
 * mois, et la somme des mois de l'année en cours) ; « Prospects » est la somme des étapes ouvertes du
 * pipeline (ni converti ni perdu).
 */
export function chiffresDeLAgent(
  resume: ResumeDeLAgent,
  series: { readonly months: readonly string[]; readonly signed_leases?: readonly number[] } | undefined,
  agence: boolean,
): ChiffreDuRapport[] {
  const signes = series?.signed_leases ?? [];
  const annee = series?.months.at(-1)?.slice(0, 4);
  const cetteAnnee = series?.months.reduce((s, m, i) => (m.slice(0, 4) === annee ? s + (signes[i] ?? 0) : s), 0) ?? 0;
  const ouverts = Object.entries(resume.pipeline ?? {})
    .filter(([etape]) => etape !== 'converted' && etape !== 'lost')
    .reduce((s, [, n]) => s + (nombre(n) ?? 0), 0);
  return [
    {
      cle: 'commissions',
      valeur: nombre(resume.finance?.commissions_month),
      forme: 'montant',
      ...(nombre(resume.finance?.commissions_year) !== null
        ? { contexte: { cle: 'cetteAnnee' as const, montant: nombre(resume.finance?.commissions_year) ?? 0 } }
        : {}),
      href: LISTES_DES_CHIFFRES.commissions + (agence ? '?scope=agency' : ''),
    },
    {
      cle: 'bauxSignes',
      valeur: signes.length ? (signes[signes.length - 1] ?? 0) : null,
      forme: 'nombre',
      contexte: { cle: 'bauxCetteAnnee', n: cetteAnnee },
      href: LISTES_DES_CHIFFRES.bauxSignes,
    },
    { cle: 'visites', valeur: nombre(resume.visits?.upcoming_7d), forme: 'nombre', contexte: { cle: 'septJours' }, href: LISTES_DES_CHIFFRES.visites },
    { cle: 'prospects', valeur: ouverts, forme: 'nombre', href: LISTES_DES_CHIFFRES.pipeline + (agence ? '?scope=agency' : '') },
  ];
}

export interface ResumeDuBailleur {
  readonly portfolio?: { readonly total?: number; readonly rented?: number; readonly available?: number };
  readonly leases?: { readonly active?: number };
  readonly finance?: { readonly cashflow_month?: number; readonly expected_monthly?: number; readonly overdue_count?: number; readonly overdue_amount?: number };
  readonly occupancy?: { readonly rate_percent: number | null; readonly eligible_count?: number | null; readonly occupied_count?: number | null };
}

/**
 * Le bailleur et l'hôte : le portefeuille (loués, libres, autres), puis Occupation — AVEC sa base, jamais
 * « 100 % » à côté de « 54 disponibles » sans elle (AC4) —, Encaissé (sur l'attendu), Impayés et Baux actifs
 * (un chiffre de l'ancienne vue : il ne se perd pas).
 */
export function chiffresDuBailleur(resume: ResumeDuBailleur): ChiffreDuRapport[] {
  const total = nombre(resume.portfolio?.total) ?? 0;
  const loues = nombre(resume.portfolio?.rented) ?? 0;
  const libres = nombre(resume.portfolio?.available) ?? 0;
  const enRetard = nombre(resume.finance?.overdue_count) ?? 0;
  const attendu = nombre(resume.finance?.expected_monthly);
  const base = baseDOccupation(resume.occupancy);
  return [
    {
      cle: 'portefeuille',
      valeur: total,
      forme: 'biens',
      contexte: { cle: 'portefeuille', loues, libres, autres: Math.max(total - loues - libres, 0) },
      href: LISTES_DES_CHIFFRES.biens,
    },
    {
      cle: 'occupation',
      // Sans base, pas de taux : « 100 % » seul est précisément ce que l'AC4 interdit.
      valeur: base ? nombre(resume.occupancy?.rate_percent) : null,
      forme: 'pourcent',
      ...(base ? { contexte: base } : {}),
      href: LISTES_DES_CHIFFRES.biensOccupes,
    },
    {
      cle: 'encaisse',
      valeur: nombre(resume.finance?.cashflow_month),
      forme: 'montant',
      ...(attendu ? { contexte: { cle: 'surAttendus' as const, montant: attendu } } : {}),
      href: LISTES_DES_CHIFFRES.encaissements,
    },
    {
      cle: 'impayes',
      valeur: nombre(resume.finance?.overdue_amount),
      forme: 'montant',
      contexte: { cle: 'echeances', n: enRetard },
      ...(enRetard > 0 ? { ton: 'danger' as const } : {}),
      href: LISTES_DES_CHIFFRES.enRetard,
    },
    { cle: 'bauxActifs', valeur: nombre(resume.leases?.active), forme: 'nombre', href: LISTES_DES_CHIFFRES.bauxActifs },
  ];
}
