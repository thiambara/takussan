import { z } from 'zod';
import { msgValidation } from './messages';

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
  .min(1, msgValidation('common.emailRequired'))
  .email(msgValidation('common.emailInvalid'))
  .max(255, msgValidation('common.emailTooLong'))
  .transform((v) => v.toLowerCase());

/**
 * Password — backend enforces min 8 chars (sanctum default). We also
 * require at least one letter and one digit so users don't send trivial
 * passwords.
 */
export const passwordSchema = z
  .string()
  .min(1, msgValidation('common.passwordRequired'))
  .min(8, msgValidation('common.passwordMin'))
  .max(72, msgValidation('common.passwordMax'))
  .regex(/[A-Za-z]/, msgValidation('common.passwordLetter'))
  .regex(/\d/, msgValidation('common.passwordDigit'));

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
    msgValidation('common.phoneInvalid'),
  );

/**
 * Optional phone — accepts empty string, absent key, or `undefined`, and
 * returns `undefined` for all three.
 *
 * ⚠️ Le `.optional()` FINAL n'est pas redondant avec celui de `phoneSchema`
 * à l'intérieur du `pipe`, et son absence était un défaut : un `pipe` porte
 * le type de son ENTRÉE, ici `string`. Le champ était donc **obligatoire**
 * dans tout objet qui l'utilisait — ce que son nom dit exactement l'inverse.
 *
 * zod ≤ 4.3.6 masquait la faute : il jugeait l'optionalité d'une clé d'objet
 * sur le type de SORTIE du pipe (`string | undefined`), et acceptait donc la
 * clé absente. zod 4.4 la juge sur l'entrée, ce qui est correct, et
 * `guarantorSchema.safeParse({ first_name, last_name })` s'est mis à rendre
 * « expected string, received undefined » sur `phone`.
 *
 * Ce n'était donc pas une régression de zod : c'est notre schéma qui était
 * faux, et une mise à jour de dépendance qui l'a rendu visible. Le
 * `.optional()` de tête court-circuite le pipe sur `undefined` ; l'empilement
 * des deux couvre les trois entrées, et un numéro réellement invalide
 * continue de rougir.
 */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .pipe(phoneSchema.optional())
  .optional();

/**
 * Non-empty string with trim.
 */
export const requiredStringSchema = (message = msgValidation('common.required')) =>
  z.string().trim().min(1, message);
