/**
 * TCK-597 (ADR-0043 §7) — les codes de motif d'une décision de modération, miroir de l'enum
 * `App\Models\Enums\ModerationReasonCode`. Le front les traduit (`common.moderationReasons.<code>`) ;
 * le texte libre n'est exigé que pour `other`.
 */
export const MODERATION_REASON_CODES = [
  'fraud',
  'spam',
  'misleading',
  'offensive',
  'personal_data',
  'duplicate',
  'conflict_of_interest',
  'off_topic',
  'other',
] as const;

export type ModerationReasonCode = (typeof MODERATION_REASON_CODES)[number];

/** Le complément libre devient obligatoire pour `other`, et pour lui seul. */
export function reasonTextRequired(code: ModerationReasonCode | ''): boolean {
  return code === 'other';
}
