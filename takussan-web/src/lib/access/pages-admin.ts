import {
  Briefcase,
  Building2,
  CreditCard,
  FileText,
  KeyRound,
  Plug,
  Shield,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { isAdmin, isSuperAdmin } from '@/lib/roles';
import type { AgencyKind } from '@/types/agency';
import type { UserRole } from '@/types/user';

/**
 * TCK-633 (lot B, AC1) — LA table des pages d'administration d'agence. Il n'y en a qu'une.
 *
 * TCK-649 (ADR-0064 §1, §2) — ces pages vivent sous `/app/agency/*`, dans la coque de `/app`. Seuls
 * les chemins ont changé : aucune exigence n'a bougé.
 *
 * Avant ce ticket, la même question — « cette page est-elle pour vous ? » — avait cinq réponses
 * écrites séparément : `buildAdminItems` (le menu), `PRO_ROUTES` (le cadenas), l'`isAdmin` du menu
 * utilisateur, les liens codés en dur de la carte du profil et des raccourcis, et la garde de chaque
 * page. Elles divergeaient : un admin d'agence `individual` voyait « Administration » partout, et
 * chaque clic le renvoyait sur `/app`. *Un lien qui mène à une redirection est une porte peinte sur
 * un mur.*
 *
 * Tout ce qui montre ou garde une page d'administration dérive désormais de cette table : la section
 * d'agence du menu de `/app` (`entreesDeMenu`, `entreeAdmin` pour son titre « Administration » /
 * « Mon espace »), les raccourcis, la carte du profil (`liensDuProfil`) et la garde serveur
 * (`garderPageAdmin`, `./pages-admin-server`). `scripts/check-pro-routes.mjs` vérifie que chaque
 * `page.tsx` de `app/(dashboard)/app/agency` appelle la garde de SON chemin.
 *
 * ⚠ La table DÉCIDE de l'écran, jamais de la donnée : chaque API rejuge (`AgencyKindGuard`,
 * policies). Les exigences sont écrites pour suivre l'API, pas pour la remplacer.
 */

export interface ExigenceAdmin {
  /** `admin` : `agency_admin` ou `super_admin` (`isAdmin`). `super_admin` : lui seul. */
  readonly role: 'admin' | 'super_admin';
  /** `standard` : refusée à une agence `individual` ET à un `kind` qu'on n'a pas pu lire. */
  readonly agence?: 'standard';
  /** Une valeur de `App\Models\Enums\Capability`, jugée sur `GET /api/me/capabilities`. */
  readonly capacite?: string;
}

export interface PageAdmin {
  readonly chemin: string;
  readonly exige: ExigenceAdmin;
  /** Place dans la section d'agence d'`AppSidebar` — `cle` sous `nav.admin`. `null` : page atteinte par un lien de page. */
  readonly menu: { readonly cle: string; readonly icone: LucideIcon } | null;
  /** Lien de la carte « Administration » du profil — clé sous `profile.admin`. */
  readonly profil?: 'manageAgency' | 'auditLog';
}

/** L'ORDRE est celui du menu (celui de `buildAdminItems` avant TCK-633, à l'identique). */
const TABLE = [
  // TCK-647 (ADR-0064 §3) — le tableau de bord de l'agence n'est pas dans cette table : c'est
  // `/app/overview/agency`, gardé par son propre layout.
  { chemin: '/app/agency/team', exige: { role: 'admin', agence: 'standard' }, menu: { cle: 'team', icone: Users } },
  // TCK-279 — juste sous « Équipe » : on attribue un rôle là, on le définit ici.
  { chemin: '/app/agency/roles', exige: { role: 'admin', agence: 'standard' }, menu: { cle: 'roles', icone: KeyRound } },
  {
    chemin: '/app/agency',
    exige: { role: 'admin' },
    menu: { cle: 'agency', icone: Briefcase },
    profil: 'manageAgency',
  },
  { chemin: '/app/agency/kyc', exige: { role: 'admin' }, menu: { cle: 'kyc', icone: ShieldCheck } },
  // TCK-594 (AC18) — l'hôte individuel y lit ses reversements ; l'API les garde par
  // `agency.update_billing` (`AgencyPolicy::viewPlatformPayouts`). Le bloc d'abonnement, lui, reste
  // `standard` : c'est la page qui en décide.
  {
    chemin: '/app/agency/billing',
    exige: { role: 'admin', capacite: 'agency.update_billing' },
    menu: { cle: 'billing', icone: CreditCard },
  },
  { chemin: '/app/agency/finances', exige: { role: 'admin' }, menu: { cle: 'finances', icone: CreditCard } },
  // TCK-593 — le rapprochement vit SOUS les finances : un lien de la page, pas une entrée de menu.
  // Le détail `[statementId]` est gardé par ce chemin-ci, son plus proche ancêtre statique.
  { chemin: '/app/agency/finances/reconciliation', exige: { role: 'admin' }, menu: null },
  // TCK-597 (ADR-0043 §1) — l'admin d'agence `standard` modère les avis de SON agence.
  {
    chemin: '/app/agency/moderation',
    exige: { role: 'admin', agence: 'standard' },
    menu: { cle: 'reviewModeration', icone: Shield },
  },
  // TCK-098 — la modération des biens.
  {
    chemin: '/app/agency/moderation/properties',
    exige: { role: 'admin', agence: 'standard' },
    menu: { cle: 'propertyModeration', icone: Building2 },
  },
  {
    chemin: '/app/agency/audit',
    exige: { role: 'admin', agence: 'standard' },
    menu: { cle: 'auditLog', icone: FileText },
    profil: 'auditLog',
  },
  // TCK-370 — `routes/api/integrations.php` ne pose qu'`auth:sanctum`, et `IntegrationController`
  // laisse entrer un `agency_admin` sur SON agence.
  { chemin: '/app/agency/integrations', exige: { role: 'admin' }, menu: { cle: 'integrations', icone: Plug } },
  // TCK-648 (ADR-0064 §1) — les deux pages du super-admin ont quitté cette table :
  // `/super-admin/properties` et `/super-admin/settings/global`.
] as const satisfies readonly PageAdmin[];

export type CheminAdmin = (typeof TABLE)[number]['chemin'];

export const PAGES_ADMIN: readonly (PageAdmin & { readonly chemin: CheminAdmin })[] = TABLE;

/**
 * Ce qu'on sait du profil actif.
 *
 *  · `agence: null` — aucune agence rattachée : l'exigence `standard` ne bloque pas (même règle
 *    que `AgencyKindGuard::ensureStandardForNonGlobal` côté API, et qu'`ensureStandardAgencyOrRedirect`
 *    avant ce ticket).
 *  · `agence: { kind: null }` — une agence dont on n'a PAS PU lire le `kind` : refus. *Un écran
 *    réservé se refuse quand on ne sait pas, pas seulement quand on sait que non.*
 *  · `capacites: null` — capacités inconnues : refus de toute page qui en exige une.
 */
export interface ContexteAdmin {
  readonly roles: UserRole[];
  readonly agence: { readonly kind: AgencyKind | null } | null;
  readonly capacites: readonly string[] | null;
}

export function pageAccessible(page: PageAdmin, ctx: ContexteAdmin): boolean {
  const superAdmin = isSuperAdmin(ctx.roles);
  if (page.exige.role === 'super_admin') return superAdmin;
  if (!isAdmin(ctx.roles)) return false;
  // Le super-admin passe l'agence et la capacité, comme côté API.
  if (superAdmin) return true;
  if (page.exige.agence === 'standard' && ctx.agence !== null && ctx.agence.kind !== 'standard') {
    return false;
  }
  if (page.exige.capacite !== undefined && !(ctx.capacites ?? []).includes(page.exige.capacite)) {
    return false;
  }
  return true;
}

/** Ce qui descend aux composants : sérialisable, sans fonction ni icône. */
export interface AccesAdmin {
  /** Les chemins accessibles, dans l'ordre de la table. */
  readonly chemins: readonly CheminAdmin[];
  /** Admin d'une agence `individual` (pas un super-admin) : on lui parle de « son espace ». */
  readonly espaceIndividuel: boolean;
}

export function accesDepuis(ctx: ContexteAdmin): AccesAdmin {
  return {
    chemins: PAGES_ADMIN.filter((page) => pageAccessible(page, ctx)).map((page) => page.chemin),
    espaceIndividuel:
      isAdmin(ctx.roles) && !isSuperAdmin(ctx.roles) && ctx.agence?.kind === 'individual',
  };
}

export interface EntreeAdmin {
  readonly href: CheminAdmin;
  /** Clé sous `nav.admin`. */
  readonly cle: 'sectionLabel' | 'mySpace';
}

/** LE lien vers l'administration : la première page accessible, ou rien. */
export function entreeAdmin(acces: AccesAdmin): EntreeAdmin | null {
  const premier = acces.chemins[0];
  if (premier === undefined) return null;
  return { href: premier, cle: acces.espaceIndividuel ? 'mySpace' : 'sectionLabel' };
}

export function pageAdmin(chemin: string): (PageAdmin & { readonly chemin: CheminAdmin }) | undefined {
  return PAGES_ADMIN.find((page) => page.chemin === chemin);
}

export interface EntreeDeMenu {
  readonly chemin: CheminAdmin;
  /** Clé sous `nav.admin`. */
  readonly cle: string;
  readonly icone: LucideIcon;
}

export function entreesDeMenu(acces: AccesAdmin): EntreeDeMenu[] {
  const sortie: EntreeDeMenu[] = [];
  for (const page of PAGES_ADMIN) {
    if (page.menu !== null && acces.chemins.includes(page.chemin)) {
      sortie.push({ chemin: page.chemin, cle: page.menu.cle, icone: page.menu.icone });
    }
  }
  return sortie;
}

export interface LienDuProfil {
  readonly chemin: CheminAdmin;
  /** Clé sous `profile.admin`. */
  readonly cle: 'manageAgency' | 'auditLog';
}

export function liensDuProfil(acces: AccesAdmin): LienDuProfil[] {
  const sortie: LienDuProfil[] = [];
  for (const page of PAGES_ADMIN) {
    if (page.profil !== undefined && acces.chemins.includes(page.chemin)) {
      sortie.push({ chemin: page.chemin, cle: page.profil });
    }
  }
  return sortie;
}

export interface RepliAdmin {
  readonly roles: UserRole[];
  /** `null` : aucune agence rattachée. `undefined` : non transmis — le `kind` vient du drapeau. */
  readonly agencyId?: number | null;
  /** `true` standard, `false` individual, `undefined` inconnu. */
  readonly agencyIsStandard?: boolean;
}

/**
 * Le contexte qu'un composant client peut déduire SANS fournisseur — fail-closed : capacités
 * toujours inconnues, `kind` inconnu tant que le drapeau ne le dit pas.
 */
export function contexteDeRepli({ roles, agencyId, agencyIsStandard }: RepliAdmin): ContexteAdmin {
  if (agencyId === null) return { roles, agence: null, capacites: null };
  const kind: AgencyKind | null =
    agencyIsStandard === true ? 'standard' : agencyIsStandard === false ? 'individual' : null;
  return { roles, agence: { kind }, capacites: null };
}
