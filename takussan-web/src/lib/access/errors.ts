/**
 * L'erreur que la vérification d'agence relance quand l'API n'a pas répondu.
 *
 * Elle existe pour être RECONNUE par la frontière d'erreur. Sans elle, `(dashboard)/error.tsx`
 * — qui attrape tout ce qui remonte du segment — affichait à propos de N'IMPORTE QUELLE panne
 * une explication portant sur les accès de l'agence. Un bug de rendu dans
 * `/app/properties/[id]` donnait donc à l'utilisateur un diagnostic positivement faux.
 *
 * *Une frontière large qui affirme une cause étroite se trompe partout sauf à un endroit.*
 */
export class AgencyVerificationError extends Error {
  readonly name = 'AgencyVerificationError';

  constructor(public readonly cause: unknown) {
    super('agency verification unavailable');
  }
}

/** Reconnaissable après sérialisation par Next (qui ne transporte que `message`/`digest`). */
export const MARQUEUR_AGENCE = '[agency-verification]';
