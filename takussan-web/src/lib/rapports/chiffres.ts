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
  /** TCK-2791 — sous « Mois dernier » : le mois servi n'est plus « ce mois », ni son année forcément « cette année ». */
  | { readonly cle: 'bauxDuMoisDernier'; readonly n: number; readonly annee: string }
  | { readonly cle: 'enAnnee'; readonly montant: number; readonly annee: string }
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
  /**
   * TCK-2791 — sous « Mois dernier », le chiffre est l'état du JOUR (l'API le liste dans `period.as_of_today`) :
   * la tuile le dit, pour qu'aucun écran ne présente l'état d'aujourd'hui comme celui du mois dernier.
   */
  readonly aujourdhui?: boolean;
}

/**
 * TCK-2791 — les chemins à marquer « aujourd'hui » : ceux que l'API sert comme état du jour, sous `last_month`
 * seulement (sous le mois en cours, tout est « de ce mois » et rien ne se marque). `null` : aucun marquage.
 */
export function etatsDuJourAMarquer(periode: { readonly key?: string; readonly as_of_today?: readonly string[] } | undefined): readonly string[] | null {
  return periode?.key === 'last_month' ? (periode.as_of_today ?? []) : null;
}

/** La marque « aujourd'hui » d'un chiffre lu au chemin `chemin` de la réponse. */
const duJour = (etats: readonly string[] | null | undefined, chemin: string): { readonly aujourdhui?: true } =>
  etats?.includes(chemin) ? { aujourdhui: true } : {};

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

/**
 * Sur la tuile du mois : une variation seulement quand le mois SERVI est clos. TCK-2791 — sous « Mois dernier »,
 * le mois servi (`moisServi`) n'est pas le dernier point de la série, qui finit sur le mois en cours : la série est
 * coupée au mois servi avant de comparer, jamais le mois en cours comparé à lui.
 */
function variation(
  mois: readonly string[] | undefined,
  valeurs: readonly (number | null)[] | undefined,
  moisEnCours: string | null,
  moisServi: string | null = null,
): ContexteDuChiffre | undefined {
  if (!mois || !valeurs) return undefined;
  const fin = moisServi ? mois.indexOf(moisServi) + 1 : mois.length;
  if (fin < 1 || mois[fin - 1] === moisEnCours) return undefined;
  const v = variationDuMoisClos(mois.slice(0, fin), valeurs.slice(0, fin), null);
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
  readonly kpis?: readonly {
    readonly metric: string;
    readonly label: string;
    readonly format: 'number' | 'percent' | 'currency';
    readonly value: number | null;
    /** TCK-2791 — la métrique est l'état du jour. */
    readonly as_of_today?: boolean;
  }[];
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
    moisServi = null,
    etatsDuJour = null,
    ouvertes = TOUT_OUVERT,
    seuils = {},
  }: {
    /** Le mois en cours (`moisCourant()`), jamais le mois servi : c'est lui qui n'est pas clos. */
    readonly moisEnCours?: string | null;
    /** TCK-2791 — le mois que l'API résume (`period.start`) ; sans lui, le dernier de la série. */
    readonly moisServi?: string | null;
    readonly etatsDuJour?: readonly string[] | null;
    readonly ouvertes?: ListesOuvertes;
    readonly seuils?: SeuilsDesAlertes;
  } = {},
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
      ...(etatsDuJour && k.as_of_today ? { aujourdhui: true as const } : {}),
    }));
  }
  const f = resume.finance;
  const v = variation(series?.months, series?.revenue, moisEnCours, moisServi);
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
      ...duJour(etatsDuJour, 'finance.overdue_amount'),
    },
    {
      cle: 'occupation',
      valeur: nombre(resume.occupancy.rate_percent),
      forme: 'pourcent',
      ...(baseDOccupation(resume.occupancy) ? { contexte: baseDOccupation(resume.occupancy) } : {}),
      href: LISTES_DES_CHIFFRES.biensOccupes,
      ...duJour(etatsDuJour, 'occupancy.rate_percent'),
    },
    { cle: 'bauxActifs', valeur: nombre(resume.leases.active), forme: 'nombre', href: LISTES_DES_CHIFFRES.bauxActifs, ...duJour(etatsDuJour, 'leases.active') },
    {
      cle: 'biensPublies',
      valeur: nombre(resume.properties.published),
      forme: 'nombre',
      contexte: { cle: 'publies', total: resume.properties.total },
      href: LISTES_DES_CHIFFRES.biensPublies,
      ...duJour(etatsDuJour, 'properties.published'),
    },
    {
      cle: 'tauxImpayes',
      valeur: nombre(f.unpaid_rate_percent),
      forme: 'pourcent',
      ...(seuils.unpaid_rate_percent !== undefined ? { contexte: { cle: 'seuil' as const, valeur: seuils.unpaid_rate_percent } } : {}),
      href: impayes,
      ...duJour(etatsDuJour, 'finance.unpaid_rate_percent'),
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
  {
    moisServi = null,
    etatsDuJour = null,
  }: {
    /** TCK-2791 — le mois que l'API résume ; « Baux signés » se lit à son point de la série, pas au dernier. */
    readonly moisServi?: string | null;
    readonly etatsDuJour?: readonly string[] | null;
  } = {},
): ChiffreDuRapport[] {
  const signes = series?.signed_leases ?? [];
  const mois = series?.months ?? [];
  const rang = moisServi && mois.includes(moisServi) ? mois.indexOf(moisServi) : mois.length - 1;
  const annee = mois[rang]?.slice(0, 4) ?? '';
  // Le cumul de l'année du mois lu, jusqu'à lui : sous « Mois dernier », pas le mois en cours.
  const cetteAnnee = mois.reduce((s, m, i) => (i <= rang && m.slice(0, 4) === annee ? s + (signes[i] ?? 0) : s), 0);
  const passe = etatsDuJour !== null;
  // La série a 12 mois et finit sur le mois en cours : sous « Mois dernier » en janvier, elle commence en février de
  // l'année servie, dont janvier manque. Un cumul qui ne voit pas janvier ne se dit pas.
  const anneeEntiere = mois.includes(`${annee}-01`);
  const ouverts = Object.entries(resume.pipeline ?? {})
    .filter(([etape]) => etape !== 'converted' && etape !== 'lost')
    .reduce((s, [, n]) => s + (nombre(n) ?? 0), 0);
  return [
    {
      cle: 'commissions',
      valeur: nombre(resume.finance?.commissions_month),
      forme: 'montant',
      ...(nombre(resume.finance?.commissions_year) !== null
        ? {
            contexte: passe
              ? { cle: 'enAnnee' as const, montant: nombre(resume.finance?.commissions_year) ?? 0, annee }
              : { cle: 'cetteAnnee' as const, montant: nombre(resume.finance?.commissions_year) ?? 0 },
          }
        : {}),
      href: LISTES_DES_CHIFFRES.commissions + (agence ? '?scope=agency' : ''),
    },
    {
      cle: 'bauxSignes',
      valeur: signes.length && rang >= 0 ? (signes[rang] ?? 0) : null,
      forme: 'nombre',
      ...(passe && !anneeEntiere
        ? {}
        : { contexte: passe ? { cle: 'bauxDuMoisDernier' as const, n: cetteAnnee, annee } : { cle: 'bauxCetteAnnee' as const, n: cetteAnnee } }),
      href: LISTES_DES_CHIFFRES.bauxSignes,
    },
    {
      cle: 'visites',
      valeur: nombre(resume.visits?.upcoming_7d),
      forme: 'nombre',
      contexte: { cle: 'septJours' },
      href: LISTES_DES_CHIFFRES.visites,
      ...duJour(etatsDuJour, 'visits.upcoming_7d'),
    },
    { cle: 'prospects', valeur: ouverts, forme: 'nombre', href: LISTES_DES_CHIFFRES.pipeline + (agence ? '?scope=agency' : ''), ...duJour(etatsDuJour, 'pipeline') },
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
export function chiffresDuBailleur(
  resume: ResumeDuBailleur,
  { etatsDuJour = null }: { readonly etatsDuJour?: readonly string[] | null } = {},
): ChiffreDuRapport[] {
  const total = nombre(resume.portfolio?.total) ?? 0;
  const loues = nombre(resume.portfolio?.rented) ?? 0;
  const libres = nombre(resume.portfolio?.available) ?? 0;
  const enRetard = nombre(resume.finance?.overdue_count) ?? 0;
  // TCK-2791 — l'attendu est le loyer des baux en cours AUJOURD'HUI : sous « Mois dernier », pas de « sur … attendus ».
  const attendu = etatsDuJour?.includes('finance.expected_monthly') ? null : nombre(resume.finance?.expected_monthly);
  const base = baseDOccupation(resume.occupancy);
  return [
    {
      cle: 'portefeuille',
      valeur: total,
      forme: 'biens',
      contexte: { cle: 'portefeuille', loues, libres, autres: Math.max(total - loues - libres, 0) },
      href: LISTES_DES_CHIFFRES.biens,
      ...duJour(etatsDuJour, 'portfolio.total'),
    },
    {
      cle: 'occupation',
      // Sans base, pas de taux : « 100 % » seul est précisément ce que l'AC4 interdit.
      valeur: base ? nombre(resume.occupancy?.rate_percent) : null,
      forme: 'pourcent',
      ...(base ? { contexte: base } : {}),
      href: LISTES_DES_CHIFFRES.biensOccupes,
      ...duJour(etatsDuJour, 'occupancy.rate_percent'),
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
      ...duJour(etatsDuJour, 'finance.overdue_amount'),
    },
    { cle: 'bauxActifs', valeur: nombre(resume.leases?.active), forme: 'nombre', href: LISTES_DES_CHIFFRES.bauxActifs, ...duJour(etatsDuJour, 'leases.active') },
  ];
}
