import { z } from 'zod';
import {
  emailSchema,
  passwordSchema,
  requiredStringSchema,
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

export const registerSchema = z
  .object({
    first_name: requiredStringSchema(msgValidation('common.firstNameRequired')).max(
      100,
      msgValidation('common.firstNameTooLong'),
    ),
    last_name: requiredStringSchema(msgValidation('common.lastNameRequired')).max(
      100,
      msgValidation('common.lastNameTooLong'),
    ),
    email: emailSchema,
    password: passwordSchema,
    password_confirmation: z.string().min(1, msgValidation('auth.passwordConfirmationRequired')),
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
    if (data.password !== data.password_confirmation) {
      ctx.addIssue({
        code: 'custom',
        path: ['password_confirmation'],
        message: msgValidation('auth.passwordMismatch'),
      });
    }
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
