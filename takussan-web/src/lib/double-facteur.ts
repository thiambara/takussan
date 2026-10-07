import { ApiError } from '@/lib/api';
import { isSuperAdmin } from '@/lib/roles';
import type { User } from '@/types/user';

/**
 * TCK-589 — le second facteur, côté front (ADR-0033).
 *
 * Deux refus de l'API portent un code stable, et tous deux se RÉSOLVENT sur place au lieu d'un
 * message d'erreur :
 *  - `two_factor_required` — l'action exige un second facteur que le compte n'a pas : on le fait
 *    configurer, puis on rejoue ;
 *  - `two_factor_step_up_required` — le compte en a un, mais pas de preuve récente : on demande un
 *    code (`POST /api/auth/two-factor/step-up`), puis on rejoue.
 */
export const CODES_DOUBLE_FACTEUR = ['two_factor_required', 'two_factor_step_up_required'] as const;
export type CodeDoubleFacteur = (typeof CODES_DOUBLE_FACTEUR)[number];

/** Le code de second facteur que porte ce refus, ou `null` s'il ne s'agit pas de ça. */
export function codeDoubleFacteur(err: unknown): CodeDoubleFacteur | null {
  if (!(err instanceof ApiError) || err.status !== 403) return null;
  const data = err.data;
  if (!data || typeof data !== 'object' || !('code' in data)) return null;
  const code = (data as { code?: unknown }).code;
  return (CODES_DOUBLE_FACTEUR as readonly unknown[]).includes(code) ? (code as CodeDoubleFacteur) : null;
}

export const ENROLEMENT_SUPER_ADMIN_COOPTE = '/onboarding/super-admin';
export const ENROLEMENT_DOUBLE_FACTEUR = '/onboarding/securite';

type CompteDoubleFacteur = Pick<User, 'roles' | 'two_factor_enabled'> &
  Partial<Pick<User, 'force_2fa_at_first_login' | 'force_2fa_reconfigure'>>;

/**
 * Où ce compte doit aller configurer son second facteur avant toute console, ou `null`.
 *
 * ⚠ **Toute la décision vit ici** : le layout `(dashboard)`, celui du super-admin et la page
 * d'enrôlement l'appellent tous. Trois juges écrits à la main se seraient contredits — et une
 * contradiction entre « tu dois t'enrôler » et « tu n'as rien à faire ici » est une boucle de
 * redirections.
 *
 *  1. Super-admin coopté pas encore enrôlé : son propre parcours (le rôle n'est attaché qu'à la
 *     confirmation, TCK-264).
 *  2. Second facteur réinitialisé par le support (`force_2fa_reconfigure`), quel que soit le rôle.
 *  3. Super-admin sans second facteur : la console de la plateforme ne s'ouvre pas sans.
 */
export function configurationDoubleFacteurExigee(user: CompteDoubleFacteur): string | null {
  if (user.force_2fa_at_first_login) return ENROLEMENT_SUPER_ADMIN_COOPTE;
  if (user.force_2fa_reconfigure) return ENROLEMENT_DOUBLE_FACTEUR;
  if (isSuperAdmin(user.roles) && !user.two_factor_enabled) return ENROLEMENT_DOUBLE_FACTEUR;
  return null;
}

/** Résout un refus de second facteur sur place : `true` quand l'action peut être rejouée. */
export type GardeDoubleFacteurFn = (code: CodeDoubleFacteur) => Promise<boolean>;

/**
 * Exécute `appel`, et si l'API le refuse pour un second facteur, passe la main à `garde` puis
 * REJOUE l'appel. Deux passages au plus : un enrôlement peut être suivi d'une demande de preuve
 * récente. Sans garde (rendu hors console), le refus remonte tel quel — comme avant.
 */
export async function avecGardeDoubleFacteur<T>(
  appel: () => Promise<T>,
  garde: GardeDoubleFacteurFn | null,
): Promise<T> {
  for (let passage = 0; ; passage++) {
    try {
      return await appel();
    } catch (err) {
      const code = codeDoubleFacteur(err);
      if (code === null || garde === null || passage >= 2) throw err;
      if (!(await garde(code))) throw err;
    }
  }
}
