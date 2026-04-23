import { z } from 'zod';

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
    .string({ error: 'Le nom est requis.' })
    .trim()
    .min(1, 'Le nom est requis.')
    .max(255, 'Le nom doit faire 255 caractères au maximum.'),
  type: documentTypeSchema,
  documentable_type: documentableTypeSchema,
  documentable_id: z
    .number({ error: 'Entité liée requise.' })
    .int()
    .positive('Entité liée requise.'),
  description: z.string().trim().max(5000).optional().or(z.literal('')),
  expiry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide.')
    .optional()
    .or(z.literal('')),
});

export type DocumentUploadFormValues = z.infer<typeof documentUploadSchema>;

const isoDateTime = z
  .string()
  .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), {
    message: "Date d'expiration invalide.",
  });

export const shareLinkSchema = z.object({
  /**
   * TTL choisi par l'utilisateur. Converti en `expires_at` ISO avant envoi.
   */
  ttl: z.enum(['1h', '24h', '7d', '30d', 'custom']).default('24h'),
  expires_at: isoDateTime.optional(),
  max_downloads: z
    .number({ error: 'Doit être un entier positif.' })
    .int()
    .min(1, 'Minimum 1 téléchargement.')
    .max(10000)
    .optional(),
  password: z.string().min(4, 'Mot de passe trop court.').optional().or(z.literal('')),
});

export type ShareLinkFormValues = z.infer<typeof shareLinkSchema>;
