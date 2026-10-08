/**
 * TCK-590 — la demande de contact déposée sans compte (`AnonymousLeadDialog`).
 *
 * Un téléphone OU un e-mail : l'e-mail obligatoire écartait le visiteur qui n'a qu'un téléphone,
 * c'est-à-dire l'essentiel du public. `source` / `medium` : la source d'arrivée retenue pour la
 * session (`lib/attribution.ts`).
 *
 * Le type vit ici et non dans le composant : le module d'actions serveur l'importe, et un import
 * vers un composant client tirerait ses espaces de traduction dans toutes les frontières qui
 * atteignent ce module.
 */
export interface AnonymousLeadPayload {
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
  readonly message: string;
  readonly company?: string;
  readonly source?: string;
  readonly medium?: string;
}
