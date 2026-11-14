import { z } from 'zod';
import {
  emailSchema,
  passwordSchema,
} from './common';
import { msgValidation } from './messages';

/**
 * Auth-related Zod schemas, aligned with the Laravel FormRequest rules
 * in `takussan-api/app/Http/Requests/Auth/*`.
 */

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, msgValidation('common.passwordRequired')),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * TCK-2606 (TCK-2605 côté API) — l'inscription par e-mail en trois contrôles : l'adresse, le mot de
 * passe (l'œil remplace la confirmation), les conditions. Le prénom est demandé à l'écran suivant
 * (`/onboarding/intention`, `EtapePrenom`), comme pour un compte né par téléphone ou par Google.
 */
export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    accept_cgu: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (!data.accept_cgu) {
      ctx.addIssue({
        code: 'custom',
        path: ['accept_cgu'],
        message: msgValidation('auth.acceptTerms'),
      });
    }
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
