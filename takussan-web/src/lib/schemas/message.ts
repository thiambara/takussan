import { z } from 'zod';
import { msgValidation } from './messages';

/**
 * Messaging-related schemas (TCK-045).
 *
 * Aligned with `docs/models-spec.md#18-conversation-`, `#20-message-`.
 */

const MAX_BODY = 4000;

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, msgValidation('message.bodyRequired'))
    .max(MAX_BODY, msgValidation('message.bodyTooLong', { max: String(MAX_BODY) })),
});

export type SendMessageFormValues = z.infer<typeof sendMessageSchema>;

export const createConversationSchema = z.object({
  property_id: z.number().int().positive().optional(),
  lease_id: z.number().int().positive().optional(),
  subject: z
    .string()
    .trim()
    .max(255)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  recipient_id: z.number().int().positive().optional(),
  initial_message: z
    .string()
    .trim()
    .min(1, msgValidation('message.initialRequired'))
    .max(MAX_BODY),
});

export type CreateConversationFormValues = z.infer<typeof createConversationSchema>;

/**
 * Allowed upload types — mirrors the TCK-045 constraint
 * (images, PDF, doc/docx, 10 MB max).
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

/**
 * `reason` est une CLÉ de message (`validation.message.…`), jamais un libellé — TCK-292,
 * 2026-08-22.
 *
 * Les deux libellés français rendus ici arrivaient TELS QUELS à l'écran, dans les trois langues :
 * `ChatView.tsx` fait `setAttachmentError(validation.reason ?? t('chat.attachmentRejected'))` et
 * le `??` ne se déclenche JAMAIS — `reason` est toujours posé quand `ok` vaut `false`. Le repli
 * traduit était donc mort. La résolution se fait désormais à l'appel, par
 * `traduireMessageValidation` (cf. l'en-tête de `./messages.ts` pour la raison du détour).
 */
export function isAllowedAttachment(file: File): {
  ok: boolean;
  reason?: string;
} {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: msgValidation('message.attachmentTooLarge') };
  }
  if (!ALLOWED_ATTACHMENT_MIME.includes(file.type as (typeof ALLOWED_ATTACHMENT_MIME)[number])) {
    return { ok: false, reason: msgValidation('message.attachmentUnsupportedFormat') };
  }
  return { ok: true };
}
