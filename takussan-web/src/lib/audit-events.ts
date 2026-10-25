/**
 * Les événements d'audit qui ont un libellé (`admin.audit.events.*`), et le libellé d'une entrée.
 *
 * TCK-601 — jusqu'ici le journal ne connaissait que les quatre événements de modèle, affichés tels
 * quels (`created`…) ; les événements métier (`agent_suspended`, `role_capabilities_changed`,
 * `personal_data_viewed`…) arrivaient en `snake_case` brut.
 *
 * P06.09 (TCK-2336) — l'écran affiche l'événement TRADUIT, et la description brute seulement pour
 * un événement sans clé : l'API écrit ses descriptions en français, en anglais ou en code
 * (`->log('Exported audit trail')`, `->log('role_assigned')`). La description reste dans l'export,
 * que l'API produit. Un événement absent de cette liste n'est jamais caché : il se lit par sa
 * description, ou à défaut par sa valeur d'API.
 */
export const KNOWN_AUDIT_EVENTS = [
  'created',
  'updated',
  'deleted',
  'exported',
  'agent_suspended',
  'agent_removed',
  'agent_reactivated',
  'role_capabilities_changed',
  'role_created',
  'role_assigned',
  'personal_data_viewed',
  'kyc_expired',
  'data_exported',
] as const;
export type KnownAuditEvent = (typeof KNOWN_AUDIT_EVENTS)[number];

export function isKnownAuditEvent(event: string | null): event is KnownAuditEvent {
  return event !== null && (KNOWN_AUDIT_EVENTS as readonly string[]).includes(event);
}

/**
 * Le libellé d'une entrée : l'événement traduit par `traduire` s'il a sa clé, sinon la description
 * brute, sinon la valeur d'API ; `null` quand l'entrée ne porte ni l'un ni l'autre, et l'appelant
 * choisit alors son repli.
 */
export function libelleEvenementAudit(
  entree: { readonly event: string | null; readonly description: string | null },
  traduire: (event: KnownAuditEvent) => string,
): string | null {
  if (isKnownAuditEvent(entree.event)) return traduire(entree.event);
  return entree.description || entree.event || null;
}
