/**
 * TCK-2638 (décision du team-lead, 2026-11-14) — ce que la fiche PUBLIQUE dit du statut d'un bien.
 *
 * `published` (« Validé », ADR-0097 § 4) est un état de modération interne, et `available` ne dit
 * rien qu'un bien affiché ne dise déjà : un bien en ligne est visible par définition. Le visiteur ne
 * lit donc le statut que lorsqu'il l'informe (réservé, vendu, loué…). Sans `status`, l'écran ne
 * devine pas : rien.
 */
const STATUTS_TUS_AU_VISITEUR: ReadonlySet<string> = new Set(['published', 'available']);

export function statutPourLeVisiteur(property: {
  readonly status: string | null;
  readonly status_label: string;
}): string | null {
  if (!property.status || STATUTS_TUS_AU_VISITEUR.has(property.status)) return null;
  return property.status_label || null;
}
