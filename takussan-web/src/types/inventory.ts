/**
 * Backend contract: see `takussan-api` →
 *   - `App\Models\Enums\InventoryType|Status|Condition|ElementState`
 *   - `App\Http\Resources\InventoryResource`
 *   - `App\Http\Requests\InventoryStoreRequest` (rooms JSON schema)
 *   - `routes/api/inventories.php`
 *
 * Column names follow `docs/models-spec.md §24` (spec is source of truth) —
 * `type` ∈ {move_in, move_out}, `rooms` (JSON), `conducted_by`,
 * `tenant_signed_at`, `owner_signed_at`.
 */

export type InventoryType = 'move_in' | 'move_out';

export type InventoryStatus = 'draft' | 'pending_signature' | 'signed' | 'disputed';

export type InventoryCondition = 'excellent' | 'good' | 'fair' | 'poor';

/** French-language enum values — match the tenant-facing vocabulary. */
export type InventoryElementState = 'bon' | 'usé' | 'endommagé' | 'manquant';

export const INVENTORY_TYPES: readonly InventoryType[] = ['move_in', 'move_out'] as const;

export const INVENTORY_STATUSES: readonly InventoryStatus[] = [
  'draft',
  'pending_signature',
  'signed',
  'disputed',
] as const;

export const INVENTORY_CONDITIONS: readonly InventoryCondition[] = [
  'excellent',
  'good',
  'fair',
  'poor',
] as const;

export const INVENTORY_ELEMENT_STATES: readonly InventoryElementState[] = [
  'bon',
  'usé',
  'endommagé',
  'manquant',
] as const;

export interface InventoryElement {
  readonly label: string;
  /**
   * TCK-2647 — `null` tant que l'élément n'est pas qualifié : un brouillon de terrain part des éléments
   * PROPOSÉS par le modèle, et chacun se qualifie d'un toucher. La soumission refuse un état nul.
   */
  readonly state: InventoryElementState | null;
  readonly notes?: string | null;
  /** TCK-2646 — sortie seulement, posés par le serveur (en lecture) : l'état et la note de l'entrée reprise. */
  readonly entry_state?: InventoryElementState | null;
  readonly entry_notes?: string | null;
  readonly entry_photo_id?: number | null;
  /** TCK-2646 — `show` seulement : la vignette signée de la photo d'entrée de l'élément ou de sa pièce. */
  readonly entry_thumbnail_url?: string;
  /** TCK-2646 — sortie seulement : la retenue proposée sur la caution, en XOF (une proposition, pas un débit). */
  readonly retention_amount?: number | string | null;
  readonly retention_reason?: string | null;
}

export interface InventoryRoom {
  readonly name: string;
  readonly condition: InventoryCondition;
  readonly notes?: string | null;
  readonly elements?: readonly InventoryElement[];
  /** TCK-2647 — la pièce a été parcourue (« Pièce suivante ») : la reprise ouvre la première qui ne l'est pas. */
  readonly completed?: boolean | null;
}

/** TCK-182 — eager-loaded relation summaries served via `include=`. */
export interface InventoryPropertyLite {
  readonly id: number;
  readonly title: string | null;
  readonly slug: string | null;
}

export interface InventoryLeaseLite {
  readonly id: number;
  readonly reference_number: string | null;
}

/** TCK-596 — une photo de pièce, servie par URL signée (collection privée). */
export interface InventoryRoomPhoto {
  readonly id: number;
  readonly url: string;
  /**
   * TCK-2088 — URL signée de la `preview` (600 px) que la grille affiche ; l'original tant que la
   * file ne l'a pas produite. Absente d'une réponse antérieure : la grille retombe sur `url`.
   */
  readonly preview_url?: string;
  readonly room_name: string;
  /** TCK-2646 — la photo d'un ÉLÉMENT de la pièce (un élément abîmé), absente pour une photo de la pièce. */
  readonly element_label?: string | null;
}

/** TCK-596 — `show` seulement : les photos groupées dans l'ordre des pièces. */
export interface InventoryRoomPhotoGroup {
  readonly room_name: string;
  readonly photos: readonly InventoryRoomPhoto[];
}

export interface Inventory {
  readonly id: number;
  readonly lease_id: number;
  readonly property_id: number;
  readonly property?: InventoryPropertyLite | null;
  readonly lease?: InventoryLeaseLite | null;
  readonly type: InventoryType;
  readonly conducted_by: number;
  readonly tenant_id: number | null;
  readonly conducted_at: string | null;
  readonly status: InventoryStatus;
  readonly general_condition: InventoryCondition;
  readonly rooms: readonly InventoryRoom[];
  readonly notes: string | null;
  /** TCK-2646 — l'entrée signée qu'une sortie reprend, et la somme des retenues proposées (nulle pour une entrée). */
  readonly entry_inventory_id?: number | null;
  readonly retention_total?: number | string | null;
  readonly tenant_signed: boolean;
  readonly tenant_signed_at: string | null;
  readonly tenant_signature_hash?: string | null;
  readonly owner_signed: boolean;
  readonly owner_signed_at: string | null;
  readonly owner_signature_hash?: string | null;
  readonly signed_at?: string | null;
  readonly created_at: string;
  // TCK-596 — qui a signé pour le bailleur et pour le compte de qui ; empreinte figée.
  readonly owner_signed_by_user_id?: number | null;
  readonly owner_signed_on_behalf_of_user_id?: number | null;
  readonly traceability_hash?: string | null;
  // TCK-596 — `show` seulement.
  readonly room_photos?: readonly InventoryRoomPhotoGroup[];
  /**
   * Les rôles que l'utilisateur courant peut signer, jugés par l'API (même prédicat que la signature).
   * TCK-2646 — `tenant_onsite` : il peut recueillir sur son téléphone la signature du locataire, par code
   * SMS. Ce n'est PAS un rôle de `POST …/sign` (c'est `tenant` + `code`) : {@link InventorySignatureRole}
   * ne le contient pas.
   */
  readonly can_sign_as?: readonly InventoryCanSignAs[];
  /**
   * TCK-1869 (P189.02) — le verdict d'`InventoryPolicy::update` pour l'utilisateur courant, qui garde
   * la soumission et les photos. Absent, aucun de ces gestes ne s'ouvre.
   * TCK-2648 — `dispute` : `InventoryPolicy::dispute` (les deux parties seules, jamais le personnel ni
   * le super-admin) et un statut contestable. Absent, « Contester » ne s'offre pas.
   */
  readonly abilities?: { readonly update: boolean; readonly dispute?: boolean };
  // TCK-2648 — `show` seulement : les personnes que la fiche nomme (le locataire, le bailleur, et qui a
  // signé pour qui). Les ids ci-dessus restent ; ces objets sont ce qu'on AFFICHE.
  readonly tenant?: InventoryPersonne & { readonly first_name?: string | null } | null;
  readonly landlord?: InventoryPersonne | null;
  readonly tenant_signed_via?: InventoryPersonne | null;
  readonly owner_signed_by?: InventoryPersonne | null;
  readonly owner_signed_on_behalf_of?: InventoryPersonne | null;
  /** TCK-2646 (ADR-0098 §5) — `drawn` depuis son compte, `onsite_otp` sur le téléphone du personnel. */
  readonly tenant_signature_method?: 'drawn' | 'onsite_otp' | null;
  readonly tenant_signed_via_user_id?: number | null;
  readonly tenant_otp_channel?: string | null;
  /** Le numéro masqué auquel le code est parti (« +221 77 ••• 18 90 »). */
  readonly tenant_otp_destination?: string | null;
  /** Le bailleur pour le compte duquel l'utilisateur courant signerait, ou `null` s'il est le bailleur. */
  readonly sign_on_behalf_of?: { readonly id: number; readonly full_name: string } | null;
}

/** TCK-076 — explicit role accepted by `POST /inventories/{id}/sign`. */
export type InventorySignatureRole = 'tenant' | 'landlord';

/** TCK-2646 — ce que `can_sign_as` peut contenir : les rôles de `sign`, plus la voie sur place. */
export type InventoryCanSignAs = InventorySignatureRole | 'tenant_onsite';

/** TCK-2648 — une personne nommée par la fiche. */
export interface InventoryPersonne {
  readonly id: number;
  readonly full_name: string;
}

/** TCK-2646 — `GET /api/inventory-templates` : les pièces et les éléments PROPOSÉS pour un type de bien. */
export type InventoryTemplateKey = 'studio' | 'f2' | 'f3' | 'f4_plus' | 'villa' | 'shop' | 'office' | 'generic';

export const INVENTORY_TEMPLATE_KEYS: readonly InventoryTemplateKey[] = ['studio', 'f2', 'f3', 'f4_plus', 'villa', 'shop', 'office', 'generic'];

export interface InventoryTemplate {
  readonly key: InventoryTemplateKey;
  readonly property_type: string | null;
  readonly rooms: readonly {
    readonly key: string;
    /** Rendu dans la langue de la requête par l'API (arbitrage 1 de TCK-2646). */
    readonly name: string;
    readonly elements: readonly { readonly key: string; readonly label: string }[];
  }[];
}
