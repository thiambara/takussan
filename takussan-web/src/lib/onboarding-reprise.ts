import type { Profile, ProfileType } from '@/types/profile';

/**
 * TCK-589 — le profil sur lequel monter un assistant d'onboarding (owner, agent, prestataire).
 *
 * Les liens de reprise portent l'identifiant du profil (`src/lib/wizard-drafts.ts` : `?owner=`,
 * `?agent=`, `?sp=`), mais les trois pages prenaient le PREMIER profil du type sans lire le
 * paramètre : invité par une deuxième agence, on était renvoyé sur le profil déjà finalisé de la
 * première.
 *
 *  1. le profil que désigne le paramètre de reprise, s'il est bien à ce compte et de ce type ;
 *  2. à défaut, le premier profil du type encore à compléter ;
 *  3. à défaut, `null` — la page renvoie vers `/app`.
 *
 * « À compléter » : `draft` est le statut des trois enums de profil côté API
 * (`AgentProfileStatus`, `OwnerProfileStatus`, `ServiceProviderProfileStatus`) ; `pending` est
 * accepté aussi, c'est le mot du ticket.
 */
const A_COMPLETER: ReadonlySet<string> = new Set(['draft', 'pending']);

export function profilAReprendre(
  profils: readonly Profile[],
  type: ProfileType,
  parametre: string | string[] | undefined,
): Profile | null {
  const duType = profils.filter((p) => p.type === type);
  const brut = Array.isArray(parametre) ? parametre[0] : parametre;
  if (brut !== undefined && /^\d+$/.test(brut)) {
    const designe = duType.find((p) => p.numeric_id === Number(brut));
    if (designe) return designe;
  }
  return duType.find((p) => p.status !== null && A_COMPLETER.has(p.status)) ?? null;
}
