import { z } from 'zod';
import {
  emailSchema,
  passwordSchema,
  requiredStringSchema,
} from './common';

/**
 * Auth-related Zod schemas, aligned with the Laravel FormRequest rules
 * in `takussan-api/app/Http/Requests/Auth/*`.
 */

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Le mot de passe est requis.'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    first_name: requiredStringSchema('Le prénom est requis.').max(
      100,
      'Le prénom est trop long.',
    ),
    last_name: requiredStringSchema('Le nom est requis.').max(
      100,
      'Le nom est trop long.',
    ),
    email: emailSchema,
    password: passwordSchema,
    password_confirmation: z.string().min(1, 'La confirmation est requise.'),
    accept_cgu: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (!data.accept_cgu) {
      ctx.addIssue({
        code: 'custom',
        path: ['accept_cgu'],
        message: 'Vous devez accepter les conditions générales.',
      });
    }
    if (data.password !== data.password_confirmation) {
      ctx.addIssue({
        code: 'custom',
        path: ['password_confirmation'],
        message: 'Les mots de passe ne correspondent pas.',
      });
    }
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
