import { z } from 'zod';
import { msgValidation } from './messages';

/**
 * Document schemas — TCK-062.
 *
 * Mirrors the backend `DocumentController::store` validation (name, type,
 * documentable_*, optional description/expiry_date) and the share-link
 * validation (`expires_at`, `max_downloads`, optional password).
 */

export const documentTypeSchema = z.enum([
  'id_card',
  'passport',
  'lease_contract',
  'receipt',
  'invoice',
  'insurance',
  'inventory_report',
  'photo',
  'other',
]);

export const documentableTypeSchema = z.enum([
  'property',
  'lease',
  'booking',
  'customer',
  'user',
  'agency',
  'inventory',
]);

export const documentUploadSchema = z.object({
  name: z
    .string({ error: msgValidation('document.nameRequired') })
    .trim()
    .min(1, msgValidation('document.nameRequired'))
    .max(255, msgValidation('document.nameTooLong')),
  type: documentTypeSchema,
  documentable_type: documentableTypeSchema,
  documentable_id: z
    .number({ error: msgValidation('document.relatedRequired') })
    .int()
    .positive(msgValidation('document.relatedRequired')),
  description: z.string().trim().max(5000).optional().or(z.literal('')),
  expiry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, msgValidation('common.dateInvalid'))
    .optional()
    .or(z.literal('')),
});

export type DocumentUploadFormValues = z.infer<typeof documentUploadSchema>;

const isoDateTime = z
  .string()
  .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), {
    message: msgValidation('document.expiryInvalid'),
  });

export const shareLinkSchema = z.object({
  /**
   * TTL choisi par l'utilisateur. Converti en `expires_at` ISO avant envoi.
   */
  ttl: z.enum(['1h', '24h', '7d', '30d', 'custom']).default('24h'),
  expires_at: isoDateTime.optional(),
  max_downloads: z
    .number({ error: msgValidation('document.maxDownloadsInteger') })
    .int()
    .min(1, msgValidation('document.maxDownloadsMin'))
    .max(10000)
    .optional(),
  password: z.string().min(4, msgValidation('document.passwordTooShort')).optional().or(z.literal('')),
});

export type ShareLinkFormValues = z.infer<typeof shareLinkSchema>;
