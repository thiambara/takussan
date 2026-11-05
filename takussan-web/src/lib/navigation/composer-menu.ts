import type { LucideIcon } from 'lucide-react';
import { CATALOGUE, cleDe, iconeDe, type Destination, type IdDestination } from './catalogue';
import { DISPOSITIONS, type Disposition } from './dispositions';
import type { Persona } from './personas';
import type { ContexteDeMenu, NavCounterKey, NavSection } from './types';

/** Une entrée prête à rendre : la forme de `NavItem` (`AppSidebar`), plus son identifiant. */
export interface EntreeComposee {
  readonly id: IdDestination;
  readonly href: string;
  readonly labelKey: string;
  readonly icon: LucideIcon;
  readonly section: NavSection;
  readonly emphasized?: boolean;
  readonly counterKey?: NavCounterKey;
}

const PAR_ID: ReadonlyMap<string, Destination & { readonly id: IdDestination }> = new Map(
  CATALOGUE.map((d) => [d.id, d]),
);

/**
 * TCK-2477 (ADR-0089 §4) — LE menu : une fonction pure du compte et de la disposition.
 *
 * 1. Les groupes de la disposition, dans leur ordre : une entrée n'y paraît que si elle est
 *    accessible, et une seule fois par `href` (« Publier » et « Proposer » se le partagent).
 * 2. Toute destination accessible que la disposition ne place pas tombe sous « Plus » : une
 *    destination n'est jamais PERDUE.
 * 3. Un identifiant inconnu (préférence périmée, destination retirée) est ignoré.
 *
 * La section d'agence n'est pas composée ici : `avecSectionAgence` l'ajoute depuis `PAGES_ADMIN`.
 */
export function composerMenu(ctx: ContexteDeMenu, disposition: Disposition): EntreeComposee[] {
  const sortie: EntreeComposee[] = [];
  const hrefsPris = new Set<string>();
  const places = new Set<string>();

  const poser = (destination: Destination & { readonly id: IdDestination }, section: NavSection) => {
    if (hrefsPris.has(destination.href) || !destination.accessible(ctx)) return;
    hrefsPris.add(destination.href);
    sortie.push({
      id: destination.id,
      href: destination.href,
      labelKey: cleDe(destination, ctx),
      icon: iconeDe(destination, ctx),
      section,
      ...(destination.misEnAvant ? { emphasized: true } : {}),
      ...(destination.compteur ? { counterKey: destination.compteur } : {}),
    });
  };

  for (const groupe of disposition.groupes) {
    for (const id of groupe.entrees) {
      places.add(id);
      const destination = PAR_ID.get(id);
      if (destination) poser(destination, groupe.id);
    }
  }
  for (const destination of CATALOGUE) {
    if (!places.has(destination.id)) poser(destination, 'plus');
  }
  return sortie;
}

export function menuDuPersona(ctx: ContexteDeMenu, persona: Persona): EntreeComposee[] {
  return composerMenu(ctx, DISPOSITIONS[persona]);
}
