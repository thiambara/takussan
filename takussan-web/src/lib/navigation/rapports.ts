import type { CheminAdmin } from '@/lib/access/pages-admin';

import { PERSONAS_DU_PERSONNEL, type CodeDeModule } from './modules';
import type { Persona } from './personas';

/**
 * TCK-2628 (ADR-0096 § 3, ADR-0089 amendement du 2026-11-10 § 2 et § 3) — les onglets de « Rapports » :
 * des SOUS-DESTINATIONS déclarées à côté du catalogue, avec leur prédicat d'accès. Une seule table, lue
 * par la barre d'onglets, la garde de chaque onglet, les redirections des anciennes adresses, l'entrée
 * « Rapports » du catalogue et le test « aucune destination perdue ».
 *
 * L'adresse est la donnée (une URL par onglet, partageable) ; le libellé se lit sous `rapports.onglets`.
 */
export const ONGLETS_DES_RAPPORTS = {
  ensemble: { href: '/app/reports' },
  equipe: { href: '/app/reports/team' },
  impayes: { href: '/app/reports/unpaid' },
  commissions: { href: '/app/reports/commissions' },
  pipeline: { href: '/app/reports/pipeline' },
  reversements: { href: '/app/reports/payouts' },
  exports: { href: '/app/reports/exports' },
  alertes: { href: '/app/reports/alerts' },
} as const satisfies Record<string, { readonly href: string }>;

export type IdOnglet = keyof typeof ONGLETS_DES_RAPPORTS;

/**
 * Les onglets de chaque persona, DANS CET ORDRE (ADR-0096 § 3). Une persona absente n'a pas de
 * « Rapports » : le locataire, le client et le prestataire (§ 3, spec § 2.5).
 *
 * - `hote` garde « Alertes » : l'admin d'une agence `individual` ouvrait Indicateurs et Alertes
 *   (TCK-284, `docs/features.md` § 2.5 : « disponibles aussi en agence individual ») — écart avec la
 *   table d'ADR-0096, validé le 2026-11-13 (décision 1 a de TCK-2628), à porter dans l'ADR.
 * - `plateforme` (super-admin dans `/app`) garde ce qu'il ouvrait : la vue d'agence, Exports et
 *   Alertes ; ni Équipe ni Impayés, deux écrans d'admin d'agence qu'il n'avait pas.
 */
export const ONGLETS_PAR_PERSONA: Readonly<Partial<Record<Persona, readonly IdOnglet[]>>> = {
  'admin-agence': ['ensemble', 'equipe', 'impayes', 'exports', 'alertes'],
  agent: ['ensemble', 'commissions', 'pipeline', 'exports'],
  bailleur: ['ensemble', 'reversements', 'exports'],
  hote: ['ensemble', 'reversements', 'exports', 'alertes'],
  plateforme: ['ensemble', 'exports', 'alertes'],
};

/**
 * Les modules d'agence qui masquent un onglet (amendement du 2026-11-10 § 3). La vue d'ensemble n'est
 * pas masquable. `commissions` masque aussi l'analyse des commissions de l'agent : une agence qui ne
 * rémunère pas à la commission n'en a pas à analyser.
 */
export const MODULE_DE_L_ONGLET: Readonly<Partial<Record<IdOnglet, CodeDeModule>>> = {
  exports: 'analytics',
  alertes: 'analytics',
  commissions: 'commissions',
};

/**
 * « Indicateurs » (`KpiConfigList`) n'est pas un onglet : on y arrive par « Personnaliser les chiffres »
 * de la vue d'ensemble, en attendant le réglage sur la page (TCK-2629). Mêmes ayants droit que l'ancienne
 * page (`isAdmin`, TCK-284 : agence `individual` comprise), masqué par `analytics`.
 */
// Écrite comme les onglets (`{ href: … }`) : `routes-atteignables.test.ts` reconnaît un chemin entrant à un
// littéral posé sur une ligne qui produit un lien, et la page n'a pas d'autre entrée que « Personnaliser ».
const INDICATEURS = { href: '/app/reports/indicators' } as const;
export const PAGE_DES_INDICATEURS = INDICATEURS.href;
const PERSONAS_DES_INDICATEURS: ReadonlySet<Persona> = new Set<Persona>(['admin-agence', 'hote', 'plateforme']);

/**
 * Équipe et Impayés montent le composant d'une page d'administration (décision 2 de TCK-2628) : ils en
 * gardent la garde (contrainte « chaque onglet garde la garde de la page qu'il remplace »). La page
 * d'abord, jugée par `PAGES_ADMIN` (rôle, `kind` de l'agence, capacités) ; puis la capacité sans laquelle
 * le composant n'est pas offert dans sa page — la performance de l'équipe ne s'y montre que sous
 * `reports.view_agency` (`ConsoleDeLEquipe`), comme l'API qui la sert.
 */
export const PAGE_D_ORIGINE_DE_L_ONGLET: Readonly<
  Partial<Record<IdOnglet, { readonly chemin: CheminAdmin; readonly capacite?: string }>>
> = {
  equipe: { chemin: '/app/agency/team', capacite: 'reports.view_agency' },
  impayes: { chemin: '/app/agency/finances' },
};

export interface ContexteDesRapports {
  readonly persona: Persona;
  /** Les modules que l'agence du profil actif masque (`modulesMasquesDe`) ; ils ne s'appliquent qu'au personnel (TCK-2483). */
  readonly modulesMasques?: readonly CodeDeModule[];
  /**
   * Les pages d'administration que ce compte ouvre (`accesAdmin(user).chemins`) et ses capacités sous
   * le profil actif (`null` : illisibles). Absentes ou illisibles, Équipe et Impayés sont FERMÉS : un
   * onglet qu'on ne sait pas ouvrir n'est pas rendu.
   */
  readonly cheminsAdmin?: readonly string[];
  readonly capacites?: readonly string[] | null;
}

function masque(module: CodeDeModule | undefined, { persona, modulesMasques = [] }: ContexteDesRapports): boolean {
  return module !== undefined && PERSONAS_DU_PERSONNEL.has(persona) && modulesMasques.includes(module);
}

function pageDOrigineOuverte(id: IdOnglet, { cheminsAdmin = [], capacites = null }: ContexteDesRapports): boolean {
  const origine = PAGE_D_ORIGINE_DE_L_ONGLET[id];
  if (!origine) return true;
  if (!cheminsAdmin.includes(origine.chemin)) return false;
  return origine.capacite === undefined || (capacites ?? []).includes(origine.capacite);
}

/** Les onglets que cette persona ouvre, dans leur ordre ; `[]` : pas de « Rapports ». */
export function ongletsDesRapports(contexte: ContexteDesRapports): IdOnglet[] {
  return (ONGLETS_PAR_PERSONA[contexte.persona] ?? []).filter(
    (id) => !masque(MODULE_DE_L_ONGLET[id], contexte) && pageDOrigineOuverte(id, contexte),
  );
}

/**
 * L'onglet est-il dans la table de cette persona ? C'est ce que juge la GARDE d'un onglet, avant la page
 * d'origine : un agent sur `/app/reports/team` retourne à sa vue d'ensemble, au lieu d'être jugé par une
 * page d'administration qu'il n'a jamais eue.
 *
 * ⚠ Sans le masque des modules : il ne retire que l'onglet de la BARRE (amendement du 2026-11-10 d'ADR-0089,
 * § 3 — « les gardes et l'API ne lisent toujours pas » le masque) ; l'adresse de l'onglet s'ouvre.
 */
export function ongletDeLaPersona(id: IdOnglet, persona: Persona): boolean {
  return (ONGLETS_PAR_PERSONA[persona] ?? []).includes(id);
}

/** La page des indicateurs est-elle de cette persona ? (garde, donc sans le masque : cf. `ongletDeLaPersona`) */
export function indicateursDeLaPersona(persona: Persona): boolean {
  return PERSONAS_DES_INDICATEURS.has(persona);
}

export function ongletOuvert(id: IdOnglet, contexte: ContexteDesRapports): boolean {
  return ongletsDesRapports(contexte).includes(id);
}

export function indicateursOuverts(contexte: ContexteDesRapports): boolean {
  return PERSONAS_DES_INDICATEURS.has(contexte.persona) && !masque('analytics', contexte);
}

/**
 * L'entrée « Rapports » du menu, et la section : tant qu'il reste un onglet. La vue d'ensemble n'est ni
 * masquable ni soumise à une page d'origine : c'est la table de la persona qui décide, sans le masque.
 */
export function rapportsOuverts(contexte: ContexteDesRapports): boolean {
  return ongletDeLaPersona('ensemble', contexte.persona);
}

/**
 * L'onglet d'une adresse de `/app/reports/**` (préfixe le plus long) : la barre l'allume. `null` hors de
 * Rapports ; la page des indicateurs n'allume aucun onglet.
 */
export function ongletDeLAdresse(chemin: string): IdOnglet | null {
  let trouve: IdOnglet | null = null;
  for (const [id, { href }] of Object.entries(ONGLETS_DES_RAPPORTS) as [IdOnglet, { href: string }][]) {
    if ((chemin === href || chemin.startsWith(`${href}/`)) && (!trouve || href.length > ONGLETS_DES_RAPPORTS[trouve].href.length)) {
      trouve = id;
    }
  }
  return chemin.startsWith(PAGE_DES_INDICATEURS) ? null : trouve;
}

/** Les anciennes adresses (ADR-0096 § 4) et ce qu'elles visaient. */
export const ANCIENNES_ADRESSES = [
  '/app/overview',
  '/app/overview/agency',
  '/app/overview/agent',
  '/app/overview/owner',
  '/app/overview/kpis',
  '/app/overview/alerts',
  '/app/overview/exports',
] as const;

export type AncienneAdresse = (typeof ANCIENNES_ADRESSES)[number];

/** La seule portée qu'une adresse transmet : `agency` (la vue personnelle est le défaut). */
export function porteeTransmise(scope: string | string[] | null | undefined): 'agency' | null {
  return scope === 'agency' ? 'agency' : null;
}

/**
 * Les onglets de l'agent qui lisent `GET /api/dashboard/agent` et sa portée (`?scope=agency`, sous
 * `reports.view_agency`) : la barre la leur transmet, pour qu'on passe de la vue d'ensemble aux
 * commissions sans perdre « Agence ». Exports n'en a pas.
 */
const ONGLETS_A_PORTEE: ReadonlySet<IdOnglet> = new Set<IdOnglet>(['ensemble', 'commissions', 'pipeline']);

export function hrefDeLOnglet(id: IdOnglet, portee: 'agency' | null = null): string {
  const href = ONGLETS_DES_RAPPORTS[id].href;
  return portee && ONGLETS_A_PORTEE.has(id) ? `${href}?scope=${portee}` : href;
}

/**
 * Où mène une ancienne adresse (ADR-0096 § 4) : l'onglet équivalent, avec la portée ; un onglet masqué
 * ou interdit mène à la vue d'ensemble ; une persona sans « Rapports » est menée à `/app`.
 *
 * La portée n'est portée que vers la vue d'ensemble de l'agent : la page juge elle-même la capacité
 * (`reports.view_agency`) et retombe sur « Moi » sans elle.
 */
export function cibleDeLAncienneAdresse(
  adresse: AncienneAdresse,
  contexte: ContexteDesRapports,
  params: { readonly scope?: string | string[] } = {},
): string {
  if (!rapportsOuverts(contexte)) return '/app';
  const ensemble = ONGLETS_DES_RAPPORTS.ensemble.href;
  switch (adresse) {
    case '/app/overview/kpis':
      return indicateursOuverts(contexte) ? PAGE_DES_INDICATEURS : ensemble;
    case '/app/overview/alerts':
      return ongletOuvert('alertes', contexte) ? ONGLETS_DES_RAPPORTS.alertes.href : ensemble;
    case '/app/overview/exports':
      return ongletOuvert('exports', contexte) ? ONGLETS_DES_RAPPORTS.exports.href : ensemble;
    default: {
      const portee = contexte.persona === 'agent' ? porteeTransmise(params.scope) : null;
      return portee ? `${ensemble}?scope=${portee}` : ensemble;
    }
  }
}
