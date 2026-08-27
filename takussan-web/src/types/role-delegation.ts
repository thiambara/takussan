/**
 * TCK-369 — délégation temporaire de rôle, côté front.
 *
 * Le contrat est **entièrement posé par TCK-108** : ces types transcrivent
 * `App\Http\Resources\Permissions\RoleDelegationResource`, ils n'inventent
 * rien. Toute divergence est un bug de ce fichier, pas du backend.
 *
 * ⚠️ La ressource émet AUSSI `role_label` et `status_label` — deux libellés
 * **en français en dur, écrits dans le PHP** (`translateRole` /
 * `translateStatus`). Ils sont délibérément absents de ce type : le principe
 * non négociable n°5 du `CLAUDE.md` dit que le texte affiché appartient au
 * front, via next-intl. Les typer ici, c'est les rendre tentants ; ne pas les
 * typer, c'est rendre leur usage impossible sans le décider explicitement.
 * (Corriger la ressource est du backend, hors périmètre de ce ticket.)
 */

/** Les quatre valeurs de `App\Models\Enums\RoleDelegationStatus`. */
export type RoleDelegationStatus = 'scheduled' | 'active' | 'expired' | 'revoked';

/**
 * L'ordre d'affichage, et il n'est pas alphabétique : une délégation qui
 * PRODUIT des droits en ce moment se lit avant une qui n'en produit plus.
 */
export const ROLE_DELEGATION_STATUSES: readonly RoleDelegationStatus[] = [
  'active',
  'scheduled',
  'expired',
  'revoked',
] as const;

/** Une délégation encore vivante — la révoquer a un effet. */
export function estDelegationRevocable(statut: RoleDelegationStatus): boolean {
  return statut === 'active' || statut === 'scheduled';
}

/**
 * Les rôles délégables — miroir de `config('role_delegations.delegable_roles')`.
 *
 * Recopié et non déduit : aucun endpoint ne sert ce catalogue. Le `Rule::in`
 * du `StoreRoleDelegationRequest` reste l'arbitre — cette liste ne fait que
 * choisir ce qu'on PROPOSE, et un écart rendrait un 422 lisible
 * (`role_delegations.validation.non_delegable_role`), jamais un accès.
 */
export const DELEGABLE_ROLES = ['agency_admin', 'agent', 'owner'] as const;

export type DelegableRole = (typeof DELEGABLE_ROLES)[number];

/** Le sous-objet `user` / `delegator` de la ressource — jamais le `User` complet. */
export interface RoleDelegationParty {
  readonly id: number;
  readonly first_name: string;
  readonly last_name: string;
  /** Présent sur `user`, absent de `delegator` : la ressource ne l'expose pas. */
  readonly email?: string;
}

export interface RoleDelegation {
  readonly id: number;
  readonly user_id: number;
  readonly user?: RoleDelegationParty;
  readonly delegator_id: number;
  readonly delegator?: RoleDelegationParty;
  readonly agency_id: number;
  /**
   * `string` et non `DelegableRole` : la colonne est libre côté base, et une
   * délégation créée avant un resserrement de la config porterait une valeur
   * hors catalogue. L'affichage doit savoir retomber sur la valeur brute.
   */
  readonly role: string;
  readonly status: RoleDelegationStatus;
  readonly starts_at: string | null;
  readonly ends_at: string | null;
  readonly reason: string | null;
  readonly activated_at: string | null;
  readonly expired_at: string | null;
  readonly revoked_at: string | null;
  readonly created_at: string | null;
  readonly updated_at: string | null;
}

/** Le corps de `POST /api/agencies/{agency}/role-delegations`. */
export interface CreateRoleDelegationInput {
  readonly user_id: number;
  readonly role: DelegableRole;
  /** `null` = « tout de suite » — le backend crée alors la délégation `active`. */
  readonly starts_at: string | null;
  readonly ends_at: string;
  readonly reason: string | null;
}
