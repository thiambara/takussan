import { USER_ROLES, type UserRole } from '@/types/user';

/**
 * TCK-278 — Le champ `roles` exposé par l'API (`UserResource`) est désormais
 * dérivé des profils polymorphes du user (cf. Règle 5 du models-spec :
 * « profil = rôle »). Le contrat HTTP est inchangé (array de strings), donc
 * les helpers ci-dessous restent valides. Pour les vues admin détaillées,
 * `UserDetailResource` expose en plus `admin_role_rows` avec `(name, team_id)`
 * où `team_id` = `agency_id` du profil polymorphe.
 */

export function isAgent(roles: UserRole[]): boolean {
  return roles.includes('agent');
}

export function isOwner(roles: UserRole[]): boolean {
  return roles.includes('owner');
}

export function isCustomer(roles: UserRole[]): boolean {
  return roles.includes('customer');
}

/**
 * TCK-492 — les deux rôles DÉRIVÉS d'un état, par opposition aux six autres qui
 * correspondent à un profil polymorphe en base.
 *
 * `PROFESSIONAL_ROLES` s'en déduit par SOUSTRACTION plutôt que d'être une
 * seconde liste écrite à la main : ajouter un profil côté back l'ajoute à
 * `USER_ROLES` (la garde de parité y veille), et il devient professionnel ici
 * sans qu'on ait à y penser. *Une liste recopiée est juste le jour où on
 * l'écrit* — c'est le défaut que ce ticket répare, on ne le réintroduit pas
 * trois lignes plus bas.
 */
const DERIVED_ROLES: readonly UserRole[] = ['customer', 'tenant'];
const PROFESSIONAL_ROLES: readonly UserRole[] = USER_ROLES.filter(
  (r) => !DERIVED_ROLES.includes(r),
);

/**
 * Vrai pour un compte qui n'est QUE client : aucun profil professionnel, ni
 * agence, ni bailleur, ni courtier, ni prestataire, ni plateforme.
 *
 * ⚠ **C'est ce prédicat, et non `isCustomer`, qui DISCRIMINE depuis TCK-492.**
 * `customer` est devenu le plancher de toute identité authentifiée : `isCustomer`
 * rend désormais `true` pour un agent, un administrateur et un super-admin. Il
 * répond à « ce compte peut-il agir en client ? » — une question dont la réponse
 * est toujours oui — là où huit sites lui demandaient en réalité « ce compte
 * est-il un client ET RIEN D'AUTRE ? ».
 *
 * La nuance n'est pas théorique : `buildNavItems` enchaîne
 * `if (isCustomer) … else if (isOwner) … else if (isAgent)`. Sous la nouvelle
 * sémantique, la première branche aurait toujours gagné et un agent aurait reçu
 * le menu d'un acheteur. *Élargir le sens d'un prédicat sans relire ses
 * appelants déplace le défaut au lieu de le corriger.*
 */
export function isCustomerOnly(roles: UserRole[]): boolean {
  return !PROFESSIONAL_ROLES.some((r) => roles.includes(r));
}

export function isAdmin(roles: UserRole[]): boolean {
  return roles.includes('agency_admin') || roles.includes('super_admin');
}

/**
 * TCK-270 — Strict agency_admin check (excludes super_admin so the branding
 * banner doesn't pop up when a super-admin impersonates a tenant.).
 */
export function isAgencyAdmin(roles: UserRole[]): boolean {
  return roles.includes('agency_admin');
}

export function isSuperAdmin(roles: UserRole[]): boolean {
  return roles.includes('super_admin');
}

export function isServiceProvider(roles: UserRole[]): boolean {
  return roles.includes('service_provider');
}

export function isTenant(roles: UserRole[]): boolean {
  return roles.includes('tenant');
}

/**
 * Le rôle le plus « fort » que porte ce compte, du plus privilégié au plus
 * commun.
 *
 * ⚠ `Record<UserRole, number>` est EXHAUSTIF : ajouter une valeur à `UserRole`
 * sans lui donner de rang ici casse la compilation. La version précédente était
 * un tableau littéral, que `tsc` ne pouvait pas juger incomplet. C'est le patron
 * déjà retenu pour `TYPE_RANK` dans `ProfileSwitcher` (TCK-329), et c'est lui
 * qui a signalé le retrait de `broker` (TCK-495) plutôt que de le laisser
 * passer : une clé de trop dans une table exhaustive est une erreur `tsc`, pas
 * un rang inerte.
 */
const RANG: Record<UserRole, number> = {
  super_admin: 0,
  agency_admin: 1,
  agent: 2,
  owner: 3,
  service_provider: 4,
  tenant: 5,
  customer: 6,
};

export function getPrimaryRole(roles: UserRole[]): UserRole | null {
  const priority = (Object.keys(RANG) as UserRole[]).sort((a, b) => RANG[a] - RANG[b]);
  return priority.find((r) => roles.includes(r)) ?? null;
}
