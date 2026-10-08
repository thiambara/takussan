import { apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';

/**
 * TCK-504 — les collaborateurs d'un bien et son agent principal. Module sans directive : appelable
 * depuis un composant client comme depuis une action serveur (cf. le piège Next 16 de
 * `takussan-web/CLAUDE.md`).
 *
 * Les deux routes passent par `apiRequest`, donc l'appelant écrit `/api`.
 */

export type CollaboratorRole = 'agent' | 'manager' | 'co_owner' | 'viewer';

/**
 * Pourquoi cette personne répond pour le bien — un CODE, traduit à l'affichage :
 * - `designated` : l'agence l'a désigné ;
 * - `designated_unavailable` : l'agent désigné n'est plus actif ; le repli répond à sa place ;
 * - `invitation_order` : aucun choix (ou le désigné n'est plus actif) ; l'agent invité le premier ;
 * - `owner` : aucun agent actif, le propriétaire répond.
 */
export type PrimaryContactSource = 'designated' | 'designated_unavailable' | 'invitation_order' | 'owner';

export interface PropertyCollaboratorRow {
  readonly id: number;
  readonly user_id: number;
  readonly role: CollaboratorRole;
  readonly is_primary: boolean;
  readonly commission_share: string | null;
  readonly user: {
    readonly id: number;
    readonly first_name: string | null;
    readonly last_name: string | null;
    readonly username: string | null;
  } | null;
}

export interface PropertyCollaboratorsPayload {
  readonly data: PropertyCollaboratorRow[];
  readonly primary_contact: {
    readonly user_id: number | null;
    /** La ligne qui répond réellement ; `null` quand c'est le propriétaire. */
    readonly collaborator_id: number | null;
    /** La ligne marquée, active ou non. */
    readonly designated_collaborator_id: number | null;
    readonly source: PrimaryContactSource | null;
  };
  /** L'appelant peut-il désigner ? La règle de l'endpoint (`update` du bien), dite par le serveur. */
  readonly can_designate: boolean;
}

export const PROPERTY_COLLABORATORS_QUERY_KEY = {
  list: (propertyId: number) => ['property', propertyId, 'collaborators'] as const,
};

export function fetchPropertyCollaborators(
  token: string,
  propertyId: number,
): Promise<PropertyCollaboratorsPayload> {
  return apiRequest<PropertyCollaboratorsPayload>(cheminApi`/api/properties/${propertyId}/collaborators`, { token });
}

/** Désigne l'agent principal. Le serveur refuse tout rôle autre qu'`agent` et tout agent inactif. */
export function designatePrimaryCollaborator(
  token: string,
  propertyId: number,
  collaboratorId: number,
): Promise<PropertyCollaboratorsPayload> {
  return apiRequest<PropertyCollaboratorsPayload>(
    cheminApi`/api/properties/${propertyId}/collaborators/${collaboratorId}/primary`,
    { method: 'PUT', token },
  );
}

export function collaboratorName(row: PropertyCollaboratorRow): string {
  const user = row.user;
  if (!user) return `#${row.user_id}`;
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.username || `#${user.id}`;
}
