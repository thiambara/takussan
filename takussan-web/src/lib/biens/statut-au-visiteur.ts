import type { Traducteur } from '@/components/property-form/options';
import { libelleDeBien } from '@/lib/biens/libelles-de-bien';

/**
 * TCK-2638 (décision du team-lead, 2026-11-14) — ce que la fiche PUBLIQUE dit du statut d'un bien.
 *
 * `published` (« Validé », ADR-0097 § 4) est un état de modération interne, et `available` ne dit
 * rien qu'un bien affiché ne dise déjà : un bien en ligne est visible par définition. Le visiteur ne
 * lit donc le statut que lorsqu'il l'informe (en attente, vendu, loué…). Sans `status`, l'écran ne
 * devine pas : rien.
 *
 * TCK-351 — le libellé vient du dictionnaire du front (`property.status`), jamais de l'API : `t` est
 * borné à cet espace de noms.
 */
const STATUTS_TUS_AU_VISITEUR: ReadonlySet<string> = new Set(['published', 'available']);

export function statutPourLeVisiteur(property: { readonly status: string | null }, t: Traducteur): string | null {
  if (!property.status || STATUTS_TUS_AU_VISITEUR.has(property.status)) return null;
  return libelleDeBien(t, 'status', property.status);
}
