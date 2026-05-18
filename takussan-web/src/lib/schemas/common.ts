import { z } from 'zod';

/**
 * Shared Zod schemas aligned with the backend `FormRequest` validation
 * rules (see TCK-051). Keep client rules a strict subset of the server
 * rules — the backend is the source of truth, the client is UX polish.
 *
 * Import these primitives rather than re-declaring them per form, so a
 * password policy change stays in one place.
 */

/**
 * Email — lower-cased, trimmed, RFC-ish.
 *
 * Note: zod v4 renamed `required_error` → `error` on the type constructor,
 * but the `.min(1, ...)` refinement is what actually fires for empty
 * strings coming from a form input, so we rely on that.
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'L’adresse e-mail est requise.')
  .email('Adresse e-mail invalide.')
  .max(255, 'L’adresse e-mail est trop longue.')
  .transform((v) => v.toLowerCase());

/**
 * Password — backend enforces min 8 chars (sanctum default). We also
 * require at least one letter and one digit so users don't send trivial
 * passwords.
 */
export const passwordSchema = z
  .string()
  .min(1, 'Le mot de passe est requis.')
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
  .max(72, 'Le mot de passe ne doit pas dépasser 72 caractères.')
  .regex(/[A-Za-z]/, 'Le mot de passe doit contenir au moins une lettre.')
  .regex(/\d/, 'Le mot de passe doit contenir au moins un chiffre.');

/**
 * Phone — Senegal-friendly E.164-ish: optional `+`, country code then 8+
 * digits. We keep it permissive because agents sometimes enter local
 * formats like `77 123 45 67`. Normalisation to E.164 happens server-side.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^\+?[0-9\s().-]{8,20}$/,
    'Numéro de téléphone invalide. Exemple : +221 77 123 45 67.',
  );

/**
 * Optional phone — accepts empty string and returns `undefined`.
 */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .pipe(phoneSchema.optional());

/**
 * Non-empty string with trim.
 */
export const requiredStringSchema = (message = 'Ce champ est requis.') =>
  z.string().trim().min(1, message);
